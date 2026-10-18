const escape=(value)=>String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const styles={
  mv:["动感排版、踩点切镜、鲜明对比","电影感叙事、慢镜头与情绪递进","抽象图形、音频响应与实验视觉"],
  studio:["像素演播室、双主播贴纸、大屏聚焦","现代新闻演播室、简洁主播与信息大屏","轻松漫画讲解、角色表情与夸张镜头"],
  product:["极简产品特写、材质细节与镜头推进","科技发布会、功能拆解与界面演示","生活方式场景、使用过程与体验展示"],
  report:["编辑式排版、数据图表与动态翻页","正式商务汇报、清晰结构与克制动效","发布会风格、大标题与重点数字"],
  other:["从现有模板适配新的视觉风格"],
};
function suggestions(key,field,genre){
  const value=String(field.value??"");
  if(field.choices?.length)return field.choices;
  if(field.options?.length)return field.options;
  const choices={
    topic:[value,`入门讲解：${value}`,`亮点速览：${value}`],
    audience:[value,"第一次接触该主题的观众","客户、合作伙伴或决策者"],
    purpose:[value,"理解核心概念与实际用途","被画面和节奏打动，产生兴趣"],
    style:[value,...(styles[genre]||styles.product)],
    duration:[value,"30","60","120"],
    language:[value,"中文","English","中英双语"],
    sources:[value,"使用我已提供或已授权的素材","由 Agent 寻找可用的网络素材"],
  };
  return choices[key]||[value];
}
export function choiceFields(proposal,values={},keys,genre="product"){
  return Object.entries(proposal.fields||{}).filter(([key])=>key!=="genre"&&(!keys||keys.includes(key))).map(([key,field])=>{
    const saved=values[key]??field.value??"";
    const options=suggestions(key,field,genre).map((entry)=>typeof entry==="object"?{...entry,value:String(entry.value)}:{value:String(entry),label:String(entry)});
    if(!options.some((item)=>item.value===String(saved))&&saved!=="__custom__")options.unshift({value:String(saved),label:String(saved)});
    const unique=[...new Map(options.map((entry)=>[entry.value,entry])).values()].filter((item)=>field.type!=="number"||Number(item.value)>=(field.min??0)&&Number(item.value)<=(field.max??3600)).slice(0,3);
    const custom=field.allow_custom!==false;
    return `<fieldset class="choice-field" data-choice-field="${escape(key)}"><legend>${escape(field.label||key)} <small>${escape({fact:"事实",decision:"已指定",suggested:"建议",derived:"推导"}[field.origin]||"建议")}</small></legend>
      <div class="choice-options">${unique.map((item)=>`<label><input type="radio" name="${escape(key)}" value="${escape(item.value)}" ${String(saved)===item.value?"checked":""}/><span>${escape(item.label??item.value)}${item.description?`<small>${escape(item.description)}</small>`:""}</span></label>`).join("")}
      ${custom?`<label class="custom-choice"><input type="radio" name="${escape(key)}" value="__custom__" ${saved==="__custom__"?"checked":""}/><span>自定义</span></label>`:""}</div>
      ${custom?`<div data-custom-field="${escape(key)}" hidden><label class="field"><span>自定义${escape(field.label||key)}</span><input name="${escape(key)}_custom" type="${field.type==="number"?"number":"text"}" ${field.type==="number"?`min="${field.min??0}" max="${field.max??3600}" step="any"`:""} value="${escape(values[`${key}_custom`]||"")}" /></label></div>`:""}</fieldset>`;
  }).join("");
}
export function readChoices(form,keys){
  const values=Object.fromEntries(new FormData(form));
  for(const group of form.querySelectorAll("[data-choice-field]")){
    const key=group.dataset.choiceField;
    if(keys&&!keys.includes(key))continue;
    if(values[key]==="__custom__"){
      const input=group.querySelector(`[name="${key}_custom"]`);
      if(!input.value.trim()||!input.checkValidity()){input.focus();input.reportValidity();throw new Error(`请补充“其他${group.querySelector("legend").textContent.trim()}”，或选择已有选项。`);}
      values[key]=input.value.trim();
    }
    delete values[`${key}_custom`];
  }
  return keys?Object.fromEntries(Object.entries(values).filter(([key])=>keys.includes(key))):values;
}
export function mountChoiceDraft(form,key){
  const storageKey=`video-master.choices:${key}`;
  try{
    const saved=JSON.parse(sessionStorage.getItem(storageKey)||"null");
    if(saved)for(const el of form.elements){
      if(!el.name||["file","checkbox","button","submit"].includes(el.type)||saved[el.name]===undefined)continue;
      if(el.type==="radio"){
        if(el.value===saved[el.name])el.checked=true;
      }else el.value=saved[el.name];
    }
  }catch{}
  function update(){
    for(const group of form.querySelectorAll("[data-choice-field]")){
      const custom=group.querySelector("[data-custom-field]");
      if(custom)custom.hidden=group.querySelector('input[type="radio"]:checked')?.value!=="__custom__";
    }
    const other=form.querySelector("[data-other-direction]");
    if(other)other.hidden=form.querySelector('[name=genre]:checked')?.value!=="other";
    const optional=form.querySelector("[data-creative-optional]");
    if(optional)optional.hidden=form.querySelector('[name=mode]:checked')?.value==="one_sentence";
  }
  function save(){
    update();
    const values=Object.fromEntries(new FormData(form));
    for(const el of form.querySelectorAll('input[type="checkbox"],input[type="file"]'))delete values[el.name];
    try{sessionStorage.setItem(storageKey,JSON.stringify(values));}catch{}
  }
  form.addEventListener("input",save);form.addEventListener("change",save);update();
  form.dataset.choiceDraft="true";
  return {clear:()=>sessionStorage.removeItem(storageKey),update};
}
