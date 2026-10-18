import { trackEnabled } from "./model.js";

export function voiceIntervals(timeline){
  const intervals=timeline.cues.filter((cue)=>cue.kind==="voice"&&(cue.volume??1)>0&&trackEnabled(timeline,cue))
    .map((cue)=>[cue.start_sec,cue.end_sec]).sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const item of intervals){
    const previous=merged.at(-1);
    if(previous&&item[0]<=previous[1]+.1)previous[1]=Math.max(previous[1],item[1]);else merged.push([...item]);
  }
  return merged;
}
export function duckGain(cue,intervals,time){
  if(cue.kind!=="music"||cue.duck_gain==null)return 1;
  let envelope=0;
  for(const [start,end] of intervals){
    envelope=Math.max(envelope,Math.max(0,Math.min(1,(time-start)/.08,(end+.25-time)/.25)));
  }
  return 1-(1-cue.duck_gain)*envelope;
}
export function playbackGain(cue,intervals,time){
  const local=time-cue.start_sec,length=cue.end_sec-cue.start_sec;
  const fadeIn=Math.min(cue.fade_in||0,length/2),fadeOut=Math.min(cue.fade_out||0,length/2);
  const envelope=Math.max(0,Math.min(1,fadeIn?local/fadeIn:1,fadeOut?(length-local)/fadeOut:1));
  return (cue.volume??1)*envelope*duckGain(cue,intervals,time);
}
export function duckExpression(cue,intervals){
  if(cue.kind!=="music"||cue.duck_gain==null||!intervals.length)return String(cue.volume??1);
  const t=`(t+${cue.start_sec})`;
  const envelopes=intervals.map(([start,end])=>`max(0,min(1,min((${t}-${start})/0.08,(${end+.25}-${t})/0.25)))`);
  const maximum=envelopes.reduce((a,b)=>`max(${a},${b})`);
  return `${cue.volume??1}*(1-${1-cue.duck_gain}*${maximum})`;
}

export function mixGainExpression(cue, intervals, sourceStart = cue.start_sec) {
  const length = cue.end_sec - cue.start_sec;
  const fadeIn = Math.min(cue.fade_in || 0, length / 2), fadeOut = Math.min(cue.fade_out || 0, length / 2);
  const time = `(t+${sourceStart})`;
  const enter = fadeIn ? `(${time}-${cue.start_sec})/${fadeIn}` : "1";
  const leave = fadeOut ? `(${cue.end_sec}-${time})/${fadeOut}` : "1";
  // Absolute source time preserves partial fades and duck-release tails in range exports.
  return `(${duckExpression({ ...cue, start_sec: sourceStart }, intervals)})*max(0,min(1,min(${enter},${leave})))`;
}
