#!/usr/bin/env node
// Optional backend. Upstream stays an exact-version npm dependency, not vendored runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

export const VERSION = '0.3.13';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const fail = (code, message, details) => Object.assign(new Error(message), {code, details});
export function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw fail('invalid_path', 'Expected a project-relative path', {relative});
  const resolved = path.resolve(root, relative), rel = path.relative(root, resolved);
  if (rel === '..' || rel.startsWith('..' + path.sep)) throw fail('invalid_path', 'Path leaves the project', {relative});
  return resolved;
}
export async function runtimeEnvironment(root, env = process.env) {
  const base = path.join(root, '.runtime');
  const result = {...env, MULTIPLANE_NO_INDEX: '1', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'};
  for (const [key, folder] of Object.entries({TEMP:'temp', TMP:'temp', MULTIPLANE_HOME:'multiplane',
    PLAYWRIGHT_BROWSERS_PATH:'browsers', npm_config_cache:'npm-cache'})) {
    result[key] = ['TEMP','TMP'].includes(key) ? (env.VIDEO_MASTER_TEMP || path.join(base,folder)) : env[key] || path.join(base, folder);
    if (key !== 'PLAYWRIGHT_BROWSERS_PATH' || result[key] !== '0') await fs.mkdir(result[key], {recursive:true});
  }
  return result;
}
export async function execute(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {windowsHide:true, stdio:['ignore','pipe','pipe'], ...options});
    let stdout = '', stderr = '';
    child.stdout.on('data', bytes => {stdout += bytes;});
    child.stderr.on('data', bytes => {stderr = (stderr + bytes).slice(-24000);});
    const timer = setTimeout(() => child.kill(), options.timeout ?? 30000);
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('close', code => {clearTimeout(timer); resolve({code, stdout, stderr});});
  });
}
export async function probeEncoder(ffmpeg, encoder = 'x264', env = process.env) {
  const codec = {'x264':'libx264', 'nvenc-h264':'h264_nvenc', 'nvenc-hevc':'hevc_nvenc'}[encoder];
  if (!codec) throw fail('invalid_encoder', 'Unsupported encoder', {encoder});
  const result = await execute(ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i',
    'color=c=black:s=64x64:r=30:d=0.2','-an','-c:v',codec,
    ...(encoder === 'x264' ? [] : ['-preset','p7','-tune','hq']),
    '-fps_mode','passthrough','-f','null','-'], {env});
  if (result.code !== 0) throw fail('encoder_probe_failed', 'FFmpeg encoder could not actually encode. No backend or codec was substituted.',
    {ffmpeg, encoder, exitCode:result.code, stderr:result.stderr});
  return {ffmpeg, encoder, actualEncode:true};
}
export function validateContract(config, project, timeline) {
  if (config.schema !== 'video-master.multiplane.v1') throw fail('invalid_contract', 'Unknown renderer.json schema');
  for (const key of ['width','height','fps']) if (!Number.isInteger(project[key]) || project[key] <= 0) throw fail('invalid_contract', `Invalid ${key}`);
  if (project.width % 2 || project.height % 2 || !Number.isFinite(project.duration_seconds) || project.duration_seconds <= 0) throw fail('invalid_contract','Invalid dimensions/duration');
  if (timeline.duration_seconds !== project.duration_seconds || timeline.fps !== project.fps || !Array.isArray(timeline.cues) || !Array.isArray(timeline.tracks)) throw fail('invalid_contract', 'Project and timeline disagree');
  // Explicit capability boundary; do not silently export stale HTMLVideoElement frames.
  if (config.requires_async_media || JSON.stringify(timeline).includes('"footage"')) throw fail('async_media_unsupported',
    'This backend requires synchronous per-sample drawing. Keep footage on the existing renderer or implement a deterministic media adapter.');
  if (project.finish && Object.values(project.finish).some(Boolean)) throw fail('post_owner_conflict',
    'Move finish settings to the shot or explicitly implement their ownership before selecting Multiplane.');
  const ids = new Set(), trackIds = new Set(timeline.tracks.map(track => track.id));
  for (const cue of timeline.cues) {
    if (!cue.id || ids.has(cue.id) || !trackIds.has(cue.track_id) || !Number.isFinite(cue.start_sec) ||
      !Number.isFinite(cue.end_sec) || cue.start_sec < 0 || cue.end_sec <= cue.start_sec || cue.end_sec > project.duration_seconds + 1e-7) throw fail('invalid_timeline', 'Invalid cue', {id:cue.id});
    ids.add(cue.id);
    if (['music','voice','sfx'].includes(cue.kind)) {
      if (!cue.src) throw fail('invalid_timeline', 'Audio cue has no source', {id:cue.id});
      for (const key of ['volume','source_offset','fade_in','fade_out']) if (cue[key] != null && (!Number.isFinite(cue[key]) || cue[key] < 0)) throw fail('invalid_timeline', `Invalid ${key}`, {id:cue.id});
      if (cue.duck_gain != null && (cue.duck_gain < 0 || cue.duck_gain > 1 || !Number.isFinite(cue.duck_gain))) throw fail('invalid_timeline','Invalid duck_gain');
    }
  }
}
async function policies(root) {
  // Existing projects use their own gain policy; native projects contain exact copied shared helpers.
  let directory = path.join(root, 'src');
  try {await fs.access(path.join(directory,'audio-mix.js'));}
  catch {
    directory = path.join(HERE,'timeline');
    try {await fs.access(path.join(directory,'audio-mix.js'));}
    catch {directory = path.resolve(HERE,'../../assets/starter-project/src');}
  }
  return { ...await import(pathToFileURL(path.join(directory,'audio-mix.js'))),
    ...await import(pathToFileURL(path.join(directory,'render-window.mjs'))) };
}
export function audioArguments(root, timeline, slices, policy, output) {
  const args = ['-hide_banner','-loglevel','error','-n'], filters = [];
  const speaking = policy.voiceIntervals(timeline), duration = timeline.duration_seconds;
  for (const [i, audio] of slices.entries()) {
    args.push('-i', inside(root,audio.cue.src));
    const gain = policy.mixGainExpression(audio.cue,speaking,audio.source_start_sec);
    const delay = Math.round(audio.start_sec * 1000);
    filters.push(`[${i}:a]atrim=start=${audio.source_offset}:duration=${audio.duration},asetpts=PTS-STARTPTS,volume='${gain}':eval=frame,aformat=channel_layouts=stereo,adelay=${delay}|${delay},apad,atrim=duration=${duration}[a${i}]`);
  }
  filters.push(`${slices.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${slices.length}:dropout_transition=0,volume=${slices.length},alimiter=limit=0.95:level=false,atrim=start=0.005,asetpts=PTS-STARTPTS,apad,atrim=duration=${duration}[mix]`);
  return [...args,'-filter_complex',filters.join(';'),'-map','[mix]','-ar','48000','-c:a','pcm_s24le',output];
}
export async function mixAudio(root, timeline, ffmpeg, env) {
  const policy = await policies(root), full = policy.renderWindow(timeline);
  const slices = policy.audioSlices(timeline, full);
  if (!slices.length) return null;
  for (const slice of slices) await fs.access(inside(root,slice.cue.src));
  const directory = path.join(root,'renders','audio'); await fs.mkdir(directory,{recursive:true});
  // Cache depends on both policies and the actual input bytes, not only path/mtime.
  const hash = createHash('sha256').update(JSON.stringify(timeline)).update(JSON.stringify(slices)).update(String(policy.audioSlices)).update(String(policy.mixGainExpression)).update(String(policy.duckExpression)).update(String(policy.voiceIntervals)).update(String(audioArguments));
  for (const slice of slices) hash.update(await fs.readFile(inside(root,slice.cue.src)));
  const output = path.join(directory,`master-${hash.digest('hex').slice(0,16)}.wav`);
  try {await fs.access(output); return output;} catch {}
  const partial = output + '.partial.wav';
  const result = await execute(ffmpeg,audioArguments(root,timeline,slices,policy,partial),{env,timeout:120000});
  if (result.code !== 0) {await fs.rm(partial,{force:true}); throw fail('audio_mix_failed','Audio premix failed',{stderr:result.stderr});}
  await fs.rename(partial,output); return output;
}
const VALUE_FLAGS = new Set(['project','out','from','to','fps','scale','render-scale','workers','quality','motion-blur','max-motion-blur','shutter','grain','raster','encoder','max-bitrate','at','every','job','ffmpeg']);
const BOOL_FLAGS = new Set(['draft','no-post','no-static-reuse']);
export function parseArgs(args) {
  const command = args[0] || 'help', values = {};
  for (let i=1;i<args.length;i++) {
    const key = args[i].replace(/^--/,'');
    if (!args[i].startsWith('--') || (!VALUE_FLAGS.has(key) && !BOOL_FLAGS.has(key)) || key in values) throw fail('invalid_option',`Unknown or duplicate option: ${args[i]}`);
    if (BOOL_FLAGS.has(key)) values[key] = true;
    else {if (args[i+1] == null || args[i+1].startsWith('--')) throw fail('invalid_option',`Missing ${key}`);values[key]=args[++i];}
  }
  return {command,values};
}
export async function main(args = process.argv.slice(2)) {
  const {command,values} = parseArgs(args);
  if (['help','--help'].includes(command)) {
    console.log('Usage: node tools/multiplane.mjs doctor|lint|inspect|stills|verify|render|resume|status|cancel --project DIR [--out relative-path] [--from SEC --to SEC] [--workers N] [--encoder x264|nvenc-h264|nvenc-hevc] [--job ID-or-directory]');return;
  }
  if (!['doctor','lint','inspect','stills','verify','render','resume','status','cancel'].includes(command)) throw fail('invalid_option',`Unknown command: ${command}`);
  const root = path.resolve(values.project || process.cwd());
  Object.assign(process.env,await runtimeEnvironment(root));
  const require = createRequire(path.join(root,'package.json'));
  let entry;
  try {entry = require.resolve('multiplane');} catch {throw fail('runtime_missing',`Run npm install in ${root}; required multiplane@${VERSION}.`);}
  const metadata = JSON.parse(await fs.readFile(path.resolve(path.dirname(entry),'../package.json'),'utf8'));
  if (metadata.version !== VERSION) throw fail('version_mismatch',`Expected multiplane@${VERSION}, found ${metadata.version}.`);
  const upstream = await import(pathToFileURL(entry));
  const managingJob = ['resume','status','cancel'].includes(command);
  let config = {}, project, timeline;
  if (!managingJob) {
    config = JSON.parse(await fs.readFile(path.join(root,'renderer.json'),'utf8'));
    project = JSON.parse(await fs.readFile(path.join(root,'video.json'),'utf8'));
    timeline = JSON.parse(await fs.readFile(path.join(root,'timeline.json'),'utf8'));
    validateContract(config,project,timeline); inside(root,config.shot);
  }
  const events = [], emit = event => {events.push(event);process.stdout.write(JSON.stringify(event)+'\n');};
  const stamp = new Date().toISOString().replaceAll(/[:.]/g,'-');
  const validation = path.join(root,'validation'); await fs.mkdir(validation,{recursive:true});
  const log = path.join(validation,`multiplane-${command}-${stamp}.jsonl`);
  const options = {root, 'job-dir':path.join(root,'renders','jobs'), 'no-hosted':true,
    raster:config.raster || 'gpu', workers:config.workers || 2,onEvent:emit};
  for (const [key,value] of Object.entries(values)) if (!['project','job','ffmpeg'].includes(key)) options[key] = key === 'out' ? inside(root,value) : value;
  let ffmpeg = values.ffmpeg || process.env.MULTIPLANE_FFMPEG || process.env.FFMPEG_PATH || 'ffmpeg';
  let result;
  try {
    if (command === 'doctor') {
      result = await upstream.doctor({ffmpeg,raster:options.raster,onEvent:emit});
      const encoder = values.encoder || config.encoder || 'x264';
      const actual = await probeEncoder(ffmpeg,encoder,process.env);
      emit({schema:'video-master.renderer.v1',type:'encoder_probe',...actual});
    } else if (['resume','status','cancel'].includes(command)) {
      if (!values.job) throw fail('invalid_option','--job is required');
      for (const key of Object.keys(values)) if (!['project','job',...(command === 'resume' ? ['workers'] : [])].includes(key)) throw fail('invalid_option',`--${key} cannot change for ${command}`);
      const job = values.job.includes('/') || values.job.includes('\\') ? (path.isAbsolute(values.job) ? values.job : inside(root,values.job)) : path.join(options['job-dir'],values.job);
      if (command === 'resume') {
        // Decode with the checkpoint's actual binary, not a newly changed shell default.
        let directory = path.join(job,'segments');
        try {
          const pointer=JSON.parse(await fs.readFile(path.join(job,'resume.json'),'utf8'));
          if (path.isAbsolute(pointer.directory) && path.basename(pointer.directory)==='segments') directory=pointer.directory;
        } catch {}
        try {
          const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
          if (manifest.options?.ffmpeg) ffmpeg=manifest.options.ffmpeg;
        } catch {} // Upstream supplies the authoritative missing/invalid checkpoint error.
      }
      const jobOptions = {'job-dir':options['job-dir'],'no-hosted':true,onEvent:emit};
      if (command === 'resume' && values.workers) jobOptions.workers=values.workers;
      result = await upstream[{resume:'resumeRender',status:'statusJob',cancel:'cancelJob'}[command]](job,jobOptions);
    } else {
      if (command === 'render') {
        options.encoder = values.encoder || config.encoder || 'x264'; options.ffmpeg=ffmpeg;
        if (!options.out) options.out=path.join(root,'delivery',`video-${stamp}.mp4`);
        try {await fs.access(options.out);throw fail('output_exists','Choose a new output path',{output:options.out});} catch(error) {if (error.code !== 'ENOENT') throw error;}
        await fs.mkdir(path.dirname(options.out),{recursive:true});
        await probeEncoder(ffmpeg,options.encoder,process.env);
        // Check the loaded shot matches the same source-of-truth project before full encoding.
        const inspected = await upstream.inspectShot(config.shot,{root,raster:options.raster});
        if (inspected.data.duration !== project.duration_seconds || inspected.data.fps !== project.fps || inspected.data.stage.width !== project.width || inspected.data.stage.height !== project.height) throw fail('shot_contract_mismatch','Shot dimensions, frame rate or duration disagree with video.json');
        const audio=await mixAudio(root,timeline,ffmpeg,process.env);
        if (audio) options.audio=audio;
      }
      const method={lint:'lintShot',inspect:'inspectShot',stills:'stillsShot',verify:'verifyShot',render:'renderShot'}[command];
      result = await upstream[method](config.shot,options);
    }
    if (result?.ok === false) throw fail(result.code || 'render_failed',result.message || 'Upstream command failed',result.details);
    if (['render','resume'].includes(command)) {
      const file=result.data.output;
      const decode=await execute(ffmpeg,['-hide_banner','-loglevel','error','-xerror','-i',file,'-f','null','-'],{env:process.env,timeout:120000});
      if (decode.code !== 0) throw fail('delivery_decode_failed','Encoded delivery failed full decode',{exitCode:decode.code,stderr:decode.stderr});
      const receipt={schema:'video-master.delivery.v1',backend:'multiplane',backend_version:VERSION,status:'passed',output:file,
        ...result.data,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex'),
        checks:command==='resume'
          ? ['upstream checkpoint input/environment checks','upstream encoded check','full FFmpeg decode']
          : ['actual encoder probe','shot-project contract','upstream encoded check','full FFmpeg decode'],
        human_review:'not_recorded',event_log:log};
      await fs.writeFile(path.join(validation,path.basename(file)+'.json'),JSON.stringify(receipt,null,2)+'\n');
      emit({schema:'video-master.renderer.v1',type:'delivery',...receipt});
    }
  } catch(error) {
    emit({schema:'video-master.renderer.v1',type:'error',code:error.code || 'internal_error',message:error.message,details:error.details});
    throw error;
  } finally {await fs.writeFile(log,events.map(event=>JSON.stringify(event)).join('\n')+'\n');}
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(JSON.stringify({schema:'video-master.renderer.v1',type:'error',code:error.code || 'internal_error',message:error.message,details:error.details}));
    process.exitCode=1;
  });
}
