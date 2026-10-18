const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
export async function mountCloneUI(container, { save, updated } = {}) {
  container.innerHTML = `<h3>音色克隆</h3>
    <label class="field plan-field"><span>上传声音样本</span><input data-clone="upload" type="file" accept=".mp3,.m4a,.wav" /></label>
    <div class="tool-status clone-folder" data-clone="folder"></div>
    <div class="clone-row"><label class="field plan-field"><span>本地样本（10 秒至 5 分钟，≤20 MB）</span><select data-clone="sample"></select></label>
    <button class="button" type="button" data-clone="refresh" title="刷新样本文件夹" aria-label="刷新样本文件夹"><i data-lucide="refresh-cw"></i></button></div>
    <div class="field-grid"><label class="field plan-field"><span>新 Voice ID</span><input data-clone="id" placeholder="MyVoice2026" minlength="8" maxlength="256" /></label>
    <label class="field plan-field"><span>用于角色</span><select data-clone="speaker"><option value="narrator">旁白</option><option value="host-a">主播 A</option><option value="host-b">主播 B</option></select></label></div>
    <div class="clone-checks"><label><input type="checkbox" data-clone="noise" />降噪</label><label><input type="checkbox" data-clone="normalize" />音量归一化</label></div>
    <div class="tool-status">需要已认证的 MiniMax 账户。音色克隆不会生成试听；后续试听与配音另行授权，按平台规则计费。</div>
    <label class="consent"><input data-clone="rights" type="checkbox" />我拥有该声音或已取得声音本人明确授权</label>
    <label class="consent"><input data-clone="authorize" type="checkbox" />同意将选中样本发送到所选地区的 MiniMax，创建上述音色并承担平台可能产生的费用</label>
    <button data-clone="submit" type="button" class="button primary button-primary"><i data-lucide="mic"></i>上传并克隆音色</button>
    <div data-clone="status" class="tool-status" role="status"></div>`;
  const el = (name) => container.querySelector(`[data-clone="${name}"]`);
  const consentForm=container.closest("form");
  consentForm?.addEventListener("change",(event)=>{
    if(!container.contains(event.target)){el("rights").checked=false;el("authorize").checked=false;}
  });
  async function api(route, data) {
    const response = await fetch(`/api/${route}`, data ? { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data) } : {});
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }
  async function refresh(selected) {
    const result = await api("voice-samples"), old = selected || el("sample").value;
    el("folder").textContent = `本地样本文件夹：${result.folder}`;
    el("sample").innerHTML = `<option value="">选择样本</option>` + result.files.map((file) =>
      `<option value="${escape(file.name)}" ${file.valid ? "" : "disabled"}>${escape(file.name)} · ${file.valid ? `${file.duration.toFixed(1)} 秒` : escape(file.error)}</option>`).join("");
    el("sample").value = old;
  }
  el("refresh").onclick = () => refresh().catch((e) => { el("status").textContent=e.message; });
  el("upload").onchange = async () => {
    const file=el("upload").files[0]; if (!file) return;
    el("status").textContent="正在保存到本地；尚未发送 MiniMax…";
    try {
      const response=await fetch(`/api/voice-samples?name=${encodeURIComponent(file.name)}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      const data=await response.json(); if(!response.ok)throw new Error(data.error);
      await refresh(data.name);el("status").textContent="样本已保存到本地。";
    } catch(e){el("status").textContent=e.message;}
  };
  let timer;
  async function poll(job) {
    if(!container.isConnected){clearTimeout(timer);return;}
    try{
      const data=await api("voice-clone-status");
      if(data.job!==job)throw new Error("克隆任务已变更，请检查状态。");
      if(data.state==="running"){timer=setTimeout(()=>poll(job),1500);return;}
      if(data.state==="error")throw new Error(data.error);
      el("status").textContent=`音色 ${data.voice_id} 已用于所选角色。需在 7 天内正式用于配音，否则平台会删除；试听需另行授权。`;
      await updated?.(data);el("submit").disabled=false;
    }catch(e){el("status").textContent=e.message;el("submit").disabled=false;}
  }
  for(const field of ["sample","id","speaker"])el(field).onchange=()=>{el("rights").checked=false;el("authorize").checked=false;};
  el("submit").onclick=async()=>{
    if(!el("sample").value||!el("id").value.trim()){el("status").textContent="请先选择样本和新的 Voice ID。";return;}
    if(!el("rights").checked||!el("authorize").checked){el("status").textContent="请确认声音权利、样本发送和费用授权。";return;}
    el("submit").disabled=true;
    try{
      await save?.();
      const data=await api("voice-clone",{sample:el("sample").value,voice_id:el("id").value.trim(),speaker:el("speaker").value,
        noise_reduction:el("noise").checked,normalize:el("normalize").checked,rights_confirmed:true,authorized:true});
      el("status").textContent="正在上传到 MiniMax 并克隆音色…";poll(data.job);
    }catch(e){el("status").textContent=e.message;el("submit").disabled=false;}
    finally{el("rights").checked=false;el("authorize").checked=false;}
  };
  await refresh();
  const current=await api("voice-clone-status");
  if(current.state==="running"){el("submit").disabled=true;el("status").textContent="正在克隆音色…";poll(current.job);}
  window.lucide?.createIcons();
}
