import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { atomicJson } from "./media.mjs";

export const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const genres=["mv","studio","product","report"];
export function validateConfirmation(proposal,result){
  if(result.round&&!(result.stage==="stage1"&&result.round==="creative-direction"))throw new Error("Invalid confirmation round");
  const partial=result.round==="creative-direction";
  const requested=partial
    ?result.values?.mode==="one_sentence"?["genre","topic","mode"]:["genre","topic","audience","purpose","style","mode"]
    :Object.keys(proposal.fields||{});
  const keys=requested.filter((key)=>Object.hasOwn(proposal.fields||{},key));
  for(const key of keys){
    const value=result.values?.[key],field=proposal.fields[key];
    if(typeof value!=="string"||!value.trim())throw new Error(`Missing field ${key}`);
    const options=field.choices?.map((item)=>typeof item==="string"?item:String(item.value))||field.options;
    if(key==="genre"){
      if(![...genres,"other"].includes(value))throw new Error("Invalid video direction");
      if(value==="other"&&!result.values.custom_direction?.trim())throw new Error("Describe the custom direction");
    }else if(options&&(field.allow_custom===false||key==="mode")&&!options.includes(value))throw new Error(`Invalid choice ${key}`);
    if(field.type==="number"&&(!Number.isFinite(Number(value))||Number(value)<(field.min??0)||Number(value)>(field.max??3600)))throw new Error(`Invalid number ${key}`);
  }
  if(partial){
    const allowed=new Set([...requested,"custom_direction"]);
    if(Object.keys(result.values||{}).some((key)=>!allowed.has(key)))throw new Error("This round only confirms creative direction");
  }
  return {scope:partial?"creative-direction":"full",deferred_fields:Object.keys(proposal.fields||{}).filter((key)=>!keys.includes(key))};
}
const read = async (root, file, fallback = {}) => {
  try { return JSON.parse(await fs.readFile(path.join(root, file), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
};
export async function ensurePlanning(root, project) {
  const old = await read(root,"planning/stage1.json");
  if(old.stage)return;
  const genre=genres.includes(project.mode)?project.mode:"product";
  await atomicJson(path.join(root,"planning/stage1.json"),{
    stage:"stage1",revision:1,title:"确认创作方向",summary:"以下是可修改的初始建议，尚未确认。",
    fields:{
      topic:{label:"主题与核心内容",value:project.name,origin:"suggested",type:"textarea"},
      genre:{label:"视频类型",value:genre,origin:"suggested",options:genres},
      audience:{label:"观众",value:"面向对主题感兴趣的观众",origin:"suggested"},
      purpose:{label:"观看后希望留下什么",value:"清楚理解核心内容并记住关键画面",origin:"suggested"},
      style:{label:"风格与参考",value:genre==="studio"?"像素演播室、双主播贴纸、大屏聚焦":"清晰排版、鲜明对比、节奏明确的代码动画",origin:"suggested",type:"textarea"},
      duration:{label:"目标时长（秒）",value:String(project.duration_seconds),origin:"derived",type:"number",min:5,max:600},
      aspect:{label:"画幅",value:"16:9",origin:"suggested",options:["16:9","9:16","1:1","4:3"]},
      language:{label:"语言",value:"中文",origin:"suggested",options:["中文","English","中英双语"]},
      sources:{label:"已有素材、参考与版权限制",value:"使用原创或已授权素材；不复制他人角色与品牌。",origin:"suggested",type:"textarea"},
      mode:{label:"决策方式",value:"interactive",origin:"suggested",options:["interactive","one_sentence"]},
    },
  });
}
export async function planningState(root) {
  const stage1 = await read(root, "planning/stage1.json"), stage2 = await read(root, "planning/stage2.json");
  const first = await read(root, "confirmations/stage1.json"), second = await read(root, "confirmations/stage2.json");
  const firstValid = Boolean(stage1.stage && first.proposal_hash === digest(stage1));
  const secondValid = Boolean(firstValid && stage2.stage && stage2.stage1_hash === digest(first) && second.proposal_hash === digest(stage2));
  return {
    stage1: { ...stage1, proposal_hash: digest(stage1) }, stage2: { ...stage2, proposal_hash: digest(stage2) },
    confirmations: { stage1: firstValid ? first : null, stage1_hash: firstValid ? digest(first) : null, stage2: secondValid ? second : null },
    delegated: Boolean(firstValid && first.values?.mode === "one_sentence"),
    active_stage: !firstValid ? "stage1" : !secondValid && first.values?.mode !== "one_sentence" ? "stage2" : "production",
    production: await read(root, "production.json"),
    treatment_request: await read(root,"planning/treatment-request.json",null),
  };
}
export async function publishProposal(root, proposal, expectedHash) {
  if (!["stage1","stage2"].includes(proposal.stage)) throw new Error("Invalid proposal stage");
  if (!Number.isInteger(proposal.revision) || proposal.revision < 1) throw new Error("Proposal revision must be positive");
  if (!proposal.title || typeof proposal.fields !== "object") throw new Error("Proposal needs title and fields");
  for(const [key,field] of Object.entries(proposal.fields)){
    if(!field||typeof field!=="object")throw new Error(`Invalid field ${key}`);
    if(field.choices){
      if(!Array.isArray(field.choices)||field.choices.length!==3)throw new Error(`Provide three choices for ${key}`);
      const values=field.choices.map((item)=>typeof item==="string"?item:item?.value);
      if(values.some((value)=>typeof value!=="string"||!value.trim()||value==="__custom__")||new Set(values).size!==3)throw new Error(`Choices for ${key} need unique nonempty values`);
      if(key==="genre"&&values.some((value)=>!genres.includes(value)))throw new Error("Direction previews use an existing renderer family; custom direction is separate");
      if(!values.includes(String(field.value)))throw new Error(`Default ${key} must be one of the three choices`);
    }
  }
  const old = await read(root, `planning/${proposal.stage}.json`);
  if (expectedHash !== digest(old)) throw new Error("Proposal changed; read workflow and retry");
  if (old.stage && proposal.revision <= old.revision) throw new Error("Increment the proposal revision");
  if (proposal.stage === "stage2") {
    const state = await planningState(root);
    if (!state.confirmations.stage1) throw new Error("Stage 1 must be confirmed before publishing treatments");
    if (proposal.stage1_hash !== digest(state.confirmations.stage1)) throw new Error("Stage 1 receipt changed");
    if (!Array.isArray(proposal.candidates) || proposal.candidates.length !== 3) throw new Error("Publish exactly three integrated treatments");
    if (new Set(proposal.candidates.map((item) => item.id)).size !== 3) throw new Error("Treatment IDs must be unique");
    for (const item of proposal.candidates) {
      for (const key of ["id","name","concept","image_system","motion_system","structure","execution"]) {
        if (typeof item[key] !== "string" || !item[key].trim()) throw new Error(`Treatment needs ${key}`);
      }
      if (item.preview && (!/^assets\/[^?#]+$/.test(item.preview) || item.preview.includes(".."))) throw new Error("Preview must be a local assets/ image");
    }
  }
  await atomicJson(path.join(root, `planning/${proposal.stage}.json`), proposal);
  return { status: "published", proposal_hash: digest(proposal) };
}
