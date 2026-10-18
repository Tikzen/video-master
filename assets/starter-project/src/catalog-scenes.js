const palette={ink:"#202124",paper:"#f5f5f7",red:"#ed574a",yellow:"#f2c95e",blue:"#647fa7",pink:"#ef9eab"};
function rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function text(ctx,value,x,y,size,color=palette.paper,weight=600){
  ctx.fillStyle=color;ctx.font=`${weight} ${size}px "Segoe UI","Microsoft YaHei",sans-serif`;ctx.fillText(value,x,y);
}
function line(ctx,points,color,width=1){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.stroke();
}
function ellipse(ctx,x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function label(ctx,name,color=palette.paper){
  text(ctx,"VIDEO MASTER / CODE STUDY",36,34,10,color,500);
  text(ctx,name,36,336,10,color,500);text(ctx,"16:9 / 30 FPS",529,336,10,color,500);
}
function host(ctx,x,y,colors,pose=0){
  const px=5;
  const blocks=[
    [-8,-22,16,5,colors.hair],[-10,-17,20,10,colors.hair],[-8,-14,16,14,"#f1cfb4"],
    [-10,-17,5,11,colors.hair],[6,-17,4,8,colors.hair],
    [-7,0,14,4,"#f1cfb4"],[-12,4,24,14,colors.jacket],[-3,4,6,14,"#fafafa"],
    [-12,12,8,8,colors.jacket],[4,12,8,8,colors.jacket],
  ];
  for(const [a,b,w,h,c] of blocks)rect(ctx,x+a*px,y+b*px,w*px,h*px,c);
  rect(ctx,x-5*px,y-7*px,2*px,2*px,"#292933");rect(ctx,x+3*px,y-7*px,2*px,2*px,"#292933");
  rect(ctx,x-px,y-2*px,3*px,px,"#ba6468");
  if(pose){rect(ctx,x+11*px,y+2*px,7*px,6*px,colors.jacket);rect(ctx,x+16*px,y-4*px,5*px,7*px,"#f1cfb4");}
}
export function renderCatalog(ctx,genre,time=1){
  ctx.save();ctx.scale(ctx.canvas.width/640,ctx.canvas.height/360);
  if(genre==="mv"){
    rect(ctx,0,0,640,360,"#252326");
    rect(ctx,34,55,572,242,"#ee5a49");
    for(let i=0;i<9;i++)line(ctx,[[360+i*28,55],[242+i*28,297]],"#f08c69",1);
    text(ctx,"RHYTHM",54,159,78,"#252326",800);text(ctx,"IN MOTION",56,212,38,"#fff4e4",700);
    rect(ctx,438,236,143,35,"#f2c95e");text(ctx,"120 / BPM",454,260,16,"#252326",600);
    for(let i=0;i<64;i++){const h=6+Math.abs(Math.sin(i*.71+time))*26;rect(ctx,55+i*5,269-h/2,2,h,"#252326");}
    ellipse(ctx,524,92,34,34,"#252326");ellipse(ctx,524,92,22,22,"#f2c95e");ellipse(ctx,524,92,5,5,"#252326");
    label(ctx,"01 / MUSIC VIDEO");
  }else if(genre==="studio"){
    rect(ctx,0,0,640,360,"#27282e");
    for(let x=0;x<640;x+=40)line(ctx,[[x,44],[x,300]],"#35363f");
    for(let y=44;y<300;y+=32)line(ctx,[[0,y],[640,y]],"#35363f");
    rect(ctx,147,61,346,155,"#42434d");rect(ctx,153,67,334,143,"#edd2d8");
    rect(ctx,168,81,39,5,"#d55563");text(ctx,"ON AIR",223,131,38,"#39333d",800);
    text(ctx,"THE CODE STUDIO",210,159,13,"#5c535d",600);
    line(ctx,[[208,179],[436,179]],"#d59ea8",2);
    for(let i=0;i<12;i++)rect(ctx,231+i*15,176,6,4+Math.abs(Math.sin(i*.8))*14,"#d55563");
    host(ctx,111,210,{hair:"#eee8dc",jacket:"#c84e5b"},1);
    host(ctx,537,210,{hair:"#353d61",jacket:"#bcb0d8"});
    rect(ctx,27,276,586,13,"#8c8a99");rect(ctx,39,289,562,43,"#4a4856");rect(ctx,39,318,562,14,"#312f3b");
    rect(ctx,265,293,113,21,"#eed7dd");text(ctx,"VM / NEWS",280,308,12,"#40363f",700);
    label(ctx,"02 / STUDIO EXPLAINER");
  }else if(genre==="product"){
    rect(ctx,0,0,640,360,"#e8e8ed");
    rect(ctx,0,0,272,360,"#232428");
    text(ctx,"FORM",34,140,65,"#f8f8fa",700);text(ctx,"/ ONE",34,204,56,"#f8f8fa",700);
    rect(ctx,36,227,34,3,"#e95b4d");text(ctx,"SOUND, REFINED.",36,254,12,"#bcbcc5",500);
    ctx.strokeStyle="#9c9daa";ctx.lineWidth=22;ctx.beginPath();ctx.moveTo(347,218);ctx.bezierCurveTo(323,79,542,44,567,218);ctx.stroke();
    ctx.strokeStyle="#fbfbfd";ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(347,215);ctx.bezierCurveTo(323,79,542,44,567,215);ctx.stroke();
    ctx.fillStyle="#a5a6b3";ctx.beginPath();ctx.roundRect(326,183,45,104,20);ctx.fill();
    ctx.fillStyle="#f8f8fa";ctx.beginPath();ctx.roundRect(337,180,39,103,16);ctx.fill();
    ctx.fillStyle="#a5a6b3";ctx.beginPath();ctx.roundRect(548,178,44,104,20);ctx.fill();
    ctx.fillStyle="#fafafd";ctx.beginPath();ctx.roundRect(539,177,39,103,16);ctx.fill();
    rect(ctx,348,196,4,68,"#b7b8c4");rect(ctx,560,194,4,67,"#c9cad3");
    line(ctx,[[422,90],[463,50],[562,50]],"#8b8c98");text(ctx,"01 / PRECISION",470,44,10,"#656674",600);
    line(ctx,[[565,270],[596,293],[610,293]],"#9c9da8");ellipse(ctx,571,256,3,3,"#ed574a");
    label(ctx,"03 / PRODUCT FILM","#c6c6ce");
    text(ctx,"16:9 / 30 FPS",529,336,10,"#737480",500);
  }else{
    rect(ctx,0,0,640,360,"#f8f8fa");
    text(ctx,"QUARTERLY REVIEW",463,34,10,"#6b6d78",600);
    rect(ctx,36,58,34,4,"#ed574a");text(ctx,"2026 / Q3",36,121,50,"#27282f",700);
    text(ctx,"把结果讲清楚",38,158,19,"#646674",500);
    text(ctx,"42.8%",36,227,47,"#ed574a",700);text(ctx,"GROWTH / YEAR ON YEAR",38,253,10,"#70727e",600);
    line(ctx,[[306,283],[603,283]],"#d8d9e1");
    for(const [i,height] of [67,96,132,169].entries()){
      rect(ctx,321+i*69,283-height,44,height,i===3?"#ed574a":"#8b94aa");
      text(ctx,["18","26","35","48"][i],331+i*69,273-height,12,"#565969",600);
      text(ctx,`Q${i+1}`,333+i*69,304,10,"#737684",500);
    }
    label(ctx,"04 / ANIMATED REPORT","#6b6d78");
  }
  ctx.restore();
}
