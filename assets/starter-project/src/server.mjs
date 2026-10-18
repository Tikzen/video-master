#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validate } from "./model.js";
import { ensureDemoAudio } from "./synthesize.mjs";
import { inside, atomicJson, probe, ffmpegPath, run } from "./media.mjs";
import { configureImages, imageBackends } from "./image-tools.mjs";
import { configureVoice, voiceConfig, voiceStatus, synthesizeSpeech } from "./voice-tools.mjs";
import { applyActions, defaultView } from "./control.mjs";
import { planningState, publishProposal, ensurePlanning, validateConfirmation } from "./planning.mjs";
import { transcribeRecording } from "./transcription.mjs";
import { listSamples, importSample, cloneVoice } from "./voice-clone.mjs";
import { checkpoints, publishCheckpoint, respondCheckpoint } from "./review.mjs";
import { localVoices, localSpeech } from "./local-tts.mjs";
import { musicStatus, configureMusic, generateMusic, musicActions } from "./music-tools.mjs";
import { qualityStatus, configureQuality, setQualityIntent, prepareQualityReview, addQualityEvidence,
  submitQualityReview, beginQualityRepair, submitQualityComparison, restoreQualityBaseline } from "./quality-review.mjs";

const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".webm": "video/webm", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "video/mp4" };
async function body(request, limit = 2e6) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function createProjectServer(root, requestedPort = 0, readOnly = false) {
  root = path.resolve(root);
  const instanceId = randomUUID();
  const readJson = async (file, fallback) => {
    try { return JSON.parse(await fs.readFile(inside(root, file), "utf8")); }
    catch (error) { if (error.code === "ENOENT" && fallback !== undefined) return fallback; throw error; }
  };
  const initial = await readJson("timeline.json");
  if(!readOnly)await ensurePlanning(root,await readJson("video.json"));
  if (initial.cues.some((c) => c.src === "audio/demo-score.wav")) await ensureDemoAudio(root, initial.duration_seconds);
  let render = { state: "idle" }, writeQueue = Promise.resolve();
  let view = {...defaultView}, viewRevision = 0;
  let editorPresence={dirty:false,at:0};
  let transcription={state:"idle"};
  let cloning={state:"idle"};
  let qualityJob={state:"idle"};
  const past = [], future = [];
  const snapshot = async () => ({ project: await readJson("video.json"), timeline: await readJson("timeline.json"), view });
  const revision = (state) => digest({ project: state.project, timeline: state.timeline });
  const persist = async (state) => {
    await atomicJson(inside(root,"video.json"),state.project);
    await atomicJson(inside(root,"timeline.json"),state.timeline);
    view=state.view; viewRevision++;
  };
  const remember = (state) => { past.push(state);if(past.length>70)past.shift();future.length=0; };
  const mutate = (fn) => {
    const operation = writeQueue.then(fn);
    writeQueue = operation.catch(() => {});
    return operation;
  };
  const launchRender = async () => {
    if (render.state === "running") throw new Error("Render already running");
    const stamp = `${Date.now()}-${randomUUID().slice(0, 5)}`;
    const snapshot = `renders/snapshots/${stamp}`;
    await fs.mkdir(inside(root, snapshot), { recursive: true });
    // A render binds immutable config/timeline snapshots; later UI saves cannot change it.
    for (const file of ["video.json", "timeline.json"]) await fs.copyFile(inside(root, file), inside(root, `${snapshot}/${file}`));
    const output = `delivery/video-${stamp}.mp4`;
    render = { state: "running", progress: 0, output };
    const child = spawn(process.execPath, [inside(root, "src/render.mjs"), "--output", output, "--snapshot", snapshot], {
      cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let error = "", stdout = "";
    child.stderr.on("data", (data) => { error = (error + data).slice(-4000); });
    child.stdout.on("data", (data) => {
      stdout += data;
      const lines = stdout.split("\n"); stdout = lines.pop();
      for (const line of lines) {
        try { const event = JSON.parse(line); if (event.progress != null) render.progress = event.progress; } catch {}
      }
    });
    child.on("error", (err) => { render = { state: "error", error: err.message }; });
    child.on("close", (code) => {
      render = code === 0 ? { state: "done", output, progress: 100 } : { state: "error", error: error || `Render exited ${code}` };
    });
  };
  const server = http.createServer(async (request, response) => {
    const send = (data, status = 200) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify(data));
    };
    try {
      const address = server.address(), origin = `http://127.0.0.1:${address.port}`;
      if (![`127.0.0.1:${address.port}`, `localhost:${address.port}`].includes(request.headers.host)) return send({ error: "Invalid host" }, 403);
      const url = new URL(request.url, origin);
      if (request.method !== "GET" && request.method !== "HEAD") {
        if (readOnly) return send({ error: "Read only" }, 403);
        const header = request.headers.origin;
        if (header && ![origin, `http://localhost:${address.port}`].includes(header)) return send({ error: "Invalid origin" }, 403);
      }
      if (request.method === "GET" && url.pathname === "/api/health") return send({
        status: "ok", root, service: "video-master", pid: process.pid, instance_id: instanceId, read_only: readOnly,
      });
      if (request.method === "GET" && url.pathname === "/api/video") return send(await readJson("video.json"));
      if (request.method === "GET" && url.pathname === "/api/timeline") return send(await readJson("timeline.json"));
      if (request.method === "GET" && url.pathname === "/api/annotations") return send(await readJson("review/annotations.json", []));
      if (request.method === "GET" && url.pathname === "/api/checkpoints") return send(await checkpoints(root));
      if (request.method === "GET" && url.pathname === "/api/quality-review") return send({ ...await qualityStatus(root), operation: qualityJob });
      if (request.method === "POST" && ["/api/quality-choice", "/api/quality-settings"].includes(url.pathname)) {
        const input=JSON.parse((await body(request,10000)).toString());
        return await mutate(async()=>send(await configureQuality(root,input,url.pathname==="/api/quality-choice"?"browser-user-submission":"agent-recorded-chat")));
      }
      if (request.method === "POST" && url.pathname === "/api/quality-prepare") {
        const input=JSON.parse((await body(request,10000)).toString());
        if(qualityJob.state==="running")return send({error:"Quality sampling is already running"},409);
        if((await qualityStatus(root)).settings.mode==="off")return send({error:"Experimental self-review is off; obtain an explicit user choice"},403);
        const job=randomUUID();qualityJob={state:"running",job};
        prepareQualityReview(root,input).then((result)=>{qualityJob={state:"done",job,result};})
          .catch((error)=>{qualityJob={state:"error",job,error:error.message};});
        return send({status:"started",job},202);
      }
      if (request.method === "POST" && ["/api/quality-intent","/api/quality-evidence","/api/quality-report","/api/quality-repair","/api/quality-comparison","/api/quality-restore"].includes(url.pathname)) {
        const input=JSON.parse((await body(request)).toString());
        const operations={
          "/api/quality-intent":setQualityIntent,"/api/quality-evidence":addQualityEvidence,
          "/api/quality-report":submitQualityReview,"/api/quality-repair":beginQualityRepair,
          "/api/quality-comparison":submitQualityComparison,"/api/quality-restore":restoreQualityBaseline,
        };
        return await mutate(async()=>{
          if(editorPresence.dirty&&Date.now()-editorPresence.at<5000&&["/api/quality-repair","/api/quality-restore"].includes(url.pathname))return send({error:"User has unsaved edits; wait for Save or discard"},409);
          const result=await operations[url.pathname](root,input);
          // A restored baseline refreshes clients without resurrecting stale undo snapshots.
          if(url.pathname==="/api/quality-restore"){past.length=0;future.length=0;viewRevision++;}
          send(result);
        });
      }
      if (request.method === "POST" && url.pathname === "/api/checkpoints") {
        const input=JSON.parse((await body(request)).toString());
        return await mutate(async()=>send(await publishCheckpoint(root,input)));
      }
      if (request.method === "POST" && url.pathname === "/api/checkpoint-response") {
        const input=JSON.parse((await body(request)).toString());
        return await mutate(async()=>send(await respondCheckpoint(root,input)));
      }
      if (request.method === "GET" && url.pathname === "/api/render-status") return send(render);
      if (request.method === "GET" && url.pathname === "/api/transcription-status") return send(transcription);
      if (request.method === "GET" && url.pathname === "/api/narration-assets") return send(await readJson("narration_assets.json",[]));
      if (request.method === "POST" && url.pathname === "/api/transcribe") {
        const input=JSON.parse((await body(request,10000)).toString());
        if(transcription.state==="running")return send({error:"Transcription already running"},409);
        if(typeof input.src!=="string"||!/^assets\/imports\/[a-z0-9-]+\.wav$/i.test(input.src))return send({error:"Import a recording first"},422);
        if(![undefined,"auto","zh","en","ja","ko"].includes(input.language))return send({error:"Invalid transcription language"},422);
        if(![undefined,"narrator","host-a","host-b"].includes(input.speaker))return send({error:"Invalid recording speaker"},422);
        const job=randomUUID();
        transcription={state:"running",job,src:input.src};
        transcribeRecording(root,input.src,{language:input.language,speaker:input.speaker})
          .then((result)=>{transcription={state:"done",job,...result};})
          .catch((error)=>{transcription={state:"error",job,error:error.message};});
        return send({status:"started",job},202);
      }
      if (request.method === "GET" && url.pathname === "/api/deliveries") {
        const folder=inside(root,"delivery");
        let files=[];
        try{
          for(const entry of await fs.readdir(folder,{withFileTypes:true})){
            if(entry.isFile()&&/\.mp4$/i.test(entry.name)){
              const stat=await fs.stat(path.join(folder,entry.name));
              files.push({name:entry.name,path:`delivery/${entry.name}`,bytes:stat.size,modified:stat.mtime.toISOString()});
            }
          }
        }catch(error){if(error.code!=="ENOENT")throw error;}
        return send({files:files.sort((a,b)=>b.modified.localeCompare(a.modified))});
      }
      if (request.method === "GET" && url.pathname === "/api/workspace") {
        return await mutate(async()=>{
          const state=await snapshot();
          send({...state,revision:revision(state),timeline_hash:digest(state.timeline),view_revision:viewRevision,can_undo:!!past.length,can_redo:!!future.length,render});
        });
      }
      if (request.method === "POST" && url.pathname === "/api/actions") {
        const input=JSON.parse((await body(request)).toString());
        return await mutate(async()=>{
          const current=await snapshot();
          if(input.expected_revision!==revision(current))return send({error:"Workspace changed; reload before applying actions"},409);
          if(editorPresence.dirty&&Date.now()-editorPresence.at<5000
            &&(input.command||input.actions?.some((action)=>action.type!=="view.set")))return send({error:"User has unsaved edits; wait for Save or reload"},409);
          let next;
          if(["undo","redo"].includes(input.command)){
            const from=input.command==="undo"?past:future,to=input.command==="undo"?future:past;
            if(!from.length)return send({error:"No history entry"},422);
            to.push(current);next=from.pop();
          }else{
            next=applyActions(current,input.actions);
            if(revision(next)!==revision(current))remember(current);
          }
          await persist(next);
          send({...next,revision:revision(next),view_revision:viewRevision});
        });
      }
      if (request.method === "POST" && url.pathname === "/api/editor-presence") {
        const input=JSON.parse((await body(request,10000)).toString());
        editorPresence={dirty:input.dirty===true,at:Date.now()};
        return send({status:"ok"});
      }
      if (request.method === "POST" && url.pathname === "/api/editor-view") {
        const input=JSON.parse((await body(request,10000)).toString());
        return await mutate(async()=>{
          if(input.expected_view_revision!==viewRevision)return send({error:"View changed"},409);
          const next=applyActions(await snapshot(),[{type:"view.set",patch:input.patch}]);
          view=next.view;viewRevision++;
          send({view_revision:viewRevision});
        });
      }
      if (request.method === "GET" && url.pathname === "/api/workflow") return send(await planningState(root));
      if (request.method === "POST" && url.pathname === "/api/proposals") {
        const input=JSON.parse((await body(request)).toString());
        return await mutate(async()=>send(await publishProposal(root,input.proposal,input.expected_hash)));
      }
      if (request.method === "POST" && url.pathname === "/api/production") {
        const input=JSON.parse((await body(request)).toString());
        if(!["waiting","working","blocked","review","done"].includes(input.status))return send({error:"Invalid production status"},422);
        if(typeof input.message!=="string"||input.message.length>4000)return send({error:"Invalid production message"},422);
        return await mutate(async()=>{
          await atomicJson(inside(root,"production.json"),{status:input.status,message:input.message,steps:input.steps||[],updated_at:new Date().toISOString()});
          send({status:"saved"});
        });
      }
      if (request.method === "GET" && url.pathname === "/api/voice-tool") return send(await voiceStatus(root));
      if (request.method === "GET" && url.pathname === "/api/music-tool") return send(await musicStatus(root));
      if (request.method === "POST" && url.pathname === "/api/music-tool") {
        const input=JSON.parse((await body(request,10000)).toString());
        return await mutate(async()=>send(await configureMusic(root,input)));
      }
      if (request.method === "POST" && url.pathname === "/api/music-generate") {
        const input=JSON.parse((await body(request,10000)).toString());
        return await mutate(async()=>send(await generateMusic(root,input)));
      }
      if (request.method === "POST" && url.pathname === "/api/music-apply") {
        const input=JSON.parse((await body(request,10000)).toString());
        return await mutate(async()=>{
          const current=await snapshot();
          if(input.expected_revision!==revision(current))return send({error:"Workspace changed; reload before applying music"},409);
          if(editorPresence.dirty&&Date.now()-editorPresence.at<5000)return send({error:"User has unsaved edits; wait for Save"},409);
          const selected=(await musicStatus(root)).selected;
          const {actions,result}=await musicActions(root,current,selected);
          if(actions.length){
            const next=applyActions(current,actions);remember(current);await persist(next);
          }
          send({status:"applied",...result,revision:revision(await snapshot())});
        });
      }
      if (request.method === "GET" && url.pathname === "/api/local-voices") return send(await localVoices());
      if (request.method === "GET" && url.pathname === "/api/voice-samples") return send(await listSamples(root));
      if (request.method === "POST" && url.pathname === "/api/voice-samples") {
        return send(await importSample(root,url.searchParams.get("name")||"sample.wav",await body(request,20*1024*1024)));
      }
      if (request.method === "GET" && url.pathname === "/api/voice-clone-status") return send(cloning);
      if (request.method === "POST" && url.pathname === "/api/voice-clone") {
        const input=JSON.parse((await body(request,10000)).toString());
        if(input.authorized!==true||input.rights_confirmed!==true)return send({error:"Confirm voice rights and external upload/cost authorization"},403);
        if(cloning.state==="running")return send({error:"Clone already running"},409);
        const job=randomUUID();
        cloning={state:"running",job};
        cloneVoice(root,input).then((result)=>{cloning={state:"done",job,...result};})
          .catch((error)=>{cloning={state:"error",job,error:error.message};});
        return send({status:"started",job},202);
      }
      if (request.method === "POST" && url.pathname === "/api/voice-tool") {
        const choice=JSON.parse((await body(request)).toString());
        return await mutate(async()=>send(await configureVoice(root,choice)));
      }
      if (request.method === "POST" && url.pathname === "/api/voice-preview") {
        const input=JSON.parse((await body(request,10000)).toString());
        if(typeof input.text!=="string"||[...input.text].length>200)return send({error:"Preview text must be at most 200 characters"},422);
        const config=await voiceConfig(root);
        if(config.provider==="local")return send(await localSpeech(root,config,{speaker:input.speaker,text:input.text}));
        if(input.authorized!==true)return send({error:"Explicit paid TTS authorization required"},403);
        if(config.provider!=="minimax")return send({error:"Select MiniMax first"},422);
        return send(await synthesizeSpeech(root,config,{speaker:input.speaker,text:input.text},{authorized:true}));
      }
      if (request.method === "GET" && url.pathname === "/api/image-tool") return send({
        selected: await readJson("asset_tools.json", {}), backends: Object.keys(imageBackends),
      });
      if (request.method === "POST" && url.pathname === "/api/image-tool") {
        const choice=JSON.parse((await body(request)).toString());
        return await mutate(async()=>send(await configureImages(root,choice.mode,choice.backend)));
      }
      if (request.method === "GET" && url.pathname === "/api/plan") {
        const first = await readJson("planning/stage1.json", {});
        const receipt = await readJson("confirmations/stage1.json", {});
        if (!first.stage || receipt.proposal_hash !== digest(first)) return send({...first,proposal_hash:digest(first)});
        const second = await readJson("planning/stage2.json", {});
        const secondReceipt = await readJson("confirmations/stage2.json", {});
        if(second.stage&&secondReceipt.proposal_hash===digest(second)&&second.stage1_hash===digest(receipt))return send({title:"制作方案已确认",summary:"可继续制作与精修。",stage:null});
        return send(second.stage ? {...second,proposal_hash:digest(second)} : { title: "Stage 1 已确认，等待完整方案", summary: "", stage: null });
      }
      if (request.method === "POST" && url.pathname === "/api/timeline") {
        const parsed = JSON.parse((await body(request)).toString());
        return await mutate(async () => {
          const project = await readJson("video.json"), errors = validate(project, parsed);
          if (errors.length) return send({ error: errors.join("; ") }, 422);
          const old=await snapshot();
          if(request.headers["if-match"]&&request.headers["if-match"]!==digest(old.timeline))return send({error:"Agent or another editor changed the timeline; reload before saving"},409);
          if(digest(parsed)!==digest(old.timeline))remember(old);
          await atomicJson(inside(root, "timeline.json"), parsed);
          send({ status: "saved", timeline_hash:digest(parsed) });
        });
      }
      if (request.method === "POST" && url.pathname === "/api/annotations") {
        const note = JSON.parse((await body(request)).toString());
        if (!note.text?.trim() || !Number.isFinite(note.time_sec)) return send({ error: "Invalid note" }, 422);
        return await mutate(async () => {
          const notes = await readJson("review/annotations.json", []);
          notes.push({ id: randomUUID(), status: "pending", created_at: new Date().toISOString(),
            text:note.text.trim(),time_sec:note.time_sec,cue_id:typeof note.cue_id==="string"?note.cue_id:null });
          await atomicJson(inside(root, "review/annotations.json"), notes);
          send(notes);
        });
      }
      if (request.method === "PATCH" && url.pathname === "/api/annotations") {
        const input=JSON.parse((await body(request)).toString());
        return await mutate(async()=>{
          const notes=await readJson("review/annotations.json",[]),note=notes.find((item)=>item.id===input.id);
          if(!note||!["pending","resolved"].includes(input.status))return send({error:"Invalid annotation"},422);
          note.status=input.status;note.resolution=String(input.resolution||"").slice(0,4000);
          await atomicJson(inside(root,"review/annotations.json"),notes);send(notes);
        });
      }
      if (request.method === "POST" && url.pathname === "/api/treatment-request") {
        const input=JSON.parse((await body(request)).toString());
        return await mutate(async()=>{
          const state=await planningState(root),proposal=state.stage2;
          if(!state.confirmations.stage1||proposal.stage1_hash!==state.confirmations.stage1_hash||input.proposal_hash!==proposal.proposal_hash)return send({error:"Proposal changed; reopen this round"},409);
          if(typeof input.text!=="string"||!input.text.trim()||input.text.length>4000)return send({error:"Describe the custom treatment"},422);
          const result={proposal_hash:proposal.proposal_hash,text:input.text.trim(),source:"browser-user-submission",submitted_at:new Date().toISOString()};
          await atomicJson(inside(root,"planning/treatment-request.json"),result);
          return send(result);
        });
      }
      if (request.method === "POST" && url.pathname === "/api/confirm") {
        const result = JSON.parse((await body(request)).toString());
        return await mutate(async()=>{
        if (!["stage1", "stage2"].includes(result.stage)) return send({ error: "Invalid stage" }, 422);
        const proposal = await readJson(`planning/${result.stage}.json`);
        if (proposal.revision !== result.revision || result.proposal_hash !== digest(proposal)) return send({ error: "Proposal changed; reopen this stage" }, 409);
        if (result.stage === "stage2") {
          const first = await readJson("planning/stage1.json"), receipt = await readJson("confirmations/stage1.json", {});
          if (receipt.proposal_hash !== digest(first) || proposal.stage1_hash !== digest(receipt)) return send({ error: "Stage 1 confirmation is stale" }, 409);
          if (!proposal.candidates?.some((c) => c.id === result.values?.selected)) return send({ error: "Select a valid treatment" }, 422);
        }
        let scope;
        try{scope=validateConfirmation(proposal,result);}catch(error){return send({error:error.message},422);}
        const previous=await readJson(`confirmations/${result.stage}.json`,{});
        if(previous.status)await atomicJson(inside(root,`confirmations/history/${result.stage}-${Date.now()}-${randomUUID().slice(0,5)}.json`),previous);
        await atomicJson(inside(root, `confirmations/${result.stage}.json`), {
          schema: "video-master.confirmation.v1", stage: result.stage, status: "confirmed",
          source: "browser-user-submission", proposal_hash: digest(proposal), values: result.values, ...scope, confirmed_at: new Date().toISOString(),
        });
        return send({ status: "confirmed" });
        });
      }
      if (request.method === "POST" && url.pathname === "/api/import-audio") {
        const input = await body(request, 80e6);
        const name = path.basename(url.searchParams.get("name") || "audio");
        const ext = path.extname(name).toLowerCase();
        if (![".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".webm"].includes(ext)) return send({ error: "Unsupported audio file" }, 422);
        const folder = inside(root, "assets/imports"), slug = randomUUID();
        await fs.mkdir(folder, { recursive: true });
        const source = path.join(folder, `${slug}-source${ext}`), normalized = path.join(folder, `${slug}.wav`);
        await fs.writeFile(source, input);
        const info = await probe(source);
        if (!info.streams.some((s) => s.codec_type === "audio")) return send({ error: "No audio stream" }, 422);
        await run(ffmpegPath, ["-v", "error", "-i", source, "-vn", "-ac", "2", "-ar", "48000", normalized]);
        return send({ src: `assets/imports/${slug}.wav`, duration: Number(info.format.duration), original: name });
      }
      if (request.method === "POST" && url.pathname === "/api/import-image") {
        // User-supplied host art (立绘) or redraw references for gallery checkpoints.
        const input = await body(request, 30e6);
        const type = input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "png"
          : input[0] === 0xff && input[1] === 0xd8 ? "jpg"
          : input.subarray(0, 4).toString() === "RIFF" && input.subarray(8, 12).toString() === "WEBP" ? "webp" : null;
        if (!type) return send({ error: "Upload a PNG, JPEG or WebP image" }, 422);
        const folder = inside(root, "assets/imports/images"), slug = randomUUID();
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(path.join(folder, `${slug}.${type}`), input);
        return send({ src: `assets/imports/images/${slug}.${type}`, original: path.basename(url.searchParams.get("name") || "image"), bytes: input.length });
      }
      if (request.method === "POST" && url.pathname === "/api/render") {
        return await mutate(async()=>{
          const project = await readJson("video.json"), sequence = await readJson("timeline.json"), errors = validate(project, sequence);
          if (errors.length) return send({ error: errors.join("; ") }, 422);
          await launchRender();send({ status: "started" }, 202);
        });
      }
      let requested = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (!requested) requested = "src/editor.html";
      if (requested === "create") requested = "src/planner.html";
      let file;
      if (requested === "vendor/lucide.js") file = inside(root, "node_modules/lucide/dist/umd/lucide.js");
      else {
        if (!/^(src\/|assets\/|audio\/|delivery\/|renders\/preview\/)/.test(requested)) return send({ error: "Not found" }, 404);
        file = inside(root, requested);
      }
      const real = await fs.realpath(file);
      if (requested !== "vendor/lucide.js" && path.relative(await fs.realpath(root), real).startsWith("..")) return send({ error: "Not found" }, 404);
      const stat = await fs.stat(real);
      if (!stat.isFile()) return send({ error: "Not found" }, 404);
      const type = mime[path.extname(file)] || "application/octet-stream";
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) { response.writeHead(416); response.end(); return; }
        const start = Number(match[1]), end = Math.min(stat.size - 1, match[2] ? Number(match[2]) : stat.size - 1);
        if (start > end) { response.writeHead(416); response.end(); return; }
        response.writeHead(206, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": end - start + 1 });
        createReadStream(file, { start, end }).pipe(response); return;
      }
      response.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Cache-Control": "no-cache", "Accept-Ranges": "bytes" });
      if (request.method === "HEAD") response.end(); else createReadStream(file).pipe(response);
    } catch (error) {
      if (!response.headersSent) send({ error: error.message }, error.code === "ENOENT" ? 404 : 400);
      else response.destroy();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject); server.listen(requestedPort, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const index = process.argv.indexOf("--port"), requested = index < 0 ? 5179 : Number(process.argv[index + 1]);
  let instance;
  for (let port = requested; port < requested + 20; port++) {
    try { instance = await createProjectServer(root, port); break; }
    catch (error) { if (error.code !== "EADDRINUSE" || index >= 0) throw error; }
  }
  if (!instance) throw new Error("No free editor port");
  console.log(`Video Master editor: ${instance.url}`);
}
