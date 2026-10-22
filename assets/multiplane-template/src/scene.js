// Replace this infrastructure sample with the episode's authored scene system.
export const post={motionBlur:1,grain:0};
export const blurAt=()=>1;
export async function setup() {}
export function drawAt(ctx,t,{project}) {
  const {width:w,height:h}=project;
  ctx.fillStyle='#101c2d';ctx.fillRect(0,0,w,h);
  const x=w*(.2+.6*(.5-.5*Math.cos(t*.7)));
  ctx.fillStyle='#78e9d7';ctx.beginPath();ctx.arc(x,h*.5,h*.12,0,Math.PI*2);ctx.fill();
}
