import { choiceFields,readChoices,mountChoiceDraft } from "./choice-fields.js";
const escape=(value)=>String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function mountMusicUI(target,{api,touched,saved}){
  const {selected,styles}=await api("music-tool");
  if(!target.isConnected)return;
  const modes={fields:{mode:{label:"配乐来源",value:selected.mode,choices:[
    {value:"procedural",label:"简单配乐",description:"本地代码合成的纯音乐"},
    {value:"provided",label:"使用已有音乐",description:"上传或选用已授权的音频"},
    {value:"none",label:"不配乐",description:"保留配音、音效或安静画面"}]}}};
  // Custom requests are handed to the Agent, never parsed as arbitrary composition.
  modes.fields.mode.allow_custom=true;
  const tones={fields:{style:{label:"配乐基调",value:selected.style,choices:styles.map((style)=>({value:style.id,label:style.label,description:`${style.bpm} BPM`}))}}};
  target.innerHTML=`<form id="music-form" novalidate>
    <section class="band">${choiceFields(modes,{mode:selected.mode==="custom"?"__custom__":selected.mode,mode_custom:selected.custom},["mode"])}</section>
    <section class="band" data-music-procedural hidden>
      ${choiceFields(tones,{style:selected.style},["style"])}
      <p class="confirmation-note">简单合成纯音乐，无人声演唱；适合演示与基础配乐，不等同于专业歌曲生成。</p>
      <div class="music-preview-row"><button class="button" type="button" data-music-preview><i data-lucide="volume-2"></i>生成试听</button><audio data-music-audio controls hidden></audio></div>
      <details><summary>节奏</summary><div class="details-body field-grid">
        <label class="field"><span>速度（BPM）</span><input type="number" name="bpm" min="40" max="220" value="${selected.bpm}"/></label>
      </div></details></section>
    <section class="band" data-music-provided hidden><label class="field"><span>上传已有音乐</span><input type="file" data-music-file accept="audio/*"/></label>
      <details><summary>已有项目文件</summary><label class="field details-body"><span>项目内音频路径</span><input name="src" value="${escape(selected.src)}" placeholder="audio/music/my-track.wav"/></label></details>
      <p class="confirmation-note">请使用原创或已获授权的音乐。</p></section>
    <details data-music-level hidden><summary>配乐音量</summary><label class="field details-body"><span>音量 <output data-music-volume></output></span><input type="range" name="volume" min="0" max="100" value="${Math.round(selected.volume*100)}"/></label></details>
    <div class="submit-row"><span data-music-status role="status"></span><button class="button primary" type="submit"><i data-lucide="check"></i>保存配乐选择</button></div>
    <div class="music-apply-row"><button class="button" type="button" data-music-apply hidden><i data-lucide="audio-lines"></i>加入当前时间线</button></div>
    </form>`;
  const form=target.querySelector("form"),el=(selector)=>form.querySelector(selector);
  let seed=selected.seed;
  const draft=mountChoiceDraft(form,`${location.host}:music`);
  const values=()=>{
    const mode=el('[name=mode]:checked').value;
    const customStyle=mode==="procedural"&&el('[name=style]:checked').value==="__custom__";
    const data=readChoices(form,mode==="procedural"?["style"]:["mode"]);
    return {mode:mode==="__custom__"||customStyle?"custom":mode,
      custom:customStyle?data.style:mode==="__custom__"?data.mode:"",
      style:mode!=="procedural"||customStyle?selected.style:el('[name=style]:checked').value,
      bpm:mode==="procedural"&&!customStyle?Number(el("[name=bpm]").value):selected.bpm,
      seed,volume:Number(el("[name=volume]").value)/100,
      src:mode==="provided"?el("[name=src]").value.trim():""};
  };
  function update(){
    const mode=el("[name=mode]:checked")?.value;
    el("[data-music-procedural]").hidden=mode!=="procedural";
    el("[data-music-provided]").hidden=mode!=="provided";
    el("[data-music-level]").hidden=!["procedural","provided"].includes(mode);
    el("[data-music-preview]").disabled=el('[name=style]:checked')?.value==="__custom__";
    el("[data-music-volume]").value=`${el("[name=volume]").value}%`;
    el("[data-music-apply]").hidden=true;
  }
  form.addEventListener("input",()=>{touched();update();});
  form.addEventListener("change",(event)=>{
    if(event.target.name==="style"&&event.target.value!=="__custom__"){el("[name=bpm]").value=styles.find((style)=>style.id===event.target.value).bpm;}
    touched();update();
  });
  el("[data-music-preview]").onclick=async()=>{
    const button=el("[data-music-preview]");button.disabled=true;
    try{
      const result=await api("music-generate",{...values(),duration:8});
      if(!form.isConnected)return;
      el("[data-music-audio]").src=`/${result.src}`;el("[data-music-audio]").hidden=false;
      el("[data-music-status]").textContent="试听已就绪 · 本地合成，未改动时间线";
    }catch(error){if(form.isConnected)el("[data-music-status]").textContent=error.message;}
    finally{button.disabled=false;}
  };
  el("[data-music-file]").onchange=async()=>{
    const file=el("[data-music-file]").files[0];if(!file)return;
    try{
      const response=await fetch(`/api/import-audio?name=${encodeURIComponent(file.name)}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      if(!form.isConnected)return;
      el("[name=src]").value=result.src;el("[data-music-status]").textContent=`已导入 · ${result.duration.toFixed(1)} 秒`;
      form.dispatchEvent(new Event("input"));
    }catch(error){if(form.isConnected)el("[data-music-status]").textContent=error.message;}
  };
  form.onsubmit=async(event)=>{
    event.preventDefault();
    try{
      const config=values();
      await api("music-tool",config);
      if(!form.isConnected)return;
      draft.clear();saved();
      el("[data-music-status]").textContent=config.mode==="custom"?"需求已保存，等待 Agent 编配或接入合适工具。":"配乐选择已保存，Agent 可继续编配与混音。";
      el("[data-music-apply]").hidden=config.mode==="custom";
      el("[data-music-apply]").lastChild.textContent=config.mode==="none"?"移除工具配乐":"加入当前时间线";
    }catch(error){if(form.isConnected)el("[data-music-status]").textContent=error.message;}
  };
  el("[data-music-apply]").onclick=async()=>{
    const button=el("[data-music-apply]");button.disabled=true;
    try{
      const state=await api("workspace");
      await api("music-apply",{expected_revision:state.revision});
      if(form.isConnected)el("[data-music-status]").textContent=el('[name=mode]:checked').value==="none"?"已移除工具配乐 · 其他音轨保持不变":"配乐已加入时间线 · 配音时自动压低";
    }catch(error){if(form.isConnected)el("[data-music-status]").textContent=error.message;}
    finally{button.disabled=false;}
  };
  update();
  window.lucide?.createIcons();
}
