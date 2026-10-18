import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateMusic,configureMusic } from "./music-tools.mjs";
import { run } from "./media.mjs";
import { validate } from "./model.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
test("all four builders honor music choice at final duration without manual timeline work",{timeout:30000},async()=>{
  await fs.mkdir(path.join(root,".editor"),{recursive:true});
  const fixture=await fs.mkdtemp(path.join(root,".editor","music-builders-"));
  try{
    await fs.cp(path.join(root,"src"),path.join(fixture,"src"),{recursive:true});
    await fs.copyFile(path.join(root,"package.json"),path.join(fixture,"package.json"));
    await fs.symlink(path.join(root,"node_modules"),path.join(fixture,"node_modules"),process.platform==="win32"?"junction":"dir");
    const original=JSON.parse(await fs.readFile(path.join(root,"video.json"),"utf8"));delete original.mode;
    const signal=await generateMusic(fixture,{duration:2,style:"pulse"});
    for(const genre of ["studio","product","report"]){
      await fs.writeFile(path.join(fixture,"video.json"),JSON.stringify(original));
      const program={genre,title:`Test ${genre}`,gap_seconds:.3,tts:{provider:"provided"},
        lines:[{speaker:"host-a",text:"Synthetic test signal",audio:signal.src,camera:"studio"},
          {speaker:"host-b",text:"Synthetic second signal",audio:signal.src,camera:"screen"}],
        pages:[{type:"bullets",title:"Test page",narration:"Synthetic test signal",audio:signal.src,bullets:["Test"]},
          {type:"chart",title:"Second page",narration:"Synthetic second signal",audio:signal.src,
            values:[20,40],labels:["A","B"]}]};
      await fs.writeFile(path.join(fixture,"program.json"),JSON.stringify(program));
      await configureMusic(fixture,{mode:"procedural",style:"soft"});
      await run(process.execPath,[path.join(fixture,"src/create-program.mjs"),"--input","program.json"]);
      const project=JSON.parse(await fs.readFile(path.join(fixture,"video.json"))),timeline=JSON.parse(await fs.readFile(path.join(fixture,"timeline.json")));
      assert.deepEqual(validate(project,timeline),[]);
      const bed=timeline.cues.find((cue)=>cue.id==="vm-music-bed");
      assert.ok(bed);assert.equal(bed.end_sec,timeline.duration_seconds);assert.equal(bed.duck_gain,.28);
      assert.ok(timeline.cues.some((cue)=>cue.kind==="voice"));
      const scenes=timeline.cues.filter((cue)=>cue.kind==="scene");
      assert.equal(scenes.length,2);
      assert.equal(scenes[1].transition?.type,genre==="studio"?"iris":"flow",
        `${genre} receives a genre-aware executable transition`);
      const authored={type:"wipe",direction:"down",duration_sec:.2};
      program.lines[1].transition=authored;
      program.pages[1].transition=authored;
      program.lines.push({...program.lines[0],camera:"studio",transition:false});
      program.pages.push({...program.pages[0],transition:false});
      await fs.writeFile(path.join(fixture,"video.json"),JSON.stringify(original));
      await fs.writeFile(path.join(fixture,"program.json"),JSON.stringify(program));
      await run(process.execPath,[path.join(fixture,"src/create-program.mjs"),"--input","program.json"]);
      const customProject=JSON.parse(await fs.readFile(path.join(fixture,"video.json")));
      const customTimeline=JSON.parse(await fs.readFile(path.join(fixture,"timeline.json")));
      assert.deepEqual(validate(customProject,customTimeline),[]);
      const customScenes=customTimeline.cues.filter((cue)=>cue.kind==="scene");
      assert.deepEqual(customScenes[1].transition,authored,`${genre} preserves Agent-authored transition choices`);
      assert.equal(customScenes[2].transition,undefined,`${genre} can disable inferred transitions for an intentional cut`);
    }
    for(const mode of ["none","provided","procedural"]){
      await fs.writeFile(path.join(fixture,"video.json"),JSON.stringify(original));
      const recording=await generateMusic(fixture,{duration:4,style:"soft"});
      await configureMusic(fixture,{mode,src:mode==="provided"?recording.src:"",style:"pulse",bpm:108});
      await run(process.execPath,[path.join(fixture,"src/create-mv.mjs"),"--prompt","Test kinetic video","--duration","4","--width","640","--height","360"]);
      const project=JSON.parse(await fs.readFile(path.join(fixture,"video.json"))),timeline=JSON.parse(await fs.readFile(path.join(fixture,"timeline.json")));
      assert.deepEqual(validate(project,timeline),[]);
      assert.equal(timeline.cues.filter((cue)=>cue.kind==="music").length,mode==="none"?0:1);
      if(mode==="provided")assert.equal(timeline.music.src,recording.src);
      if(mode==="procedural")assert.equal(timeline.music.style,"pulse");
    }
    for(const duration of [4.1,4+1/30]){
      await fs.writeFile(path.join(fixture,"video.json"),JSON.stringify(original));
      await configureMusic(fixture,{mode:"none"});
      await run(process.execPath,[path.join(fixture,"src/create-mv.mjs"),"--prompt","Short beat tail","--theme","kinetic","--bpm","120","--duration",String(duration)]);
      const project=JSON.parse(await fs.readFile(path.join(fixture,"video.json"))),timeline=JSON.parse(await fs.readFile(path.join(fixture,"timeline.json")));
      assert.deepEqual(validate(project,timeline),[]);
      const scenes=timeline.cues.filter((cue)=>cue.kind==="scene");
      assert.equal(scenes.at(-1).end_sec,timeline.duration_seconds,"Last one-frame beat fragment is not silently dropped");
      assert.ok(timeline.cues.filter((cue)=>cue.kind==="title").every((cue)=>cue.end_sec-cue.start_sec>=1/30-1e-6));
    }
    const soundtrack = await generateMusic(fixture, { duration: 4, style: "soft" });
    for (const options of [["--music-style", "electronic"], ["--no-music"]]) {
      await fs.writeFile(path.join(fixture, "video.json"), JSON.stringify(original));
      await configureMusic(fixture, { mode: "provided", src: soundtrack.src, bpm: 120 });
      await run(process.execPath, [path.join(fixture, "src/create-mv.mjs"), "--prompt", "Explicit music override",
        "--duration", "4", ...options]);
      const timeline = JSON.parse(await fs.readFile(path.join(fixture, "timeline.json")));
      if (options[0] === "--no-music") assert.equal(timeline.cues.filter((cue) => cue.kind === "music").length, 0);
      else {
        assert.equal(timeline.music.style, "electronic");
        assert.notEqual(timeline.music.src, soundtrack.src);
      }
    }
    await fs.writeFile(path.join(fixture, "video.json"), JSON.stringify(original));
    const plan = { schema: "video-master.mv-plan.v1",
      project: { width: 640, height: 360, fps: 60, duration_seconds: 4 },
      cues: [{ id: "directed", kind: "scene", scene: "composition", track_id: "scenes", start_sec: 0, end_sec: 4,
        layers: [{ id: "text", kind: "text", text: "Original copy", keyframes: [{ at: 0, x: -300 }, { at: 1, x: 100 }] }] }],
      sound_events: [{ id: "hit", at_sec: 1, type: "hit" }] };
    await fs.writeFile(path.join(fixture, "mv-plan.json"), JSON.stringify(plan));
    await run(process.execPath, [path.join(fixture, "src/create-mv.mjs"), "--prompt", "Directed plan",
      "--plan", "mv-plan.json", "--no-music"]);
    const timeline = JSON.parse(await fs.readFile(path.join(fixture, "timeline.json")));
    assert.equal(timeline.fps, 60);
    assert.equal(timeline.cues[0].layers[0].text, "Original copy");
    assert.equal(timeline.cues.filter((cue) => cue.kind === "sfx").length, 1);
    assert.equal(timeline.sound_events[0].frame, 60);
    assert.equal(timeline.cues.filter((cue) => cue.kind === "music").length, 0);
  }finally{
    assert.ok(path.resolve(fixture).startsWith(path.resolve(root,".editor")+path.sep));
    await fs.rm(fixture,{recursive:true,force:true});
  }
});
