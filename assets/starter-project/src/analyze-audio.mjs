import { spawn } from "node:child_process";
import { ffmpegPath } from "./media.mjs";

export async function audioEnergy(file) {
  const pcm = await new Promise((resolve,reject)=>{
    const child=spawn(ffmpegPath,["-v","error","-i",file,"-vn","-ac","1","-ar","8000","-f","f32le","pipe:1"],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
    const chunks=[];let bytes=0,error="";
    child.stdout.on("data",(chunk)=>{bytes+=chunk.length;if(bytes>40e6){child.kill();reject(new Error("Audio analysis exceeds 20 minute limit"));}else chunks.push(chunk);});
    child.stderr.on("data",(chunk)=>{error+=chunk;});child.on("error",reject);
    child.on("close",(code)=>code===0?resolve(Buffer.concat(chunks)):reject(new Error(error||"Audio analysis failed")));
  });
  const values=[],samples=pcm.length/4;
  for(let frame=0;frame<Math.ceil(samples/8000*30);frame++){
    const start=Math.floor(frame*8000/30),end=Math.min(samples,Math.floor((frame+1)*8000/30));
    let sum=0,peak=0;
    for(let i=start;i<end;i++){const v=pcm.readFloatLE(i*4);sum+=v*v;peak=Math.max(peak,Math.abs(v));}
    values.push({time:frame/30,rms:Math.sqrt(sum/Math.max(1,end-start)),peak});
  }
  return values;
}
