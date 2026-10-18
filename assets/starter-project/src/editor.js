import { renderFrame } from "/src/scene.js";
import { loadVisuals, prepareVisuals } from "/src/mv.js";
import { clamp, clone, frame, timecode, moveCue, isAudio, trackEnabled, validate } from "/src/model.js";
import { voiceIntervals, playbackGain } from "/src/audio-mix.js";
import { collectCompositionVisuals } from "/src/composition.js";

const $ = (id) => document.getElementById(id);
const canvas = $("scene-canvas"), ctx = canvas.getContext("2d");
const color = (kind) => ({ video: "#77dbc9", graphics: "#efc46e", voice: "#8dbbf1", music: "#f28a74", sfx: "#c5a4d9" }[kind] || "#a8bab5");
let project, timeline, selectedId, time = 0, pps = 96, playing = false, lastTick = 0;
let dirty = false, saved = "", saveInFlight = null, drag = null, snap = true;
let history = [], future = [], annotations = [], audioContext, audioNodes = [];
const audioBuffers = new Map(), peaks = new Map();
let mediaBusy = false, mediaTime = null, mediaRevision = 0;
let timelineHash=null,remoteViewRevision=0,remoteSyncBusy=false,conflictReported=false;
let remoteHistory={undo:false,redo:false},lastRemoteRender="";
const html = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = () => window.lucide?.createIcons({ attrs: { width: 15, height: 15, "stroke-width": 1.7 } });
const cue = () => timeline.cues.find((c) => c.id === selectedId);
const scene = () => timeline.cues.find((c) => c.kind === "scene" && time >= c.start_sec && time < c.end_sec && trackEnabled(timeline, c));
const cueLabel = (item) => item.title || item.text || item.id;

function checkpoint() {
  history.push(clone(timeline));
  if (history.length > 70) history.shift();
  future = [];
  syncHistory();
}
function syncHistory() {
  $("undo-button").disabled = !history.length&&!remoteHistory.undo;
  $("redo-button").disabled = !future.length&&!remoteHistory.redo;
}
function changed() {
  mediaRevision += 1; mediaTime = null;
  dirty = JSON.stringify(timeline) !== saved;
  $("save-state").textContent = dirty ? "未保存" : "已保存";
  $("save-state").style.color = dirty ? "#efc46e" : "";
  window.__videoTimeline = timeline;
  fetch("/api/editor-presence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dirty})}).catch(()=>{});
}
function refresh() { drawTracks(); drawSecondIndex(); syncInspector(); draw(); }
function edit(fn) {
  checkpoint(); fn(); changed(); refresh();
  if (playing) restartAudio();
}
function draw() {
  renderFrame(ctx, timeline, time, canvas.width, canvas.height);
  if ([...timeline.cues, ...collectCompositionVisuals(timeline)].some((c) => c.kind === "footage") && !mediaBusy && mediaTime !== time) {
    mediaBusy = true;
    const target = time, revision = mediaRevision, sequence = timeline;
    loadVisuals(sequence).then(() => prepareVisuals(sequence, target)).then(() => {
      mediaTime = revision === mediaRevision ? target : null;
      renderFrame(ctx, timeline, time, canvas.width, canvas.height);
    }).catch((error) => { mediaTime = revision === mediaRevision ? target : null; status(error.message, true); }).finally(() => { mediaBusy = false; if (!playing && mediaTime !== time) draw(); });
  }
  const currentScene = scene();
  $("scene-name").textContent = currentScene ? cueLabel(currentScene) : "无场景";
  $("time-readout").textContent = timecode(time, timeline.fps);
  $("playhead").style.left = `${44 + time * pps}px`;
  const active = timeline.cues.filter((c) => time >= c.start_sec && time < c.end_sec && trackEnabled(timeline, c));
  $("second-summary").textContent = `${time.toFixed(2)} s  /  ${active.map(cueLabel).join(" · ") || "无活动片段"}`;
}
function seek(next) {
  time = frame(clamp(next, 0, timeline.duration_seconds - 1 / timeline.fps), timeline.fps);
  draw();
  if (playing) restartAudio();
}
function snapTo(seconds) {
  if (snap && Math.abs(seconds - Math.round(seconds)) < 7 / pps) return Math.round(seconds);
  return frame(seconds, timeline.fps);
}
function renderTimeline() {
  const width = Math.max(44 + timeline.duration_seconds * pps + 48, $("timeline-viewport").clientWidth);
  $("timeline-content").style.width = `${width}px`;
  $("timeline-content").style.setProperty("--pps", `${pps}px`);
  $("ruler").replaceChildren();
  for (let s = 0; s <= timeline.duration_seconds; s++) {
    const mark = document.createElement("button");
    mark.className = "second-mark"; mark.type = "button";
    mark.style.left = `${44 + s * pps}px`;
    mark.setAttribute("aria-label", `定位到第 ${s} 秒`);
    const content = timeline.cues.filter((c) => s >= c.start_sec && s < c.end_sec).map(cueLabel).join(" / ");
    mark.title = `${s}s · ${content || "无内容"}`;
    mark.innerHTML = `<span>${s}s</span>`;
    mark.onclick = () => seek(s);
    $("ruler").append(mark);
  }
  for (let s = 0; s < timeline.duration_seconds; s += 0.25) {
    if (s % 1 === 0) continue;
    const mark = document.createElement("i");
    mark.className = "minor-mark";
    mark.style.left = `${44 + s * pps}px`;
    $("ruler").append(mark);
  }
  drawTracks(); drawSecondIndex(); draw();
}
function drawSecondIndex() {
  $("second-index").replaceChildren();
  for (let second = 0; second < timeline.duration_seconds; second++) {
    const active = timeline.cues.filter((c) => c.start_sec < second + 1 && c.end_sec > second && trackEnabled(timeline, c));
    const cell = document.createElement("button");
    cell.type = "button"; cell.className = "second-cell";
    cell.style.left = `${44 + second * pps}px`; cell.style.width = `${Math.min(1, timeline.duration_seconds - second) * pps}px`;
    cell.innerHTML = `<span>${html(active.filter((c) => c.kind === "scene").map(cueLabel).join(" / ") || "空镜")}</span><span>${html(active.filter((c) => c.kind !== "scene").map(cueLabel).join(" · ") || "—")}</span>`;
    cell.title = `${second}–${Math.min(second + 1, timeline.duration_seconds)}s\n${active.map((c) => `${c.kind}: ${cueLabel(c)}`).join("\n")}`;
    cell.setAttribute("aria-label", `第 ${second} 秒内容：${active.map(cueLabel).join("，")}`);
    cell.onclick = () => seek(second); $("second-index").append(cell);
  }
}
function drawTracks() {
  $("tracks").replaceChildren(); $("track-labels").replaceChildren();
  for (const track of timeline.tracks) {
    const audio = ["music", "voice", "sfx"].includes(track.kind);
    const disabled = audio ? track.muted : !track.visible;
    const label = document.createElement("div");
    label.className = `track-label${disabled ? " disabled-track" : ""}`;
    label.innerHTML = `<span class="track-color" style="background:${color(track.kind)}"></span><span>${html(track.name)}</span>`;
    const toggle = document.createElement("button");
    toggle.type = "button"; toggle.className = "icon-button track-toggle";
    toggle.title = toggle.ariaLabel = audio ? (disabled ? "取消静音" : "静音轨道") : (disabled ? "显示轨道" : "隐藏轨道");
    toggle.innerHTML = `<i data-lucide="${audio ? (disabled ? "volume-x" : "volume-2") : (disabled ? "eye-off" : "eye")}"></i>`;
    toggle.onclick = () => edit(() => { if (audio) track.muted = !track.muted; else track.visible = !track.visible; });
    label.append(toggle); $("track-labels").append(label);
    const lane = document.createElement("div");
    lane.className = "track-lane"; lane.dataset.trackId = track.id;
    if (disabled) lane.classList.add("disabled-track");
    for (const item of timeline.cues.filter((c) => c.track_id === track.id)) {
      const clip = document.createElement("button");
      clip.type = "button"; clip.className = "clip"; clip.dataset.id = item.id;
      clip.style.left = `${44 + item.start_sec * pps}px`;
      clip.style.width = `${Math.max(8, (item.end_sec - item.start_sec) * pps)}px`;
      clip.style.background = color(track.kind);
      clip.setAttribute("aria-pressed", String(item.id === selectedId));
      clip.setAttribute("aria-label", `${cueLabel(item)}, ${item.start_sec.toFixed(2)} 至 ${item.end_sec.toFixed(2)} 秒`);
      clip.title = `${cueLabel(item)} · ${item.start_sec.toFixed(2)}–${item.end_sec.toFixed(2)}s`;
      clip.innerHTML = `<i class="clip-handle left" data-mode="left"></i><span class="clip-title">${html(cueLabel(item))}</span><span class="clip-time">${item.start_sec.toFixed(2)}–${item.end_sec.toFixed(2)}</span><i class="clip-handle right" data-mode="right"></i>`;
      if (isAudio(item) && peaks.has(item.src)) {
        const wave = document.createElement("canvas");
        wave.className = "waveform";
        wave.width = Math.max(1, Math.round((item.end_sec - item.start_sec) * pps)); wave.height = 30;
        clip.prepend(wave); drawWaveform(wave, item);
      }
      clip.onpointerdown = (event) => beginDrag(event, item, clip);
      clip.onclick = (event) => { event.stopPropagation(); select(item.id); };
      lane.append(clip);
    }
    lane.onpointerdown = (event) => {
      if (event.target !== lane) return;
      seek((event.clientX - lane.getBoundingClientRect().left - 44) / pps);
    };
    $("tracks").append(lane);
  }
  icons();
}
function beginDrag(event, item, element) {
  if (event.button !== 0) return;
  event.preventDefault(); checkpoint(); selectedId = item.id; syncInspector();
  $("tracks").querySelectorAll(".clip").forEach((clip) => clip.setAttribute("aria-pressed", String(clip.dataset.id === selectedId)));
  drag = { id: item.id, original: clone(item), pointer: event.pointerId, x: event.clientX, mode: event.target.dataset.mode || "move", element };
  element.setPointerCapture(event.pointerId);
  element.onpointermove = (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const delta = (e.clientX - drag.x) / pps;
    Object.assign(item, clone(drag.original));
    const base = drag.mode === "right" ? drag.original.end_sec : drag.original.start_sec;
    moveCue(timeline, item.id, snapTo(base + delta), drag.mode);
    element.style.left = `${44 + item.start_sec * pps}px`;
    element.style.width = `${Math.max(8, (item.end_sec - item.start_sec) * pps)}px`;
    element.querySelector(".clip-time").textContent = `${item.start_sec.toFixed(2)}–${item.end_sec.toFixed(2)}`;
    changed(); syncInspector(); draw();
  };
  const finish = () => {
    element.onpointermove = null; drag = null; refresh();
    if (playing) restartAudio();
  };
  element.onpointerup = finish; element.onpointercancel = finish;
}
function select(id) { selectedId = id; refresh(); }
function syncInspector() {
  const item = cue(), audio = !!item && isAudio(item);
  const transforms = ["scale", "rotation", "opacity", "x", "y"];
  for (const name of ["title", "text", "start", "duration", ...transforms]) {
    $(`cue-${name}`).disabled = !item || (transforms.includes(name) && (audio || item.kind === "expression")) || (name === "text" && !["title","subtitle"].includes(item.kind));
  }
  $("delete-cue").disabled = !item; $("volume-field").hidden = !audio;
  $("selected-kind").textContent = item ? `${item.kind} · ${item.id}` : "未选择片段";
  if (!item) return;
  $("cue-title").value = item.title || ""; $("cue-text").value = item.text || "";
  $("cue-start").step = $("cue-duration").step = String(1 / timeline.fps);
  $("cue-start").value = item.start_sec.toFixed(3);
  $("cue-duration").value = (item.end_sec - item.start_sec).toFixed(3);
  const t = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...item.transform };
  for (const name of transforms) {
    const value = name === "scale" || name === "opacity" ? Math.round(t[name] * 100) : t[name];
    $(`cue-${name}`).value = value;
    $(`${name}-value`).textContent = `${value}${name === "rotation" ? "°" : ["x","y"].includes(name) ? " px" : "%"}`;
  }
  $("cue-volume").value = Math.round((item.volume ?? 1) * 100);
  $("volume-value").textContent = `${$("cue-volume").value}%`;
}
async function save() {
  if (saveInFlight) await saveInFlight;
  const payload = JSON.stringify(timeline);
  saveInFlight = (async () => {
    const response = await fetch("/api/timeline", { method: "POST", headers: { "Content-Type": "application/json",...(timelineHash?{"If-Match":timelineHash}:{}) }, body: payload });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    timelineHash=result.timeline_hash;saved = payload; changed();
  })();
  try { await saveInFlight; } finally { saveInFlight = null; }
}
function status(message, error = false) {
  $("render-status").textContent = message;
  $("render-status").style.color = error ? "#f28a74" : "";
}
async function safeSave() {
  try { await save(); } catch (error) { status(error.message, true); $("save-state").textContent = "保存失败"; }
}
async function importAudio(file) {
  if (!file) return;
  status("正在导入音频…");
  try {
    const response = await fetch(`/api/import-audio?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    checkpoint();
    const start = frame(clamp(time, 0, timeline.duration_seconds - 1 / timeline.fps), timeline.fps);
    const trackId = `audio-${crypto.randomUUID().slice(0, 8)}`;
    timeline.tracks.push({ id: trackId, kind: "music", name: file.name, visible: true, muted: false });
    timeline.cues.push({ id: `${trackId}-clip`, track_id: trackId, kind: "music", title: file.name, start_sec: start,
      end_sec: frame(Math.min(timeline.duration_seconds, start + result.duration), timeline.fps), source_offset: 0,
      source_duration: result.duration, src: result.src, volume: 0.6, fade_in: 0.05, fade_out: 0.2 });
    await loadAudio(result.src);
    changed(); renderTimeline(); select(`${trackId}-clip`); status("音频已导入");
  } catch (error) { status(error.message, true); }
}
function getAudioContext() { audioContext ||= new AudioContext(); return audioContext; }
async function loadAudio(src) {
  if (audioBuffers.has(src)) return;
  const response = await fetch(`/${src}`);
  if (!response.ok) throw new Error(`无法读取 ${src}`);
  const buffer = await getAudioContext().decodeAudioData(await response.arrayBuffer());
  audioBuffers.set(src, buffer);
  const data = buffer.getChannelData(0), result = [];
  for (let i = 0; i < 500; i++) {
    let maximum = 0;
    const start = Math.floor(i * data.length / 500), end = Math.floor((i + 1) * data.length / 500);
    for (let j = start; j < end; j += 8) maximum = Math.max(maximum, Math.abs(data[j]));
    result.push(maximum);
  }
  peaks.set(src, { samples: result, duration: buffer.duration });
}
function drawWaveform(target, item) {
  const context = target.getContext("2d"), data = peaks.get(item.src);
  context.fillStyle = "rgba(31, 28, 27, 0.35)";
  for (let x = 0; x < target.width; x += 2) {
    const sec = (item.source_offset || 0) + x / target.width * (item.end_sec - item.start_sec);
    const index = clamp(Math.floor(sec / data.duration * data.samples.length), 0, data.samples.length - 1);
    const h = Math.max(1, data.samples[index] * 26);
    context.fillRect(x, 15 - h / 2, 1, h);
  }
}
function stopAudio() { for (const node of audioNodes) { try { node.stop(); } catch {} } audioNodes = []; }
function restartAudio() {
  stopAudio(); if (!playing) return;
  const context = getAudioContext();
  const speaking=voiceIntervals(timeline);
  for (const item of timeline.cues.filter((c) => isAudio(c) && c.end_sec > time && trackEnabled(timeline, c))) {
    const buffer = audioBuffers.get(item.src); if (!buffer) continue;
    const node = context.createBufferSource(), gain = context.createGain(); node.buffer = buffer;
    const local = Math.max(0, time - item.start_sec), offset = (item.source_offset || 0) + local;
    const duration = Math.min(buffer.duration - offset, item.end_sec - Math.max(time, item.start_sec));
    if (duration <= 0) continue;
    const when = context.currentTime + Math.max(0, item.start_sec - time),start=Math.max(time,item.start_sec);
    gain.gain.setValueAtTime(playbackGain(item,speaking,start),when);
    for(let elapsed=1/30;elapsed<duration;elapsed+=1/30)gain.gain.linearRampToValueAtTime(playbackGain(item,speaking,start+elapsed),when+elapsed);
    gain.gain.linearRampToValueAtTime(playbackGain(item,speaking,start+duration),when+duration);
    node.connect(gain).connect(context.destination); node.start(when, offset, duration); audioNodes.push(node);
  }
}
async function togglePlayback() {
  playing = !playing;
  if (playing) { await getAudioContext().resume(); lastTick = performance.now(); restartAudio(); requestAnimationFrame(tick); } else stopAudio();
  $("play-toggle").innerHTML = `<i data-lucide="${playing ? "pause" : "play"}"></i>`;
  $("play-toggle").ariaLabel = playing ? "暂停" : "播放"; icons();
}
function tick(now) {
  if (!playing) return;
  time += (now - lastTick) / 1000; lastTick = now;
  if (time >= timeline.duration_seconds - 1 / timeline.fps) { time = timeline.duration_seconds - 1 / timeline.fps; togglePlayback(); }
  draw(); if (playing) requestAnimationFrame(tick);
}
async function render() {
  $("render-button").disabled = true;
  try {
    if (playing) await togglePlayback();
    await save();
    const errors = validate(project, timeline); if (errors.length) throw new Error(errors.join("; "));
    const response = await fetch("/api/render", { method: "POST" }), result = await response.json();
    if (!response.ok) throw new Error(result.error);
    status("渲染中…"); pollRender();
  } catch (error) { status(error.message, true); $("render-button").disabled = false; }
}
async function pollRender() {
  try {
    const response = await fetch("/api/render-status"), data = await response.json();
    if (data.state === "running") { status(`渲染中 · ${data.progress || 0}%`); setTimeout(pollRender, 1000); return; }
    $("render-button").disabled = false;
    if (data.state === "done") {
      $("render-status").replaceChildren();
      const link = document.createElement("a");
      link.href = `/${data.output.replaceAll("\\", "/")}`; link.textContent = "成片已生成 · 打开 MP4"; link.target = "_blank";
      $("render-status").append(link);
    } else status(data.error || "渲染失败", true);
  } catch (error) { status(error.message, true); $("render-button").disabled = false; }
}
async function addNote() {
  const text = $("review-note").value.trim(); if (!text) return;
  try {
    const response = await fetch("/api/annotations", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time_sec: frame(time, timeline.fps), cue_id: selectedId, text }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    annotations = result; $("review-note").value = ""; drawNotes();
  } catch (error) { status(error.message, true); }
}
function drawNotes() {
  $("note-list").replaceChildren();
  for (const note of annotations.slice(-4)) {
    const button = document.createElement("button"); button.className = "note-item";
    button.textContent = `${note.time_sec.toFixed(2)}s · ${note.text}`; button.onclick = () => seek(note.time_sec);
    $("note-list").append(button);
  }
}
async function openPlan() {
  const response = await fetch("/api/plan"), data = await response.json(), target = $("plan-content");
  if (!data.stage) target.innerHTML = `<h3>${html(data.title||"尚未提交制作方案。")}</h3><p>${html(data.summary||"")}</p>`;
  else target.innerHTML=`<h3>${html(data.title||data.stage)}</h3><p>${html(data.summary||"")}</p><a class="button button-primary" href="/create?round=${data.stage==="stage1"?"stage1":"stage2"}" target="_blank" rel="noopener">打开本轮选择页</a>`;
  $("plan-dialog").showModal();
}
async function boot() {
  const workspaceResponse=await fetch("/api/workspace");
  if(!workspaceResponse.ok)throw new Error("workspace");
  const workspace=await workspaceResponse.json();
  project=workspace.project;timeline=workspace.timeline;
  annotations=await (await fetch("/api/annotations")).json();saved=JSON.stringify(timeline);
  timelineHash=workspace.timeline_hash;remoteViewRevision=workspace.view_revision;
  time=workspace.view.time;pps=workspace.view.zoom;snap=workspace.view.snap;selectedId=workspace.view.selected_id;
  $("timeline-zoom").value=pps;$("snap-toggle").setAttribute("aria-pressed",String(snap));
  remoteHistory={undo:workspace.can_undo,redo:workspace.can_redo};syncHistory();
  await loadVisuals(timeline);
  canvas.width = project.width; canvas.height = project.height; canvas.style.aspectRatio = `${project.width} / ${project.height}`;
  canvas.style.setProperty("--video-ratio", project.width / project.height);
  $("project-name").textContent = project.name; $("frame-readout").textContent = `${project.width} × ${project.height} · ${project.fps} fps`;
  $("duration-readout").textContent = timecode(timeline.duration_seconds, timeline.fps);
  $("timeline-duration").textContent = `${timeline.duration_seconds.toFixed(2)} 秒`;
  renderTimeline(); select(selectedId||timeline.cues[0]?.id); drawNotes();
  for (const source of new Set(timeline.cues.filter(isAudio).map((c) => c.src))) {
    try { await loadAudio(source); } catch (error) { status(error.message, true); }
  }
  drawTracks();
  window.__videoTimeline = timeline; window.__videoProject = project;
  window.__renderAt = (next) => renderFrame(ctx, timeline, next, canvas.width, canvas.height);
  window.__seek = seek; window.__editorReady = true;
  setInterval(syncRemote,1200);
}
async function syncRemote(){
  if(remoteSyncBusy||drag||saveInFlight)return;remoteSyncBusy=true;
  try{
    await fetch("/api/editor-presence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dirty})});
    const response=await fetch("/api/workspace"),state=await response.json();if(!response.ok)throw new Error(state.error);
    remoteHistory={undo:state.can_undo,redo:state.can_redo};syncHistory();
    const renderKey=JSON.stringify(state.render);
    if(state.render.state!=="idle"&&renderKey!==lastRemoteRender){
      lastRemoteRender=renderKey;
      $("render-button").disabled=state.render.state==="running";
      if(state.render.state==="running")status(`渲染中 · ${state.render.progress||0}%`);
      if(state.render.state==="error")status(state.render.error,true);
      if(state.render.state==="done"){
        $("render-status").replaceChildren();
        const link=document.createElement("a");link.href=`/${state.render.output}`;link.textContent="成片已生成 · 打开 MP4";link.target="_blank";$("render-status").append(link);
      }
    }
    if(state.timeline_hash!==timelineHash||JSON.stringify(state.project)!==JSON.stringify(project)){
      if(dirty){
        if(!conflictReported){status("外部修改已到达；请保留当前修改并刷新后合并。",true);conflictReported=true;}
        return;
      }
      if(playing)await togglePlayback();
      project=state.project;timeline=state.timeline;saved=JSON.stringify(timeline);timelineHash=state.timeline_hash;
      canvas.width=project.width;canvas.height=project.height;canvas.style.setProperty("--video-ratio",project.width/project.height);
      $("project-name").textContent=project.name;$("frame-readout").textContent=`${project.width} × ${project.height} · ${project.fps} fps`;
      $("duration-readout").textContent=timecode(timeline.duration_seconds,timeline.fps);$("timeline-duration").textContent=`${timeline.duration_seconds.toFixed(2)} 秒`;
      history=[];future=[];syncHistory();await loadVisuals(timeline);
      for(const src of new Set(timeline.cues.filter(isAudio).map((item)=>item.src)))await loadAudio(src);
      time=clamp(time,0,timeline.duration_seconds-1/timeline.fps);
      changed();renderTimeline();syncInspector();status("已同步 Agent 修改");conflictReported=false;
    }
    if(state.view_revision!==remoteViewRevision){
      remoteViewRevision=state.view_revision;
      const view=state.view;
      pps=view.zoom;snap=view.snap;$("timeline-zoom").value=pps;$("snap-toggle").setAttribute("aria-pressed",String(snap));
      selectedId=view.selected_id;seek(view.time);renderTimeline();syncInspector();
      if(playing!==view.playing)await togglePlayback();
      if(view.panel==="plan")await openPlan();
      if(view.panel==="image")await $("image-tool-button").onclick();
      if(view.panel==="voice")await $("voice-tool-button").onclick();
      if(view.panel===null)for(const dialog of document.querySelectorAll("dialog[open]"))dialog.close();
    }
    annotations=await (await fetch("/api/annotations")).json();drawNotes();
    const viewReply=await fetch("/api/editor-view",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({expected_view_revision:remoteViewRevision,patch:{time,selected_id:selectedId||null,playing,zoom:pps,snap}})});
    if(viewReply.ok)remoteViewRevision=(await viewReply.json()).view_revision;
  }catch(error){status(`同步失败：${error.message}`,true);}
  finally{remoteSyncBusy=false;}
}
$("play-toggle").onclick = togglePlayback;
$("step-back").onclick = () => seek(time - 1 / timeline.fps);
$("step-forward").onclick = () => seek(time + 1 / timeline.fps);
$("go-start").onclick = () => seek(0);
$("save-button").onclick = safeSave; $("render-button").onclick = render;
$("plan-button").onclick = openPlan; $("close-plan").onclick = () => $("plan-dialog").close();
$("image-tool-button").onclick = async () => {
  try {
    const response = await fetch("/api/image-tool"), data = await response.json();
    $("image-tool-backend").replaceChildren(...data.backends.map((name) => {
      const option=document.createElement("option");option.value=option.textContent=name;return option;
    }));
    $("image-tool-mode").value=data.selected.image_path||"builtin";
    $("image-tool-backend").value=data.selected.backend||"openai";
    $("image-backend-field").hidden=$("image-tool-mode").value!=="external";
    $("image-tool-result").textContent="";$("image-tool-dialog").showModal();
  } catch(error){status(error.message,true);}
};
$("image-tool-mode").onchange=()=>{$("image-backend-field").hidden=$("image-tool-mode").value!=="external";};
$("close-image-tool").onclick=()=>$("image-tool-dialog").close();
let selectedVoiceConfig = {};
const voiceChoice = () => ({ ...selectedVoiceConfig,
  provider:$("voice-provider").value, region:$("voice-region").value, model:$("voice-model").value,
  speed:Number($("voice-speed").value), pitch:Number($("voice-pitch").value),
  voices:{...selectedVoiceConfig.voices,...Object.fromEntries([...$("voice-speakers").querySelectorAll("input")].map((input)=>[input.dataset.speaker,input.value.trim()]))},
  local_voices:{...selectedVoiceConfig.local_voices,...Object.fromEntries([...$("editor-local-voices").querySelectorAll("select")].map((input)=>[input.dataset.speaker,input.value]))},
});
$("voice-tool-button").onclick=async()=>{
  try{
    const response=await fetch("/api/voice-tool"),data=await response.json();
    if(!response.ok)throw new Error(data.error);
    selectedVoiceConfig=data.selected;
    for(const field of ["provider","region","model","speed","pitch"])$(`voice-${field}`).value=data.selected[field];
    const speakers=new Map(timeline.tracks.filter((track)=>track.kind==="voice").map((track)=>[track.id.replace(/^voice-/,""),track.name]));
    if(!speakers.size)speakers.set("narrator","旁白");
    $("voice-speakers").replaceChildren();$("voice-preview-speaker").replaceChildren();
    for(const [id,name] of speakers){
      const label=document.createElement("label");label.className="plan-field";
      const span=document.createElement("span");span.textContent=`${name} · Voice ID`;
      const input=document.createElement("input");input.className="text-input";input.dataset.speaker=id;
      input.value=data.selected.voices[id]||"";input.placeholder="MiniMax Voice ID";label.append(span,input);$("voice-speakers").append(label);
      const option=document.createElement("option");option.value=id;option.textContent=name;$("voice-preview-speaker").append(option);
    }
    $("voice-provider").onchange();
    const local=await (await fetch("/api/local-voices")).json();
    $("editor-local-voices").replaceChildren();
    if(local.available){
      for(const id of ["host-a","host-b","narrator"]){
        const label=document.createElement("label");label.className="plan-field";label.append(document.createTextNode(`${id} 本地音色`));
        const select=document.createElement("select");select.dataset.speaker=id;select.className="text-input";
        for(const voice of [{id:"",language:"按文本语言选择"},...local.voices]){
          const option=document.createElement("option");option.value=voice.id;option.textContent=`${voice.id} ${voice.language}`;select.append(option);
        }select.value=data.selected.local_voices?.[id]||"";label.append(select);$("editor-local-voices").append(label);
      }
    }else $("editor-local-voices").textContent=local.error;
    await mountCloneUI($("editor-clone"),{save:saveVoiceChoice,updated:async()=>{
      const next=await (await fetch("/api/voice-tool")).json();selectedVoiceConfig=next.selected;
      for(const input of $("voice-speakers").querySelectorAll("input"))input.value=next.selected.voices[input.dataset.speaker]||"";
    }});
    $("voice-speed").oninput();$("voice-pitch").oninput();
    $("voice-authorize").checked=false;$("voice-preview-audio").hidden=true;
    $("voice-tool-result").textContent=data.key_configured?"API Key 已配置（不显示密钥）。":"尚未配置 MiniMax API Key。";
    $("voice-tool-dialog").showModal();
  }catch(error){status(error.message,true);}
};
$("voice-provider").onchange=()=>{
  $("minimax-options").hidden=$("voice-provider").value!=="minimax";
  $("voice-preview-form").hidden=$("voice-provider").value!=="minimax";
  $("recording-options").hidden=$("voice-provider").value!=="provided";
  $("editor-clone").hidden=$("voice-provider").value!=="minimax";
  $("local-voice-options").hidden=$("voice-provider").value!=="local";
};
$("voice-speed").oninput=()=>{$("voice-speed-value").value=Number($("voice-speed").value).toFixed(2);};
$("voice-pitch").oninput=()=>{$("voice-pitch-value").value=$("voice-pitch").value;};
$("close-voice-tool").onclick=()=>{$("voice-preview-audio").pause();$("voice-tool-dialog").close();};
async function saveVoiceChoice(){
  const response=await fetch("/api/voice-tool",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(voiceChoice())});
  const result=await response.json();if(!response.ok)throw new Error(result.error);
  selectedVoiceConfig=result.selected;return result;
}
$("voice-tool-form").onsubmit=async(event)=>{
  event.preventDefault();
  try{
    const result=await saveVoiceChoice();
    $("voice-tool-result").textContent=result.env_file
      ?"已保存；.env 中填写 MINIMAX_API_KEY，可选 MINIMAX_TTS_BASE_URL / MINIMAX_TTS_MODEL。现有配置已保留。"
      :result.selected.provider==="provided"?"已选择上传配音。":"已选择 Agent 本地代配，效果较弱。";
  }catch(error){$("voice-tool-result").textContent=error.message;}
};
$("voice-preview-form").onsubmit=async(event)=>{
  event.preventDefault();if(!$("voice-authorize").checked)return;
  $("voice-preview-button").disabled=true;$("voice-tool-result").textContent="正在生成试听…";
  try{
    await saveVoiceChoice();
    const response=await fetch("/api/voice-preview",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text:$("voice-preview-text").value,speaker:$("voice-preview-speaker").value,authorized:true})});
    const result=await response.json();if(!response.ok)throw new Error(result.error);
    $("voice-preview-audio").src=`/${result.src}`;$("voice-preview-audio").hidden=false;
    $("voice-tool-result").textContent=`试听已就绪 · ${result.duration.toFixed(2)} 秒${result.cached?" · 复用缓存":""}`;
  }catch(error){$("voice-tool-result").textContent=error.message;}
  finally{$("voice-preview-button").disabled=false;$("voice-authorize").checked=false;}
};
let narrationResult;
$("narration-file").onchange=async()=>{
  const file=$("narration-file").files[0];if(!file)return;
  $("apply-narration").hidden=true;$("narration-result").textContent="正在导入配音…";
  try{
    const reply=await fetch(`/api/import-audio?name=${encodeURIComponent(file.name)}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
    const audio=await reply.json();if(!reply.ok)throw new Error(audio.error);
    const response=await fetch("/api/transcribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({src:audio.src,speaker:$("narration-speaker").value})});
    const result=await response.json();if(!response.ok)throw new Error(result.error);
    await pollNarration(result.job);
  }catch(error){$("narration-result").textContent=error.message;}
};
async function pollNarration(job){
  const response=await fetch("/api/transcription-status"),result=await response.json();
  if(result.job!==job)throw new Error("Transcription job changed; inspect narration assets");
  if(result.state==="running"){
    $("narration-result").textContent="本地识别中；首次使用会下载语音模型，录音不上传云端。";
    setTimeout(()=>pollNarration(job).catch((error)=>{$("narration-result").textContent=error.message;}),1500);return;
  }
  if(result.state==="error")throw new Error(result.error);
  narrationResult=result;$("narration-result").textContent=result.transcript.text;
  $("apply-narration").hidden=false;
}
$("apply-narration").onclick=async()=>{
  if(!narrationResult)return;
  try{
    if(playing)await togglePlayback();
    const start=frame(time,timeline.fps),end=frame(start+narrationResult.duration,timeline.fps),speaker=$("narration-speaker").value;
    checkpoint();
    if(end>timeline.duration_seconds){timeline.duration_seconds=end;project.duration_seconds=end;}
    const stem=`recording-${crypto.randomUUID().slice(0,8)}`,captionTrack=`${stem}-captions`;
    timeline.tracks.push({id:stem,kind:"voice",name:`录音 / ${speaker}`,visible:true,muted:false},
      {id:captionTrack,kind:"graphics",name:"识别字幕",visible:true,muted:false});
    timeline.cues.push({id:`${stem}-audio`,track_id:stem,kind:"voice",title:"上传配音",src:narrationResult.src,speaker,
      start_sec:start,end_sec:end,source_offset:0,source_duration:narrationResult.duration,volume:1});
    for(const [index,segment] of narrationResult.transcript.segments.entries()){
      const a=frame(start+segment.start,timeline.fps),b=frame(Math.min(end,start+segment.end),timeline.fps);if(b<=a)continue;
      timeline.cues.push({id:`${stem}-caption-${index}`,track_id:captionTrack,kind:"subtitle",title:`识别字幕 ${index+1}`,
        text:segment.text,speaker,start_sec:a,end_sec:b,words:segment.words,transform:{x:0,y:0,scale:1,rotation:0,opacity:1}});
    }
    await loadAudio(narrationResult.src);changed();renderTimeline();syncInspector();
    // Duration and timeline must be updated together, using the same Agent API.
    await fetch("/api/editor-presence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dirty:false})});
    const state=await (await fetch("/api/workspace")).json();
    if(state.timeline_hash!==timelineHash)throw new Error("Workspace changed; retain local transcript edits and merge before saving");
    const response=await fetch("/api/actions",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({expected_revision:state.revision,actions:[
        {type:"project.update",patch:{duration_seconds:project.duration_seconds}},
        {type:"timeline.replace",timeline},
      ]})});
    const result=await response.json();if(!response.ok)throw new Error(result.error);
    timelineHash=null;dirty=false;await syncRemote();
    $("narration-result").textContent="配音和识别字幕已加入；镜头与内容由 Agent 继续编排。";
    $("apply-narration").hidden=true;
  }catch(error){$("narration-result").textContent=error.message;}
};
$("image-tool-form").onsubmit=async(event)=>{
  event.preventDefault();
  try{
    const response=await fetch("/api/image-tool",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:$("image-tool-mode").value,backend:$("image-tool-backend").value})});
    const data=await response.json();if(!response.ok)throw new Error(data.error);
    $("image-tool-result").textContent=data.image_path==="external"
      ? `${data.env_created?"已生成":"保留已有"} ${data.env_file}；请在本机填写 ${Object.values(data.required_variables).join("、")}。`
      : "已选择内置工具；可用性由 Agent 检查。";
  }catch(error){$("image-tool-result").textContent=error.message;}
};
$("add-note").onclick = addNote; $("import-button").onclick = () => $("audio-file").click();
$("audio-file").onchange = () => importAudio($("audio-file").files[0]);
$("undo-button").onclick = async () => {
  if (!history.length) {await remoteUndo("undo");return;}
  future.push(clone(timeline)); timeline = history.pop(); changed(); renderTimeline(); syncInspector(); syncHistory();
  if (playing) restartAudio();
};
$("redo-button").onclick = async () => {
  if (!future.length) {await remoteUndo("redo");return;}
  history.push(clone(timeline)); timeline = future.pop(); changed(); renderTimeline(); syncInspector(); syncHistory();
  if (playing) restartAudio();
};
async function remoteUndo(command){
  try{
    if(dirty){status("请先保存当前微调，再撤销已保存的修改。",true);return;}
    const state=await (await fetch("/api/workspace")).json();
    const response=await fetch("/api/actions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expected_revision:state.revision,command})});
    const result=await response.json();if(!response.ok)throw new Error(result.error);
    await syncRemote();
  }catch(error){status(error.message,true);}
}
$("cue-title").onchange = () => edit(() => { if (cue()) cue().title = $("cue-title").value; });
$("cue-text").onchange = () => edit(() => { if (cue()) cue().text = $("cue-text").value; });
$("cue-start").onchange = () => edit(() => moveCue(timeline, selectedId, Number($("cue-start").value)));
$("cue-duration").onchange = () => edit(() => moveCue(timeline, selectedId, cue().start_sec + Number($("cue-duration").value), "right"));
for (const property of ["scale", "rotation", "opacity", "x", "y", "volume"]) {
  const input = $(`cue-${property}`);
  input.onpointerdown = () => checkpoint();
  input.onkeydown = (event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) checkpoint(); };
  input.oninput = () => {
    if (!cue()) return;
    const value = Number(input.value) / (["scale", "opacity", "volume"].includes(property) ? 100 : 1);
    if (property === "volume") cue().volume = value;
    else { cue().transform ||= { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }; cue().transform[property] = value; }
    changed(); syncInspector(); draw(); if (playing) restartAudio();
  };
}
$("delete-cue").onclick = () => {
  if (!cue()) return;
  edit(() => { timeline.cues = timeline.cues.filter((c) => c.id !== selectedId); selectedId = null; });
};
$("add-title").onclick = () => edit(() => {
  const track = timeline.tracks.find((t) => t.kind === "graphics");
  const start = frame(Math.min(time, timeline.duration_seconds - 1 / timeline.fps), timeline.fps);
  const item = { id: `title-${crypto.randomUUID().slice(0,8)}`, track_id: track.id, kind: "title",
    title: "新标题", text: "NEW PERSPECTIVE", start_sec: start, end_sec: frame(Math.min(timeline.duration_seconds, start + 1.5), timeline.fps),
    transform: { x: 0, y: -80, scale: 1, rotation: 0, opacity: 1 }, keyframes: [], asset_refs: [], evidence_refs: [] };
  timeline.cues.push(item); selectedId = item.id;
});
$("snap-toggle").onclick = () => { snap = !snap; $("snap-toggle").setAttribute("aria-pressed", String(snap)); };
$("timeline-zoom").oninput = () => {
  const viewport = $("timeline-viewport"), center = (viewport.scrollLeft + viewport.clientWidth / 2 - 44) / pps;
  pps = Number($("timeline-zoom").value); renderTimeline();
  viewport.scrollLeft = Math.max(0, center * pps + 44 - viewport.clientWidth / 2);
};
$("ruler").onpointerdown = (event) => {
  if (event.target.closest("button")) return;
  const set = (e) => seek((e.clientX - $("ruler").getBoundingClientRect().left - 44) / pps);
  set(event); $("ruler").setPointerCapture(event.pointerId); $("ruler").onpointermove = set;
  $("ruler").onpointerup = () => { $("ruler").onpointermove = null; };
};
$("playhead").firstElementChild.onpointerdown = (event) => {
  event.preventDefault();
  const handle = event.currentTarget;
  handle.setPointerCapture(event.pointerId);
  const move = (e) => seek((e.clientX - $("ruler").getBoundingClientRect().left - 44) / pps);
  handle.onpointermove = move;
  handle.onpointerup = handle.onpointercancel = () => { handle.onpointermove = null; };
};
document.addEventListener("keydown", (event) => {
  if (!timeline || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || [...document.querySelectorAll("dialog")].some((dialog)=>dialog.open)) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); seek(time - 1 / timeline.fps); }
  if (event.key === "ArrowRight") { event.preventDefault(); seek(time + 1 / timeline.fps); }
  if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); safeSave(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); $(event.shiftKey ? "redo-button" : "undo-button").click(); }
});
window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
new ResizeObserver(() => { if (timeline) renderTimeline(); }).observe($("timeline-viewport"));
boot().catch((error) => { status(`启动失败：${error.message}`, true); console.error(error); });
import { mountCloneUI } from "./clone-ui.js";
