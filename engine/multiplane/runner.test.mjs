import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {inside,parseArgs,validateContract,runtimeEnvironment,probeEncoder,mixAudio,execute} from './runner.mjs';

const fixture=()=>({config:{schema:'video-master.multiplane.v1',shot:'shot.html'},
  project:{width:320,height:180,fps:10,duration_seconds:2},
  timeline:{duration_seconds:2,fps:10,tracks:[],cues:[]}});
test('paths, actual backend limits and CLI reject incompatible input before capture',()=>{
  const {config,project,timeline}=fixture();
  assert.doesNotThrow(()=>validateContract(config,project,timeline));
  assert.throws(()=>inside('D:/project','../escape.mp4'),{code:'invalid_path'});
  assert.throws(()=>parseArgs(['render','--workers','2','--workers','4']),{code:'invalid_option'});
  assert.throws(()=>validateContract({...config,requires_async_media:true},project,timeline),{code:'async_media_unsupported'});
  assert.throws(()=>validateContract(config,{...project,finish:{motion_blur:{samples:4}}},timeline),{code:'post_owner_conflict'});
  assert.throws(()=>validateContract(config,project,{...timeline,cues:[{kind:'footage'}]}),{code:'async_media_unsupported'});
});
test('runtime redirects OS temporary files into project without mutating caller environment',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'vm-runtime-'));
  try {
    const env={TEMP:'C:/default-temp',TMP:'C:/default-temp'};
    const result=await runtimeEnvironment(root,env);
    assert.ok(result.TEMP.startsWith(root));assert.equal(env.TEMP,'C:/default-temp');
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
const ffmpeg=process.env.VM_TEST_FFMPEG;
test('real mix preserves independent tracks, ducking and full-duration master', {skip:!ffmpeg},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'vm-audio-'));
  try {
    const env=await runtimeEnvironment(root),src=path.join(root,'tone.wav');
    const generated=await execute(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=2:sample_rate=48000','-c:a','pcm_s16le',src],{env});
    assert.equal(generated.code,0);
    const tl={duration_seconds:2,fps:10,tracks:[{id:'music',muted:false},{id:'voice',muted:false}],cues:[
      {id:'bed',kind:'music',track_id:'music',src:'tone.wav',start_sec:0,end_sec:2,volume:.6,duck_gain:.25},
      // A zero-amplitude voice cue activates ducking without contributing signal.
      {id:'line',kind:'voice',track_id:'voice',src:'tone.wav',start_sec:.5,end_sec:1,volume:1e-8}
    ]};
    const master=await mixAudio(root,tl,ffmpeg,env);
    const raw=path.join(root,'raw.f32');
    const decoded=await execute(ffmpeg,['-v','error','-i',master,'-ac','1','-f','f32le',raw],{env});assert.equal(decoded.code,0);
    const bytes=await fs.readFile(raw);assert.equal(bytes.length/4,96000);
    function rms(a,b){let sum=0;for(let i=Math.round(a*48000);i<Math.round(b*48000);i++)sum+=bytes.readFloatLE(i*4)**2;return Math.sqrt(sum/((b-a)*48000));}
    assert.ok(rms(.7,.9)<rms(.1,.3)*.3);assert.ok(rms(1.5,1.7)>rms(.7,.9)*3);
    assert.equal(await mixAudio(root,tl,ffmpeg,env),master);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
const runtime=process.env.VM_MULTIPLANE_RUNTIME;
test('completed checkpoint is reused after interrupted render and changed worker count', {skip:!runtime||!ffmpeg,timeout:90000},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'vm-resume-'));
  try {
    Object.assign(process.env,await runtimeEnvironment(root));
    const require=createRequire(path.join(runtime,'package.json'));
    const {renderShot}=await import(pathToFileURL(require.resolve('multiplane')));
    await fs.writeFile(path.join(root,'package.json'),'{"type":"module"}');
    await fs.symlink(path.join(runtime,'node_modules'),path.join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
    // Job operations must not depend on a currently editable/invalid project document.
    await fs.writeFile(path.join(root,'timeline.json'),'{incomplete edit');
    await fs.writeFile(path.join(root,'shot.html'),'<!doctype html><style>body{margin:0}#stage{width:320px;height:180px;background:#102130}</style><div id="stage"><canvas width="320" height="180"></canvas></div><script>const c=document.querySelector("canvas").getContext("2d");window.SHOT={duration:2,fps:10,ready:Promise.resolve(),render(t){c.fillStyle="#102130";c.fillRect(0,0,320,180);c.fillStyle="#78e9d7";c.fillRect(20+t*80,50,30,30)}};</script>');
    let jobId;const jobs=path.join(root,'jobs');
    try {
      await renderShot('shot.html',{root,ffmpeg,workers:1,raster:'gpu',out:path.join(root,'result.mp4'),'job-dir':jobs,'no-hosted':true,'no-post':true,
        _segmentFrames:5,_segmentHook:(stage,index)=>{if(stage==='sealed'&&index===0)throw new Error('intentional test interruption');},
        onEvent:event=>{if(event.jobId)jobId=event.jobId}});
    } catch {}
    assert.ok(jobId,'interrupted job exposes identity');
    const adapter=fileURLToPath(new URL('./runner.mjs',import.meta.url));
    const resumed=await execute(process.execPath,[adapter,'resume','--project',root,'--job',path.join(jobs,jobId),'--workers','2'],
      {env:{...process.env,MULTIPLANE_FFMPEG:'deliberately-invalid-new-default.exe'},timeout:60000});
    assert.equal(resumed.code,0,resumed.stdout+'\n'+resumed.stderr);
    const receipt=JSON.parse(await fs.readFile(path.join(root,'validation/result.mp4.json'),'utf8'));
    assert.ok(receipt.resume.framesReused>=5);assert.equal(receipt.outputCheck.frames,20);
    assert.ok(receipt.checks.includes('full FFmpeg decode'));
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
