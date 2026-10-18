import { getVisual, drawMedia } from "./mv.js";
import { trackEnabled } from "./model.js";
import { smoothstep as ease, EASINGS } from "./motion.js";
import { drawHost, blinkAt } from "./studio-host.js";
import { stickerTransform, spriteFrame, heldLine, heldSpeaker } from "./studio-motion.js";

const active = (timeline,time,kind) => timeline.cues.filter((c)=>c.kind===kind && time>=c.start_sec && time<c.end_sec && trackEnabled(timeline,c));
function text(ctx,value,x,y,size,color="#f1f3ee",weight=600,max=1000) {
  ctx.fillStyle=color;ctx.font=`${weight} ${size}px "Microsoft YaHei","Segoe UI",sans-serif`;ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(String(value),x,y,max);
}
function wrap(ctx,value,x,y,max,lineHeight,size,color) {
  ctx.font=`500 ${size}px "Microsoft YaHei","Segoe UI",sans-serif`;
  let line="",row=0;
  for (const ch of String(value)) {
    if (ctx.measureText(line+ch).width>max || ch==="\n") {text(ctx,line,x,y+row*lineHeight,size,color,500,max);line="";row++;}
    if(ch!=="\n")line+=ch;
  }
  if(line)text(ctx,line,x,y+row*lineHeight,size,color,500,max);
}

function screen(ctx,timeline,time,x,y,w,h) {
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  ctx.fillStyle="#163b41";ctx.fillRect(x,y,w,h);
  const media=active(timeline,time,"image").concat(active(timeline,time,"footage")).find((c)=>c.role==="screen");
  if(media){ctx.save();ctx.translate(x,y);drawMedia(ctx,media,time,w,h);ctx.restore();}
  else {
    ctx.strokeStyle="#2d7d86";ctx.lineWidth=1;
    for(let i=0;i<14;i++){ctx.beginPath();ctx.moveTo(x+i*w/13,y);ctx.lineTo(x+i*w/13,y+h);ctx.stroke();}
    for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(x,y+i*h/7);ctx.lineTo(x+w,y+i*h/7);ctx.stroke();}
    const item=active(timeline,time,"scene")[0];
    text(ctx,item?.headline||timeline.studio.title,x+w*.07,y+h*.32,h*.12,"#ecf4ee",700,w*.86);
    wrap(ctx,item?.body||"代码、素材与声音，共用一条可编辑时间线。",x+w*.07,y+h*.55,w*.83,h*.13,h*.065,"#a4e7dc");
  }
  ctx.restore();
}
function vectorHost(ctx,x,y,size,color,speaking,time,expression) {
  // Explicit diagnostic skin. Final anime production uses transparent expression images.
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  const bounce=speaking?Math.sin(time*17)*.012:Math.sin(time*2)*.003;
  ctx.scale(1-bounce*.6,1+bounce);
  ctx.fillStyle="#f5f1e7";ctx.fillRect(-.13,-.1,.26,.34);
  ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(0,-.29,.19,.21,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#f2dfcc";ctx.beginPath();ctx.ellipse(0,-.27,.14,.16,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=color;ctx.fillRect(-.16,-.45,.32,.1);
  ctx.fillStyle="#192328";ctx.fillRect(-.075,-.29,.025,.025);ctx.fillRect(.05,-.29,.025,.025);
  ctx.beginPath();ctx.ellipse(0,-.215,.035,speaking?.01+Math.abs(Math.sin(time*16))*.02:.007,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#26373b";ctx.beginPath();ctx.moveTo(-.15,-.09);ctx.lineTo(-.23,.23);ctx.lineTo(.23,.23);ctx.lineTo(.15,-.09);ctx.closePath();ctx.fill();
  ctx.fillStyle=color;ctx.fillRect(-.027,-.08,.054,.15);
  if(expression==="excited"){ctx.strokeStyle=color;ctx.lineWidth=.015;ctx.beginPath();ctx.moveTo(.23,-.35);ctx.lineTo(.29,-.39);ctx.moveTo(.22,-.42);ctx.lineTo(.25,-.49);ctx.stroke();}
  ctx.restore();
}
function host(ctx,timeline,id,time,x,y,size,mini=false) {
  const config=timeline.studio.hosts.find((h)=>h.id===id);
  const voice=active(timeline,time,"voice").find((v)=>v.speaker===id);
  const pose=active(timeline,time,"expression").find((c)=>c.speaker===id);
  const idx=timeline.studio.hosts.findIndex((h)=>h.id===id);
  const src=config.expressions?.[pose?.expression||"neutral"]||config.expressions?.neutral;
  const image=getVisual(src),envelope=voice ? (voice.energy?.[Math.floor((time-voice.start_sec)*30)]||.12):0;
  if(image){
    // Whole-sticker squash/stretch about its base, driven by the voice envelope through a
    // spring: stretches on loud syllables, rebounds, eases down when the voice stops.
    // Never warp part of the illustration (no local "breathing" stretch).
    const tf=stickerTransform(timeline,id,time,idx);
    const frame=spriteFrame(timeline,config,time,{blink:blinkAt(time,idx*5+3)});
    const paint=(key,alpha)=>{
      const img=getVisual(config.expressions?.[key])||image,ratio=img.naturalWidth/img.naturalHeight;
      ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(img,-size*ratio/2,-size,size*ratio,size);ctx.restore();
    };
    ctx.save();ctx.translate(x+tf.shiftX*size,y+size*.3);ctx.rotate(tf.rotation);ctx.scale(tf.scaleX,tf.scaleY);
    if(frame.mix<1&&frame.previous!==frame.current)paint(frame.previous,1-frame.mix);
    paint(frame.current,frame.mix<1?Math.min(1,frame.mix*2):1);
    ctx.restore();
  } else {
    const expr=pose?.expression||"neutral";
    const mood={excited:[0.55,1],explain:[0.25,0.45],smile:[0.15,0.85],thinking:[-0.1,0.05],serious:[-0.35,0]}[expr]||[0,0.3];
    const lvl=voice?Math.min(1,envelope*1.6):0;
    const look=config.look||{skin:["#f1c7a3","#d9a57e"][idx%2],hair:["#2a1e1c","#1b1a1f"][idx%2],outfit:config.color,hairStyle:idx%2?"short":"bob",glasses:idx%2===1};
    const since=voice?time-voice.start_sec:9;
    drawHost(ctx,x,y,size,look,{mouth:lvl,blink:blinkAt(time,idx*5+3),brow:mood[0]+0.25*lvl,smile:mood[1],
      nod:0.6*Math.exp(-since/0.25)*Math.sin(Math.min(Math.PI,since*9))+0.5*lvl*lvl*Math.sin(time*7),
      tilt:0.03*Math.sin(time*0.7+idx*2),breathe:Math.sin(time*1.6+idx)});
  }
  if(mini){text(ctx,config.name,x-size*.35,y+size*.34,size*.09,"#ffffff",600,size*.8);}
}

const clamp1=(v)=>Math.max(0,Math.min(1,v));
// Lower third on each host's first spoken line (bar wipes in, name rises, role fades; quicker exit).
function lowerThird(ctx,timeline,time,alpha){
  const first={};
  for(const c of timeline.cues) if(c.kind==="voice"&&c.speaker&&!(c.speaker in first)) first[c.speaker]=c;
  timeline.studio.hosts.forEach((host,idx)=>{
    const c=first[host.id]; if(!c) return;
    const t0=c.start_sec+0.15, t1=Math.min(c.end_sec,c.start_sec+3.2);
    if(time<t0||time>t1+0.35) return;
    const u=EASINGS.snap(clamp1((time-t0)/0.5)), o=EASINGS.cubicInOut(clamp1((time-t1)/0.3));
    const w=250*u*(1-o); if(w<1) return;
    const x=idx===0?64:1280-64-256, y=548;
    ctx.save(); ctx.globalAlpha*=alpha;
    ctx.fillStyle=host.color; ctx.fillRect(x,y-40,6,64);
    ctx.fillStyle="rgba(20,24,28,0.92)"; ctx.fillRect(x+6,y-40,w,40);
    ctx.globalAlpha*=0.95; ctx.fillStyle=host.color; ctx.fillRect(x+6,y,w*0.78,24);
    ctx.beginPath(); ctx.rect(x+6,y-40,w,64); ctx.clip();
    const k=EASINGS.expoOut(clamp1((time-t0-0.15)/0.45));
    text(ctx,host.name,x+20,y-20+(1-k)*40,22,"#ffffff",700,w-24);
    ctx.globalAlpha*=clamp1((time-t0-0.3)/0.4);
    text(ctx,host.role||"",x+20,y+12,13,"#ffffff",600,w-24);
    ctx.restore();
  });
}

export function drawStudio(ctx,timeline,time,width,height) {
  const sx=width/1280,sy=height/720;
  ctx.save();ctx.scale(sx,sy);
  const scene=active(timeline,time,"scene")[0];
  const progress=scene?(time-scene.start_sec)/(scene.end_sec-scene.start_sec):0;
  const io=EASINGS.cubicInOut, clampU=(v)=>Math.max(0,Math.min(1,v));
  const focus=scene?.camera==="screen"?Math.min(io(clampU(progress/.2)),io(clampU((1-progress)/.17))):0;
  const rect=timeline.studio.screen_rect||[55,141,870,360],zoom=1+focus*1.08;
  const centerX=rect[0]+rect[2]/2,centerY=rect[1]+rect[3]/2;
  ctx.save();ctx.translate(640,360);ctx.scale(zoom,zoom);ctx.translate(-640+focus*(640-centerX),-360+focus*(360-centerY));
  const bg=getVisual(timeline.studio.background);
  if(bg)ctx.drawImage(bg,0,0,1280,720);
  else {
    ctx.fillStyle="#d6e2df";ctx.fillRect(0,0,1280,720);
    ctx.fillStyle="#202e33";ctx.fillRect(0,0,1280,86);
    for(let x=0;x<1280;x+=40){ctx.fillStyle=x%80===0?"#506068":"#394a52";ctx.fillRect(x,0,1,86);}
    ctx.fillStyle="#45bbbf";ctx.fillRect(0,78,1280,14);
    ctx.fillStyle="#9baeb0";ctx.fillRect(38,123,907,398);
  }
  screen(ctx,timeline,time,...rect);
  ctx.fillStyle="#607b7c";ctx.fillRect(976,141,250,360);
  text(ctx,"本期速览",1000,177,25,"#fff",700,210);
  ["代码场景","独立声轨","镜头与字幕","输出与质检"].forEach((label,i)=>{
    ctx.fillStyle=i===Math.floor(time/5)%4?"#a7e4ce":"#d5e0d9";ctx.fillRect(998,218+i*63,206,45);
    text(ctx,label,1010,240+i*63,19,"#193f40",600,185);
  });
  const alpha=1-focus;
  ctx.save();ctx.globalAlpha=alpha;
  host(ctx,timeline,timeline.studio.hosts[0].id,time,...(timeline.studio.hosts[0].anchor||[390,505,470]));
  host(ctx,timeline,timeline.studio.hosts[1].id,time,...(timeline.studio.hosts[1].anchor||[865,505,470]));
  const desk=getVisual(timeline.studio.desk);
  if(desk)ctx.drawImage(desk,0,0,1280,720);
  else{
    ctx.fillStyle="#edf0e8";ctx.fillRect(0,557,1280,24);
    ctx.fillStyle="#a4b8b7";ctx.fillRect(0,581,1280,90);
    ctx.fillStyle="#d1deda";ctx.fillRect(0,582,1280,10);
  }
  ctx.restore();
  ctx.restore();
  if(focus>.55){ctx.save();ctx.globalAlpha=ease((focus-.55)/.45);screen(ctx,timeline,time,0,0,1280,596);ctx.restore();}
  if(focus>.65){
    // PIP keeps the last speaker through the pause; it changes when the next line starts.
    ctx.fillStyle="#152e35dd";ctx.fillRect(1080,431,170,154);
    host(ctx,timeline,heldSpeaker(timeline,time)||timeline.studio.hosts[0].id,time,1165,510,135,true);
  }
  ctx.fillStyle="#183f43";ctx.fillRect(20,18,218,35);text(ctx,timeline.studio.brand,32,36,22,"#fff",800,190);
  ctx.fillStyle="#e3524a";ctx.fillRect(247,20,61,30);text(ctx,"LIVE",258,35,17,"#fff",700,50);
  lowerThird(ctx,timeline,time,1-focus);
  // Display state, not audio state: the last line's caption and name hold through the
  // pause between lines. The brand label belongs only to the open (before the first line).
  const subtitle=heldLine(timeline,time);
  ctx.fillStyle="#f0f4ee";ctx.fillRect(0,596,1280,74);
  ctx.fillStyle="#1d777b";ctx.fillRect(0,596,211,74);
  const speaker=timeline.studio.hosts.find((h)=>h.id===(subtitle?.speaker||heldSpeaker(timeline,time)));
  text(ctx,speaker?.name||timeline.studio.brand||"VIDEO MASTER",24,631,26,"#fff",700,175);
  if(subtitle){
    const transform=subtitle.transform||{};
    ctx.save();ctx.translate(transform.x||0,transform.y||0);ctx.rotate((transform.rotation||0)*Math.PI/180);
    ctx.scale(transform.scale||1,transform.scale||1);ctx.globalAlpha=transform.opacity??1;
    wrap(ctx,subtitle.text,235,618,1000,30,23,"#173b40");ctx.restore();
  }
  ctx.fillStyle="#e6614b";ctx.fillRect(0,670,111,50);text(ctx,"快讯",25,694,22,"#fff",700,86);
  ctx.fillStyle="#184349";ctx.fillRect(111,670,1169,50);
  text(ctx,timeline.studio.ticker,133,694,18,"#d3e7df",500,1120);
  ctx.restore();
}

function niceTicks(max,n=4){
  const raw=max/n, mag=10**Math.floor(Math.log10(raw||1));
  const step=[1,2,2.5,5,10].map((k)=>k*mag).find((k)=>k>=raw)||raw;
  return Array.from({length:Math.ceil(max/step)+1},(_,i)=>i*step);
}
function slotText(ctx,value,x,y,size,color,weight,max,u){
  // text rises through a mask (reading-order reveal, references/craft/typography.md)
  ctx.save();ctx.beginPath();ctx.rect(x-6,y-size*0.75,max+12,size*1.5);ctx.clip();
  text(ctx,value,x,y+(1-u)*size*1.2,size,color,weight,max);ctx.restore();
}

export function drawPresentation(ctx,timeline,time,width,height) {
  const scene=active(timeline,time,"scene")[0];if(!scene)return;
  const page=scene.page||{}, local=time-scene.start_sec;
  const accent=timeline.presentation.accent||"#c94b3c";
  const snap=EASINGS.snap, expo=EASINGS.expoOut, P=(a,d)=>clamp1((local-a)/d);
  ctx.save();ctx.scale(width/1280,height/720);
  ctx.fillStyle="#eef1eb";ctx.fillRect(0,0,1280,720);
  ctx.fillStyle=accent;ctx.fillRect(68,55,34*expo(P(0,0.35)),5);
  ctx.globalAlpha=expo(P(0.05,0.4));text(ctx,timeline.presentation.brand,114,58,16,"#36504c",700,1010);ctx.globalAlpha=1;
  slotText(ctx,page.title||scene.title,68,143,48,"#192f2d",700,1140,snap(P(0.08,0.7)));
  ctx.globalAlpha=EASINGS.cubicOut(P(0.35,0.5));text(ctx,page.subtitle||"",70,207+(1-EASINGS.cubicOut(P(0.35,0.5)))*12,22,"#5b7068",500,1120);ctx.globalAlpha=1;
  if(page.type==="chart"){
    const values=page.values||[20,42,58,83], labels=page.labels||values.map((_,i)=>String(i+1));
    const ticks=niceTicks(page.max??Math.max(...values)), top=ticks[ticks.length-1], hi=page.highlight??values.length-1;
    const base=575, span=300, y=(v)=>base-v/top*span, g=expo(P(0.4,0.6));
    ctx.lineWidth=1;
    for(const tv of ticks){ // fixed axis: never rescales while values animate
      ctx.globalAlpha=(tv===0?0.55:0.2)*g;ctx.strokeStyle="#4f655c";ctx.beginPath();ctx.moveTo(110,y(tv)+0.5);ctx.lineTo(110+1060*g,y(tv)+0.5);ctx.stroke();
      ctx.globalAlpha=0.8*g;
      ctx.fillStyle="#647b6d";ctx.font=`500 14px "Microsoft YaHei","Segoe UI",sans-serif`;ctx.textAlign="right";ctx.fillText(String(tv)+(page.unit||""),100,y(tv)+5);ctx.textAlign="left";
    }
    ctx.globalAlpha=1;
    const slot=1060/values.length, bw=Math.min(150,slot*0.58);
    values.forEach((value,i)=>{
      const u=EASINGS.backOut(P(0.55+i*0.12,0.7)), x=110+i*slot+(slot-bw)/2, v=value*Math.max(0,u), h=base-y(v);
      if(u<=0)return;
      ctx.fillStyle=i===hi?accent:"#437a70";
      ctx.beginPath();ctx.roundRect?ctx.roundRect(x,base-h,bw,h,[6,6,0,0]):ctx.rect(x,base-h,bw,h);ctx.fill();
      ctx.globalAlpha=clamp1((u-0.2)*2);
      const shown=Math.round(value*expo(P(0.55+i*0.12,0.9)));
            ctx.fillStyle=i===hi?accent:"#193f38";ctx.font=`700 26px "Microsoft YaHei","Segoe UI",sans-serif`;ctx.textAlign="center";ctx.fillText(shown+(page.unit||""),x+bw/2,base-h-14);
      ctx.fillStyle="#4f655c";ctx.font=`500 19px "Microsoft YaHei","Segoe UI",sans-serif`;ctx.fillText(labels[i],x+bw/2,base+34);
      ctx.textAlign="left";ctx.globalAlpha=1;
    });
  }else if(page.type==="media"){
    const media=active(timeline,time,"image").concat(active(timeline,time,"footage")).find((c)=>c.role==="page");
    const u=snap(P(0.3,0.8));
    ctx.save();ctx.globalAlpha=u;ctx.translate(0,(1-u)*30);
    ctx.fillStyle="rgba(0,0,0,0.08)";ctx.fillRect(76,263,1140,370);
    ctx.fillStyle="#1c272a";ctx.fillRect(70,253,1140,370);
    if(media){ctx.save();ctx.translate(70,253);drawMedia(ctx,media,time,1140,370);ctx.restore();}
    ctx.restore();
  }else if(page.type==="metrics"){
    const metrics=page.metrics||[];
    metrics.forEach((metric,i)=>{
      const x=80+i*385,u=P(0.4+i*0.15,1.1),e=expo(u);
      ctx.fillStyle="#d4ddd5";ctx.fillRect(x,285,325*expo(P(0.3+i*0.15,0.6)),2);
      ctx.globalAlpha=clamp1(u*4);
      text(ctx,typeof metric.value==="number"?`${Math.round(metric.value*e)}${metric.unit||""}`:metric.value,x,405,72,accent,700,320);
      ctx.globalAlpha=EASINGS.cubicOut(P(0.8+i*0.15,0.5));wrap(ctx,metric.label,x,502,320,30,21,"#38544a");ctx.globalAlpha=1;
    });
  }else{
    const bullets=page.bullets||[];
    bullets.forEach((item,i)=>{
      const u=snap(P(0.45+i*0.2,0.6));if(u<=0)return;
      const y=302+i*92, dim=page.active==null||page.active===i?1:0.38;
      ctx.save();ctx.globalAlpha*=dim;
      ctx.fillStyle=accent;ctx.fillRect(75,y-16,6,32*u);
      slotText(ctx,String(i+1).padStart(2,"0"),100,y,25,accent,700,70,u);
      ctx.beginPath();ctx.rect(160,y-30,1050,60);ctx.clip();
      wrap(ctx,item,173,y+(1-u)*40,980,32,25,"#243e35");ctx.restore();
    });
  }
  ctx.fillStyle="#acbcb1";ctx.fillRect(68,663,1144,1);
  text(ctx,page.footer||page.source||"VIDEO MASTER / CODE-RENDERED",70,689,14,"#647b6d",500,1000);
  text(ctx,`${scene.page_number} / ${timeline.presentation.pages}`,1155,689,16,"#436153",600,100);
  const subtitle=active(timeline,time,"subtitle")[0];
  if(subtitle&&timeline.presentation.captions!==false){
    const transform=subtitle.transform||{};
    ctx.save();ctx.translate(transform.x||0,transform.y||0);ctx.scale(transform.scale||1,transform.scale||1);ctx.globalAlpha*=transform.opacity??1;
    ctx.fillStyle="#1b302bef";ctx.fillRect(70,632,1140,32);
    text(ctx,subtitle.text,84,648,18,"#f1f4ee",500,1108);ctx.restore();
  }
  ctx.restore();
}
