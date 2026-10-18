import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { atomicJson, ffmpegPath, inside, probe, run } from "./media.mjs";

async function windows(args) {
  const options=["-NoProfile","-ExecutionPolicy","Bypass","-File",fileURLToPath(new URL("./voice.ps1",import.meta.url)),...args];
  try { return await run(process.env.POWERSHELL_PATH||"powershell.exe",options); }
  catch(error){if(error.code!=="ENOENT"||process.env.POWERSHELL_PATH)throw error;return run("pwsh.exe",options);}
}
export async function localVoices() {
  try {
    if(process.platform==="win32"){
      const data=JSON.parse((await windows(["-ListVoices"])).replace(/^\uFEFF/,""));
      return {backend:"sapi",available:true,voices:Array.isArray(data)?data:[data]};
    }
    if(process.platform==="darwin"){
      const output=await run("say",["-v","?"]);
      return {backend:"say",available:true,voices:output.split(/\r?\n/).map((line)=>{
        const match=/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#/.exec(line);
        return match?{id:match[1].trim(),language:match[2].replace("_","-")}:null;
      }).filter(Boolean)};
    }
    const output=await run("espeak-ng",["--voices"]);
    return {backend:"espeak-ng",available:true,voices:output.split(/\r?\n/).slice(1).map((line)=>{
      const columns=line.trim().split(/\s+/);return columns.length>=5?{id:columns[4],language:columns[1]}:null;
    }).filter(Boolean)};
  }catch{
    return {backend:process.platform==="win32"?"sapi":process.platform==="darwin"?"say":"espeak-ng",available:false,voices:[],
      error:process.platform==="win32"?"Install Windows SAPI speech voices and Windows PowerShell/System.Speech":
        process.platform==="darwin"?"Install a macOS system voice and enable the say command":"Install espeak-ng (for example apt install espeak-ng), then list voices"};
  }
}
export async function localSpeech(root, config, line) {
  if(typeof line.text!=="string"||!line.text.trim()||line.text.length>10000)throw new Error("Local TTS needs 1-10000 text characters");
  const catalog=await localVoices();
  if(!catalog.available||!catalog.voices.length)throw new Error(catalog.error||"No local voices installed");
  const explicit=line.voice||config.local_voices?.[line.speaker||"narrator"];
  const language=/[\u3400-\u9fff]/.test(line.text)?"zh":"en";
  const compatible=catalog.voices.filter((voice)=>voice.language.toLowerCase().startsWith(language));
  const voice=explicit?catalog.voices.find((voice)=>voice.id===explicit):compatible[line.speaker==="host-b"&&compatible.length>1?1:0];
  if(!voice)throw new Error(explicit?`Local voice unavailable: ${explicit}`:`No ${language} system voice; install one or choose another narration provider`);
  const speed=config.speed??1;
  if(!Number.isFinite(speed)||speed<.5||speed>2)throw new Error("Local speech speed must be 0.5 to 2");
  const key=createHash("sha256").update(JSON.stringify([catalog.backend,voice.id,speed,line.text])).digest("hex");
  const src=`audio/local/${key}.wav`,output=inside(root,src);
  try{const info=await probe(output);return {src,duration:Number(info.format.duration),voice_id:voice.id,backend:catalog.backend,cached:true};}catch{}
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),"vm-local-"));
  try{
    const input=path.join(temp,"input.json"),raw=path.join(temp,process.platform==="darwin"?"speech.aiff":"speech.wav");
    if(process.platform==="win32"){
      await atomicJson(input,{lines:[{text:line.text,voice:voice.id,rate:Math.max(-10,Math.min(10,Math.round(Math.log2(speed)*5)))}]});
      await windows(["-InputJson",input,"-OutputDirectory",temp]);
      await fs.rename(path.join(temp,"line-000.wav"),raw);
    }else{
      const text=path.join(temp,"text.txt");await fs.writeFile(text,line.text,"utf8");
      if(process.platform==="darwin")await run("say",["-v",voice.id,"-r",String(Math.round(180*speed)),"-f",text,"-o",raw]);
      else await run("espeak-ng",["-v",voice.id,"-s",String(Math.round(175*speed)),"-f",text,"-w",raw]);
    }
    await fs.mkdir(path.dirname(output),{recursive:true});
    await run(ffmpegPath,["-v","error","-y","-i",raw,"-ac","1","-ar","48000",path.join(temp,"normalized.wav")]);
    const info=await probe(path.join(temp,"normalized.wav"));
    if(!(Number(info.format.duration)>0))throw new Error("Local TTS produced empty audio");
    await fs.copyFile(path.join(temp,"normalized.wav"),output);
    return {src,duration:Number(info.format.duration),voice_id:voice.id,backend:catalog.backend,cached:false};
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
  if(args[0]==="voices")console.log(JSON.stringify(await localVoices(),null,2));
  else if(args[0]==="synthesize"){
    const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
    const result=await localSpeech(root,{speed:Number(arg("--speed","1"))},{text:arg("--text",""),voice:arg("--voice"),speaker:arg("--speaker","narrator")});
    console.log(JSON.stringify(result,null,2));
  }else throw new Error("Usage: node src/local-tts.mjs voices | synthesize --text TEXT [--voice ID] [--speed 1]");
}
