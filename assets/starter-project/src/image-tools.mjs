import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicJson } from "./media.mjs";

export const imageBackends = {
  openai: { key: "OPENAI_API_KEY", model: "OPENAI_MODEL", base: "OPENAI_BASE_URL" },
  gemini: { key: "GEMINI_API_KEY", model: "GEMINI_MODEL", base: "GEMINI_BASE_URL" },
  minimax: { key: "MINIMAX_API_KEY", model: "MINIMAX_MODEL", base: "MINIMAX_BASE_URL" },
  qwen: { key: "QWEN_API_KEY", model: "QWEN_MODEL", base: "QWEN_BASE_URL" },
  zhipu: { key: "ZHIPU_API_KEY", model: "ZHIPU_MODEL", base: "ZHIPU_BASE_URL" },
  volcengine: { key: "LAS_API_KEY", model: "VOLCENGINE_MODEL", base: "VOLCENGINE_BASE_URL" },
  tencent: { key: "TENCENT_API_KEY", model: "TENCENT_MODEL", base: "TENCENT_BASE_URL" },
  siliconflow: { key: "SILICONFLOW_API_KEY", model: "SILICONFLOW_MODEL", base: "SILICONFLOW_BASE_URL" },
  openrouter: { key: "OPENROUTER_API_KEY", model: "OPENROUTER_MODEL", base: "OPENROUTER_BASE_URL" },
};
async function createOnly(file, text) {
  try { await fs.writeFile(file, text, { flag: "wx", mode: 0o600 }); return true; }
  catch (error) { if (error.code === "EEXIST") return false; throw error; }
}
export async function configureImages(root, mode, backend) {
  if (!["builtin","external"].includes(mode)) throw new Error("Choose builtin or external");
  if(mode==="external"&&!imageBackends[backend])throw new Error("Unknown image backend");
  let envCreated=false;
  if(mode==="external"){
    const vars=imageBackends[backend];
    const template=`# Video Master image generation. Fill locally; never paste keys into chat.\n# Process environment overrides this file. No paid request is made by setup.\nIMAGE_BACKEND=${backend}\nIMAGE_CONCURRENCY=2\n${vars.key}=\n${vars.model}=\n${vars.base}=\n\n# OpenAI-compatible optional settings (only when supported by your provider):\n# OPENAI_RESPONSE_FORMAT=auto\n# OPENAI_QUALITY=auto\n# OPENAI_OUTPUT_FORMAT=png\n# OPENAI_BACKGROUND=auto\n`;
    await createOnly(path.join(root,".env.example"),template);
    envCreated=await createOnly(path.join(root,".env"),template);
  }
  let ignore="";
  try{ignore=await fs.readFile(path.join(root,".gitignore"),"utf8");}catch(error){if(error.code!=="ENOENT")throw error;}
  if(!ignore.split(/\r?\n/).includes(".env"))await fs.appendFile(path.join(root,".gitignore"),"\n.env\n.env.*\n!.env.example\n");
  const selected={schema:"video-master.asset-tools.v1",image_path:mode,backend:mode==="external"?backend:null,
    configuration_variables:mode==="external"?imageBackends[backend]:null,selected_at:new Date().toISOString()};
  await atomicJson(path.join(root,"asset_tools.json"),selected);
  return {...selected,env_created:envCreated,env_file:mode==="external"?".env":null,required_variables:mode==="external"?imageBackends[backend]:null,
    note:mode==="builtin"?"Built-in tool availability is checked by the agent; no API key is needed.":envCreated?"Fill the empty variables locally.":"Existing .env preserved. Add/update the selected backend variables locally."};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
  console.log(JSON.stringify(await configureImages(root,process.argv[2],process.argv[3]),null,2));
}
