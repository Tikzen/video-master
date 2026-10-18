const $ = (id) => document.getElementById(id);
const html = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const names = { mv:"音乐 MV",studio:"演播室讲解",product:"产品演示",report:"动态汇报",other:"其他方向",interactive:"逐轮选择，由 Agent 准备方案",one_sentence:"一句话完成，创意决策交给 Agent" };
const icons = () => window.lucide?.createIcons({ attrs:{width:16,height:16,"stroke-width":1.7} });
let workflow, project, shownStage, signature, formTouched=false, submitting=false;
async function api(route, data, method="POST") {
  const response=await fetch(`/api/${route}`,data===undefined?{}:{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);return result;
}
function tools() {
  const image=`<div class="tool-column">
      <label class="field"><span>图片与角色</span><select id="plan-image-mode"><option value="builtin">内置生图工具</option><option value="external">外部 API</option></select></label>
      <label class="field" id="plan-image-backend-field" hidden><span>生图服务</span><select id="plan-image-backend"></select></label>
      <div class="tool-status" id="plan-image-status"></div>
    </div>`;
  const voice=`<div class="tool-column">
      <label class="field"><span>配音</span><select id="plan-voice-provider"><option value="provided">上传已有配音</option><option value="minimax">MiniMax API / 音色克隆</option><option value="local">由 Agent 代配（本地系统语音）</option></select></label>
      <div id="plan-local-warning" class="tool-status" hidden>本地系统语音的自然度、情绪和表现力通常不如 MiniMax 或优质人工录音。</div>
      <details id="plan-local-voices" hidden><summary>本地音色</summary><div id="plan-local-voice-fields"></div></details>
      <details id="plan-voice-settings" hidden><summary>账户与音色</summary><div class="details-body">
        <label class="field"><span>MiniMax 账户地区</span><select id="plan-voice-region"><option value="cn">国内</option><option value="global">国际</option></select></label>
        <label class="field"><span>主播 A Voice ID</span><input id="plan-voice-a" placeholder="MiniMax Voice ID" /></label>
        <label class="field"><span>第二主播 Voice ID</span><input id="plan-voice-b" placeholder="MiniMax Voice ID" /></label>
        <label class="field"><span>旁白 Voice ID</span><input id="plan-voice-narrator" placeholder="MiniMax Voice ID" /></label>
      </div></details>
      <details id="plan-clone" hidden><summary>音色克隆</summary><div id="plan-clone-content" class="details-body"></div></details>
      <label class="field" id="plan-recording-field" hidden><span>上传已有配音</span><input id="plan-recording-file" type="file" accept="audio/*" /></label>
      <label class="field" id="plan-recording-speaker-field" hidden><span>录音角色</span><select id="plan-recording-speaker"><option value="narrator">旁白 / 暂未区分说话人</option><option value="host-a">主播 A</option><option value="host-b">主播 B</option></select></label>
      <div id="plan-transcript" class="tool-status"></div>
      <div class="tool-status" id="plan-voice-status"></div>
      <details id="plan-audition" hidden><summary>试听与语速</summary><div class="details-body">
        <div class="field-grid"><label class="field"><span>试听角色</span><select id="plan-audition-speaker"><option value="narrator">旁白</option><option value="host-a">主播 A</option><option value="host-b">主播 B</option></select></label>
        <label class="field"><span>模型</span><select id="plan-voice-model"><option>speech-2.8-turbo</option><option>speech-2.8-hd</option><option>speech-2.6-turbo</option><option>speech-2.6-hd</option></select></label></div>
        <label class="field"><span>语速 <output id="plan-speed-value">1</output></span><input id="plan-voice-speed" type="range" min=".5" max="2" step=".05" value="1" /></label>
        <label class="field"><span>试听文本</span><input id="plan-audition-text" maxlength="200" value="欢迎来到 Video Master，今天我们用代码制作视频。" /></label>
        <label id="plan-audition-consent" class="consent"><input id="plan-audition-authorize" type="checkbox" />授权此次 MiniMax 付费试听并发送以上文本</label>
        <button id="plan-audition-button" class="button" type="button"><i data-lucide="volume-2"></i>生成试听</button>
        <audio id="plan-audition-audio" controls hidden></audio>
      </div></details>
    </div>`;
  return `<section class="band"><h2>制作工具</h2><div class="tools">${image}${voice}</div></section>`;
}
async function attachTools() {
  const owner=$("plan-image-mode").closest("form");
  const [images,voice]=await Promise.all([api("image-tool"),api("voice-tool")]);
  if(!owner.isConnected)return false;
  $("plan-image-backend").innerHTML=images.backends.map((name)=>`<option>${html(name)}</option>`).join("");
  $("plan-image-mode").value=images.selected.image_path||"builtin";$("plan-image-backend").value=images.selected.backend||"openai";
  $("plan-voice-provider").value=voice.selected.provider;$("plan-voice-region").value=voice.selected.region;
  $("plan-voice-a").value=voice.selected.voices["host-a"]||"";$("plan-voice-b").value=voice.selected.voices["host-b"]||"";
  $("plan-voice-narrator").value=voice.selected.voices.narrator||"";
  $("plan-voice-model").value=voice.selected.model;$("plan-voice-speed").value=voice.selected.speed;
  $("plan-voice-speed").oninput=()=>{$("plan-speed-value").value=$("plan-voice-speed").value;};$("plan-voice-speed").oninput();
  const local=await api("local-voices");
  if(!owner.isConnected)return false;
  $("plan-local-voice-fields").innerHTML=local.available?["host-a","host-b","narrator"].map((speaker)=>`<label class="field"><span>${html({"host-a":"主播 A","host-b":"主播 B",narrator:"旁白"}[speaker])}本地音色</span><select data-local-voice="${speaker}"><option value="">按文本语言选择已安装音色</option>${local.voices.map((v)=>`<option value="${html(v.id)}" ${voice.selected.local_voices?.[speaker]===v.id?"selected":""}>${html(v.id)} · ${html(v.language)}</option>`).join("")}</select></label>`).join(""):`<div class="tool-status">${html(local.error)}</div>`;
  $("plan-image-mode").onchange=()=>{$("plan-image-backend-field").hidden=$("plan-image-mode").value!=="external";};
  $("plan-voice-provider").onchange=()=>{
    $("plan-voice-settings").hidden=$("plan-voice-provider").value!=="minimax";
    $("plan-clone").hidden=$("plan-voice-provider").value!=="minimax";
    $("plan-local-warning").hidden=$("plan-voice-provider").value!=="local";
    $("plan-local-voices").hidden=$("plan-voice-provider").value!=="local";
    $("plan-audition").hidden=$("plan-voice-provider").value==="provided";
    $("plan-audition-consent").hidden=$("plan-voice-provider").value!=="minimax";
    $("plan-voice-model").closest("label").hidden=$("plan-voice-provider").value!=="minimax";
    $("plan-recording-field").hidden=$("plan-voice-provider").value!=="provided";
    $("plan-recording-speaker-field").hidden=$("plan-voice-provider").value!=="provided";
    $("plan-voice-status").textContent=$("plan-voice-provider").value==="minimax"?(voice.key_configured?"MiniMax Key 已配置":"MiniMax Key 待配置；付费调用另行授权。"):$("plan-voice-provider").value==="local"?"使用已安装的本地系统音色。":"录音导入后在本地识别文字与时间码。";
  };
  $("plan-image-mode").onchange();$("plan-voice-provider").onchange();
  await mountCloneUI($("plan-clone-content"),{save:saveVoiceTools,updated:async()=>{
    const next=(await api("voice-tool")).selected;
    $("plan-voice-a").value=next.voices["host-a"]||"";
    $("plan-voice-b").value=next.voices["host-b"]||"";
    $("plan-voice-narrator").value=next.voices.narrator||"";
  }});
  if(!owner.isConnected)return false;
  $("plan-audition-button").onclick=async()=>{
    const paid=$("plan-voice-provider").value==="minimax";
    if(paid&&!$("plan-audition-authorize").checked){$("plan-voice-status").textContent="请先授权此次付费试听。";return;}
    $("plan-audition-button").disabled=true;
    try{
      await saveVoiceTools();
      const result=await api("voice-preview",{speaker:$("plan-audition-speaker").value,text:$("plan-audition-text").value,authorized:paid});
      $("plan-audition-audio").src=`/${result.src}`;$("plan-audition-audio").hidden=false;
      $("plan-voice-status").textContent=`试听已就绪 · ${result.duration.toFixed(2)} 秒`;
    }catch(error){$("plan-voice-status").textContent=error.message;}
    finally{$("plan-audition-button").disabled=false;$("plan-audition-authorize").checked=false;}
  };
  $("plan-recording-file").onchange=async()=>{
    const file=$("plan-recording-file").files[0];if(!file)return;
    formTouched=true;$("plan-transcript").textContent="正在导入录音…";
    try{
      const response=await fetch(`/api/import-audio?name=${encodeURIComponent(file.name)}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      const audio=await response.json();if(!response.ok)throw new Error(audio.error);
      const job=await api("transcribe",{src:audio.src,speaker:$("plan-recording-speaker").value});pollTranscript(job.job);
    }catch(error){$("plan-transcript").textContent=error.message;}
  };
  return true;
}
async function pollTranscript(job){
  try{
    const result=await api("transcription-status");
    if(!$("plan-transcript"))return;
    if(result.job!==job)throw new Error("Transcription job changed");
    if(result.state==="running"){$("plan-transcript").textContent="本地识别文字与时间码中；首次使用下载模型，录音不上传云端。";setTimeout(()=>pollTranscript(job),1500);return;}
    if(result.state==="error")throw new Error(result.error);
    $("plan-transcript").textContent=result.transcript.text;
    $("plan-recording-field").dataset.src=result.src;
  }catch(error){if($("plan-transcript"))$("plan-transcript").textContent=error.message;}
}
async function saveVoiceTools(){
  const current=(await api("voice-tool")).selected;
  const voice=await api("voice-tool",{...current,provider:$("plan-voice-provider").value,region:$("plan-voice-region").value,
    model:$("plan-voice-model").value,speed:Number($("plan-voice-speed").value),
    local_voices:{...current.local_voices,...Object.fromEntries([...document.querySelectorAll("[data-local-voice]")].map((el)=>[el.dataset.localVoice,el.value]))},
    voices:{...current.voices,"host-a":$("plan-voice-a").value.trim(),narrator:$("plan-voice-narrator").value.trim(),"host-b":$("plan-voice-b").value.trim()}});
  $("plan-voice-status").textContent=voice.env_file?"在本机 .env 填写 MINIMAX_API_KEY。":voice.selected.provider==="provided"?"已选择上传配音。":"已选择 Agent 本地代配，效果较弱。";
}
async function saveTools(){
  const image=await api("image-tool",{mode:$("plan-image-mode").value,backend:$("plan-image-backend").value});
  $("plan-image-status").textContent=image.env_file?"在本机 .env 填写生图 API 配置；现有值保留。":"已选择内置工具，由 Agent 检查可用性。";
  await saveVoiceTools();
}
function receipt(values, proposal){
  return `<dl class="receipt">${Object.entries(values).filter(([key])=>key!=="selected").map(([key,value])=>`<dt>${html(proposal.fields?.[key]?.label||key)}</dt><dd>${html(names[value]||value)}</dd>`).join("")}</dl>`;
}
async function draw(){
  const target=$("planner-content"),stage=shownStage||workflow.active_stage;
  const confirmed=workflow.confirmations[stage];
  $("stage-title").textContent={stage1:"这一轮，确定创作方向",stage2:"这一轮，选择制作方案",handoff:"创作方向已确认",images:"生图与素材",voice:"配音与音色",music:"这一轮，选择配乐",quality:"美学与目标自测（实验性）",review:"审阅与确认",production:"制作与检查",delivery:"成片交付"}[stage];
  $("stage-badge").textContent=stage==="quality"?"实验性 · 可选增强":confirmed||stage==="handoff"?"已确认":stage==="production"?(workflow.production.status==="done"?"已完成":"Agent 制作"):"待确认";
  $("stage-summary").textContent=stage==="stage1"?workflow.stage1.summary||"":stage==="stage2"?"三套方案分别包含视觉、镜头、节奏和制作路径。":"";
  $("agent-status").textContent=workflow.production.message||{stage1:"等待方向确认",stage2:"等待方案确认",production:"制作中"}[workflow.active_stage];
  document.querySelectorAll("[data-stage]").forEach((button)=>{
    button.setAttribute("aria-current",String(button.dataset.stage===(stage==="handoff"?"stage1":stage)));
    button.classList.toggle("complete",!!workflow.confirmations[button.dataset.stage]);
  });
  if(stage==="handoff"){
    target.innerHTML=`<section class="waiting"><h2>${workflow.delegated?"已委托 Agent 完成创作":"等待 Agent 准备下一轮方案"}</h2>${workflow.treatment_request?.proposal_hash===workflow.stage2.proposal_hash?`<p>${html(workflow.treatment_request.text)}</p>`:receipt(workflow.confirmations.stage1?.values||{},workflow.stage1)}</section>`;
  }else if(stage==="music"){
    await mountMusicUI(target,{api,touched:()=>{formTouched=true;},saved:()=>{formTouched=false;}});
  }else if(stage==="quality"){
    await mountQualityUI(target,{api,touched:()=>{formTouched=true;},saved:()=>{formTouched=false;}});
  }else if(stage==="images"||stage==="voice"){
    target.innerHTML=`<form id="tools-form">${tools()}<div class="submit-row"><span>保存配置不发起付费调用。</span><button class="button primary" type="submit" disabled><i data-lucide="save"></i>保存工具方案</button></div></form>`;
    document.querySelector(stage==="images"?".tool-column:nth-child(2)":".tool-column:first-child").hidden=true;
    document.querySelector(".tools").classList.add("single-tool");
    icons();if(!await attachTools())return;
    $("tools-form").oninput=()=>{formTouched=true;};
    $("tools-form").onsubmit=async(event)=>{event.preventDefault();try{await saveTools();formTouched=false;$("planner-message").textContent="工具方案已保存。";}catch(error){$("planner-message").textContent=error.message;}};
    $("tools-form").querySelector("[type=submit]").disabled=false;
  }else if(stage==="review"){
    const [items,notes,deliveries]=await Promise.all([api("checkpoints"),api("annotations"),api("deliveries")]);
    target.innerHTML=`${items.length?items.map((item)=>`<section class="band checkpoint"><h2>${html(item.proposal.title)}</h2>
      ${item.proposal.notice?`<div class="checkpoint-notice">${html(item.proposal.notice)}</div>`:""}
      <div class="review-copy">${html(item.proposal.body)}</div>${mediaPreview(item.proposal.media)}
      ${item.response?`<div class="tool-status">已提交：${item.response.candidate?`${html(item.proposal.candidates?.find((c)=>c.id===item.response.candidate)?.label)} · `:""}${html(item.proposal.options.find((o)=>o.id===item.response.selected)?.label)} · ${html(item.response.note)}${item.response.uploads?.length?` · 已上传 ${item.response.uploads.length} 张图`:""}</div>`
      :`<form data-checkpoint="${html(item.proposal.id)}">${gallery(item.proposal)}${item.proposal.allow_upload?`<label class="field upload-field"><span>${html(item.proposal.allow_upload.label)}</span><input type="file" name="upload" accept="image/png,image/jpeg,image/webp" multiple /><small class="upload-status">${html(item.proposal.allow_upload.hint||"")}</small></label>`:""}
      <label class="field"><span>处理意见</span><select name="selected">${item.proposal.options.map((o)=>`<option value="${html(o.id)}">${html(o.label)}</option>`).join("")}</select></label>
      <details><summary>自定义意见</summary><label class="field details-body"><span>补充意见</span><textarea name="note" rows="3"></textarea></label></details>
      ${item.proposal.requires_consent?`<label class="consent"><input name="consent" type="checkbox" />确认以上外部服务、数据发送范围与费用说明（选择执行时）</label>`:""}
      <button class="button primary" type="submit"><i data-lucide="check"></i>提交意见</button></form>`}</section>`).join(""):`<section class="band"><h2>暂无待确认事项</h2></section>`}
      <section class="band"><h2>成片与时间点批注</h2>${deliveries.files[0]?`<video id="review-video" src="/${html(deliveries.files[0].path)}" controls preload="metadata"></video>`:""}
      <form id="review-note-form"><div class="field-grid"><label class="field"><span>时间（秒）</span><input name="time" type="number" min="0" step=".1" value="0" /></label>
      <label class="field"><span>修改意见</span><textarea name="text" required rows="2"></textarea></label></div><button class="button" type="submit"><i data-lucide="message-square-plus"></i>添加批注</button></form>
      <div class="review-notes">${notes.map((note)=>`<div><strong>${Number(note.time_sec).toFixed(2)}s</strong><span>${html(note.text)}</span><small>${note.status==="resolved"?"已处理":"待 Agent 处理"}</small></div>`).join("")}</div></section>`;
    document.querySelectorAll("[data-checkpoint]").forEach((form)=>{form.oninput=()=>{formTouched=true;};form.onsubmit=async(event)=>{
      event.preventDefault();const item=items.find((entry)=>entry.proposal.id===form.dataset.checkpoint),values=Object.fromEntries(new FormData(form));
      try{
        const uploads=[];
        for(const file of [...(form.querySelector("[name=upload]")?.files||[])].slice(0,item.proposal.allow_upload?.max??4)){
          form.querySelector(".upload-status").textContent=`正在上传 ${file.name}…`;
          const response=await fetch(`/api/import-image?name=${encodeURIComponent(file.name)}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
          const result=await response.json();if(!response.ok)throw new Error(result.error);uploads.push(result.src);
        }
        await api("checkpoint-response",{id:item.proposal.id,proposal_hash:item.proposal_hash,selected:values.selected,note:values.note||"",consent:values.consent==="on",
          ...(values.candidate?{candidate:values.candidate}:{}),uploads});
        formTouched=false;signature=null;await refresh();
      }
      catch(error){$("planner-message").textContent=error.message;}
    };});
    $("review-note-form").oninput=()=>{formTouched=true;};
    $("review-note-form").onsubmit=async(event)=>{
      event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
      try{await api("annotations",{time_sec:Number(values.time),text:values.text});formTouched=false;signature=null;await refresh();}
      catch(error){$("planner-message").textContent=error.message;}
    };
    $("review-video")?.addEventListener("timeupdate",()=>{if(!formTouched)document.querySelector('[name="time"]').value=$("review-video").currentTime.toFixed(1);});
  }else if(stage==="stage1"){
    const proposal=workflow.stage1,values=confirmed?.values||{};
    const selectedGenre=values.genre||proposal.fields?.genre?.value||proposal.context?.genre||project.mode||"product";
    const showGenre=Object.hasOwn(proposal.fields||{},"genre");
    const descriptions={mv:"音乐节拍 · 动态排版 · 节奏切镜",studio:"双主播 · 角色差分 · 大屏聚焦",product:"产品特写 · 功能拆解 · 镜头推进",report:"动态翻页 · 数据图表 · 重点汇报"};
    const genreChoices=proposal.fields?.genre?.choices?.length
      ?proposal.fields.genre.choices.map((item)=>typeof item==="string"?{value:item,label:names[item]}:item)
      :[selectedGenre,...Object.keys(descriptions)].filter((key,i,all)=>descriptions[key]&&all.indexOf(key)===i).slice(0,3).map((key)=>({value:key,label:names[key],description:descriptions[key]}));
    target.innerHTML=`<form id="direction-form" novalidate>
      ${showGenre?`<section class="band"><h2>整体内容方向</h2>
      <div class="genre-grid round-genres">${genreChoices.slice(0,3).map((choice)=>`<label class="genre"><img src="/assets/catalog/${html(choice.value)}-v2.png" alt="${html(choice.label||names[choice.value])}代码场景示意" /><span><input type="radio" name="genre" value="${html(choice.value)}" ${selectedGenre===choice.value?"checked":""} /><strong>${html(choice.label||names[choice.value])}</strong></span><small>${html(choice.description||descriptions[choice.value])}</small></label>`).join("")}</div>
      <label class="other-direction"><input type="radio" name="genre" value="other" ${selectedGenre==="other"?"checked":""}/><span>自定义方向 / 其他风格</span></label>
      <div data-other-direction hidden><label class="field"><span>其他方向与风格</span><textarea name="custom_direction" rows="2" placeholder="例如：复古漫画 × 科技发布会">${html(values.custom_direction||"")}</textarea></label></div></section>`:""}
      ${proposal.context?`<details class="known-context"><summary>已知信息</summary>${receipt(proposal.context,proposal)}</details>`:""}
      <section class="band creative-choices"><div id="topic-choices">${choiceFields(proposal,values,["topic"],selectedGenre)}</div>
      <div data-creative-optional><div id="intent-choices">${choiceFields(proposal,values,["audience","purpose"],selectedGenre)}</div><div id="style-choices">${choiceFields(proposal,values,["style"],selectedGenre)}</div></div></section>
      <section class="decision-mode"><div class="mode-choice" role="group" aria-label="决策方式">${["interactive","one_sentence"].map((mode)=>`<label><input type="radio" name="mode" value="${mode}" ${(values.mode||proposal.fields?.mode?.value||"interactive")===mode?"checked":""}/>${mode==="interactive"?"逐轮选择":"一句话完成"}</label>`).join("")}</div></section>
      <div class="submit-row"><span>${confirmed?"更新方向会使后续旧方案失效。":""}</span><button class="button primary" type="submit"><i data-lucide="check"></i>${confirmed?"更新创作方向":"确认方向，交给 Agent"}</button></div></form>`;
    const form=$("direction-form");
    const draft=mountChoiceDraft(form,`${project.name}:stage1:${proposal.proposal_hash}`);
    const restored=Object.fromEntries(new FormData(form));
    $("style-choices").innerHTML=choiceFields(proposal,restored,["style"],restored.genre||selectedGenre);
    draft.update();
    form.addEventListener("input",()=>{formTouched=true;});
    form.addEventListener("change",(event)=>{
      formTouched=true;
      if(event.target.name==="genre"){
        const current=Object.fromEntries(new FormData(form));
        $("style-choices").innerHTML=choiceFields(proposal,current,["style"],current.genre);
        draft.update();
      }
    });
    $("direction-form").onsubmit=async(event)=>{
      event.preventDefault();if(submitting)return;submitting=true;const form=event.currentTarget;
      try{
        const delegated=form.querySelector('[name=mode]:checked').value==="one_sentence";
        const values=readChoices(form,["genre","topic","mode","custom_direction",...(delegated?[]:["audience","purpose","style"])]);
        if(values.genre==="other"&&!values.custom_direction.trim()){
          form.querySelector("[name=custom_direction]").focus();throw new Error("请说明其他方向与风格，或选择已有方向。");
        }
        if(values.genre!=="other")delete values.custom_direction;
        await api("confirm",{stage:"stage1",round:"creative-direction",revision:proposal.revision,proposal_hash:proposal.proposal_hash,values});
        draft.clear();
        formTouched=false;shownStage=delegated?"production":"handoff";signature=null;
        history.replaceState(null,"",`/create?round=${delegated?"production":"stage1"}&submitted=1`);
        submitting=false;await refresh();
      }catch(error){$("planner-message").textContent=error.message;}
      finally{submitting=false;}
    };
  }else if(stage==="stage2"){
    const proposal=workflow.stage2;
    if(!workflow.confirmations.stage1){
      target.innerHTML=`<section class="waiting"><h2>先确认创作方向</h2><p>完整方案会围绕确认后的目标、风格和素材编排。</p></section>`;
    }else if(workflow.delegated){
      target.innerHTML=`<section class="waiting"><h2>已选择一句话完成</h2><p>创意决策已委托 Agent，付费调用仍需单独授权。</p>${receipt(workflow.confirmations.stage1.values,workflow.stage1)}</section>`;
    }else if(!proposal.stage||proposal.stage1_hash!==workflow.confirmations.stage1_hash){
      target.innerHTML=`<section class="waiting"><h2>方向已收到，等待 Agent 提交三套方案</h2><p>你不需要写台本或安排镜头。</p>${receipt(workflow.confirmations.stage1.values,workflow.stage1)}</section>`;
    }else{
      target.innerHTML=`<form id="treatment-form" novalidate><section class="band"><div class="treatments">${proposal.candidates.map((candidate,i)=>`
        <label class="treatment">${candidate.preview?`<img src="/${html(candidate.preview)}" alt="${html(candidate.name)}方向预览" />`:`<canvas data-treatment="${i}" width="640" height="360" aria-label="${html(candidate.name)}动效示意"></canvas>`}
        <div class="treatment-body">${candidate.recommended?"<span class='recommended'>Agent 推荐</span>":""}<div class="treatment-heading"><input type="radio" name="selected" value="${html(candidate.id)}" ${(confirmed?.values.selected||proposal.candidates.find((item)=>item.recommended)?.id||proposal.candidates[0].id)===candidate.id?"checked":""} /><h3>${html(candidate.name)}</h3></div>
        <p class="treatment-concept">${html(candidate.concept)}</p><details><summary>视觉、镜头与执行</summary><dl>${[["image_system","视觉"],["motion_system","运动与切镜"],["structure","叙事结构"],["execution","素材与执行"]].map(([key,label])=>`<dt>${label}</dt><dd>${html(candidate[key]||candidate.description)}</dd>`).join("")}</dl></details></div></label>`).join("")}</div></section>
        <fieldset class="choice-field" data-choice-field="selected"><div class="choice-options"><label class="custom-choice"><input type="radio" name="selected" value="__custom__"/><span>自定义方案</span></label></div><div data-custom-field="selected" hidden><label class="field"><span>希望如何调整方案</span><input name="selected_custom" /></label></div></fieldset>
        ${Object.keys(proposal.fields||{}).length?`<section class="band"><h2>本轮制作选择</h2><div class="creative-choices">${choiceFields(proposal,confirmed?.values||{},undefined,workflow.confirmations.stage1.values.genre)}</div></section>`:""}
        <div class="submit-row"><span>付费服务与声音克隆需单独授权。</span><button class="button primary" type="submit"><i data-lucide="check"></i>确认方案，交给 Agent 制作</button></div></form>`;
      animateTreatments();
      const draft=mountChoiceDraft($("treatment-form"),`${project.name}:stage2:${proposal.proposal_hash}`);
      $("treatment-form").oninput=()=>{formTouched=true;};
      $("treatment-form").onsubmit=async(event)=>{
        event.preventDefault();
        try{
          const form=event.currentTarget;
          if(form.querySelector('[name=selected]:checked').value==="__custom__"){
            const text=form.querySelector("[name=selected_custom]").value.trim();
            if(!text)throw new Error("请描述自定义方案，或选择已有方案。");
            await api("treatment-request",{proposal_hash:proposal.proposal_hash,text});
            shownStage="handoff";
            history.replaceState(null,"","/create?round=stage2&submitted=1");
          }else{
            await api("confirm",{stage:"stage2",revision:proposal.revision,proposal_hash:proposal.proposal_hash,values:readChoices(form)});
            shownStage="production";
          }
          draft.clear();formTouched=false;signature=null;await refresh();
        }
        catch(error){$("planner-message").textContent=error.message;}
      };
    }
  }else if(stage==="production"){
    const production=workflow.production;
    target.innerHTML=`<section class="band"><h2>${html(production.message||"等待 Agent 接续制作")}</h2><ul class="progress-list">${(production.steps||[]).map((step)=>`<li><i data-lucide="${step.status==="done"?"circle-check":step.status==="blocked"?"circle-alert":"circle"}"></i>${html(step.label)}<span>${html({done:"完成",working:"进行中",pending:"待处理",blocked:"等待条件"}[step.status]||step.status)}</span></li>`).join("")}</ul><a class="button" href="/"><i data-lucide="sliders-horizontal"></i>打开微调工作台</a></section>`;
  }else{
    const deliveries=await api("deliveries");
    target.innerHTML=`<section class="band">${deliveries.files.length?deliveries.files.map((file)=>`<div class="artifact"><i data-lucide="film"></i><div><h3>${html(file.name)}</h3><p>${(file.bytes/1024/1024).toFixed(1)} MB</p></div><a class="button" href="/${html(file.path)}" target="_blank"><i data-lucide="play"></i>播放</a><a class="button" href="/${html(file.path)}" download><i data-lucide="download"></i></a></div>`).join(""):"<h2>尚未导出成片</h2>"}</section>`;
  }
  icons();
}
// Gallery checkpoint: rendered/generated candidates (studio looks, host designs, host sources).
function gallery(proposal){
  if(!proposal.candidates)return "";
  const fallback=proposal.candidates.find((c)=>c.recommended)?.id;
  return `<div class="gallery">${proposal.candidates.map((c)=>{
    const media=(Array.isArray(c.media)?c.media:c.media?[c.media]:[]);
    return `<label class="gallery-card${c.warning?" discouraged":""}">${media.length?`<div class="gallery-media${media.length>1?" multi":""}">${media.map((src)=>/\.(mp4|webm)$/i.test(src)?`<video src="/${html(src)}" muted loop autoplay playsinline></video>`:`<img src="/${html(src)}" alt="${html(c.label)}" />`).join("")}</div>`:""}
      <span class="gallery-heading"><input type="radio" name="candidate" value="${html(c.id)}" ${c.id===fallback?"checked":""} /><strong>${html(c.label)}</strong>${c.recommended?"<em class='recommended'>Agent 推荐</em>":""}</span>
      ${c.description?`<small>${html(c.description)}</small>`:""}${c.warning?`<small class="gallery-warning">${html(c.warning)}</small>`:""}</label>`;
  }).join("")}</div>`;
}
function mediaPreview(src){
  if(!src)return "";
  const url=`/${html(src)}`;
  if(/\.(mp4|webm)$/i.test(src))return `<video class="checkpoint-media" src="${url}" controls preload="metadata"></video>`;
  if(/\.(mp3|wav|m4a|ogg)$/i.test(src))return `<audio class="checkpoint-media" src="${url}" controls></audio>`;
  if(/\.(png|jpg|jpeg|webp|svg)$/i.test(src))return `<img class="checkpoint-media" src="${url}" alt="审阅素材" />`;
  return "";
}
let animationId;
function animateTreatments(){
  cancelAnimationFrame(animationId);
  const started=performance.now();
  const tick=(now)=>{
    const canvases=document.querySelectorAll("[data-treatment]");if(!canvases.length)return;
    const t=(now-started)/1000;
    for(const canvas of canvases){
      const index=Number(canvas.dataset.treatment),ctx=canvas.getContext("2d"),accent=["#ef6658","#e9bb4f","#d3b7e9"][index];
      ctx.fillStyle=["#26252a","#282525","#282735"][index];ctx.fillRect(0,0,640,360);
      ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.save();ctx.translate(320,180);ctx.rotate(Math.sin(t*.5+index)*.12);
      for(let j=0;j<7;j++){const r=48+j*21+Math.sin(t*1.8+j)*8;ctx.globalAlpha=1-j*.1;ctx.strokeRect(-r,-r*.5,r*2,r);}
      ctx.restore();ctx.globalAlpha=1;ctx.fillStyle=accent;ctx.font="600 38px Segoe UI";ctx.fillText(["FOCUS","RHYTHM","STORY"][index],45,80);
      ctx.fillStyle="#fff";ctx.font="14px Microsoft YaHei";ctx.fillText("动效方向示意 · 非最终画面",45,318);
    }
    animationId=requestAnimationFrame(tick);
  };
  animationId=requestAnimationFrame(tick);
}
async function refresh(){
  workflow=await api("workflow");
  const extra=shownStage==="review"?await Promise.all([api("checkpoints"),api("annotations"),api("deliveries")]):shownStage==="delivery"?await api("deliveries"):shownStage==="quality"?await api("quality-review"):null;
  const next=JSON.stringify([workflow,extra]);
  if(signature===next||formTouched||submitting)return;
  signature=next;await draw();
}
document.querySelectorAll("[data-stage]").forEach((button)=>{button.onclick=async()=>{
  if(formTouched&&!document.querySelector("[data-choice-draft]")&&!confirm("当前修改尚未提交，切换阶段会丢弃修改。"))return;
  formTouched=false;shownStage=button.dataset.stage;signature=null;await refresh();
};});
async function boot(){
  project=await api("video");$("planner-project").textContent=project.name;
  const params=new URLSearchParams(location.search),requested=params.get("panel")||params.get("round");
  if(["images","voice","music","quality","review","production","delivery"].includes(requested))shownStage=requested;
  if(["stage1","stage2"].includes(requested))shownStage=params.get("submitted")==="1"?"handoff":requested;
  await Promise.all([refresh(),bootPreview()]);window.__plannerReady=true;
  setInterval(()=>refresh().catch((error)=>{$("planner-message").textContent=error.message;}),2000);
}
async function bootPreview(){
  let timeline=await api("timeline"),playing=false,time=Math.min(1,project.duration_seconds*.1),last=performance.now(),busy=false,previewDirection;
  await loadVisuals(timeline);
  $("preview-name").textContent=project.name;
  $("preview-time").max=timeline.duration_seconds;
  $("preview-facts").innerHTML=`<dt>画幅</dt><dd>${project.width} × ${project.height}</dd><dt>帧率</dt><dd>${project.fps} fps</dd><dt>时长</dt><dd>${timeline.duration_seconds.toFixed(2)}s</dd>`;
  $("preview-time").oninput=()=>{time=Number($("preview-time").value);};
  $("preview-play").onclick=()=>{playing=!playing;$("preview-play").innerHTML=`<i data-lucide="${playing?"pause":"play"}"></i>`;icons();};
  const tick=async(now)=>{
    if(playing)time=(time+(now-last)/1000)%timeline.duration_seconds;
    last=now;$("preview-time").value=time;$("preview-readout").value=`${time.toFixed(2)}s`;
    if(!busy){busy=true;try{
      const direction=["stage1","stage2","handoff"].includes(shownStage||workflow?.active_stage||"stage1");
      const genre=document.querySelector('[name="genre"]:checked')?.value||workflow?.confirmations.stage1?.values.genre||workflow?.stage1.context?.genre||project.mode||"product";
      $("preview-name").textContent=direction?`${names[genre]} · 场景示意`:project.name;
      document.querySelector(".preview-heading .section-label").textContent=direction?"DIRECTION STUDY":"CURRENT PROGRAM";
      if(direction!==previewDirection){
        previewDirection=direction;
        $("preview-facts").innerHTML=direction?`<dt>展示</dt><dd>方向场景示意</dd><dt>画幅</dt><dd>16:9</dd><dt>渲染</dt><dd>代码绘制</dd>`:`<dt>画幅</dt><dd>${project.width} × ${project.height}</dd><dt>帧率</dt><dd>${project.fps} fps</dd><dt>时长</dt><dd>${timeline.duration_seconds.toFixed(2)}s</dd>`;
      }
      if(direction)renderCatalog($("planner-canvas").getContext("2d"),genre==="other"?project.mode:genre,time);
      else{await prepareVisuals(timeline,time);renderFrame($("planner-canvas").getContext("2d"),timeline,time,640,360);}
    }finally{busy=false;}}
    requestAnimationFrame(tick);
  };await tick(performance.now());
  setInterval(async()=>{try{const next=await api("timeline");if(JSON.stringify(next)!==JSON.stringify(timeline)){timeline=next;await loadVisuals(timeline);$("preview-time").max=timeline.duration_seconds;time=Math.min(time,timeline.duration_seconds);}}catch{}},3000);
}
boot().catch((error)=>{$("planner-message").textContent=error.message;});
import { mountCloneUI } from "./clone-ui.js";
import { renderFrame } from "./scene.js";
import { loadVisuals, prepareVisuals } from "./mv.js";
import { choiceFields, readChoices, mountChoiceDraft } from "./choice-fields.js";
import { renderCatalog } from "./catalog-scenes.js";
import { mountMusicUI } from "./music-ui.js";
import { mountQualityUI } from "./quality-ui.js";
