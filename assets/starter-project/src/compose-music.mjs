#!/usr/bin/env node
import path from "node:path";
import { randomUUID } from "node:crypto";
import { composeMusic, musicStyles } from "./music.mjs";
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=path.resolve(arg("--root",".")),style=arg("--style","electronic");
const result=await composeMusic(root,{duration:Number(arg("--duration","30")),style,bpm:Number(arg("--bpm",String(musicStyles[style]?.bpm??120))),
  seed:Number(arg("--seed","19")),output:arg("--output",`audio/music/score-${randomUUID()}.wav`)});
console.log(JSON.stringify({...result,features:undefined,absolute_path:path.join(root,result.src)}));
