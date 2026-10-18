import fs from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "./media.mjs";
import { digest } from "./planning.mjs";

async function read(root) {
  try { return JSON.parse(await fs.readFile(path.join(root,"review/checkpoints.json"),"utf8")); }
  catch(error){if(error.code==="ENOENT")return [];throw error;}
}
export async function checkpoints(root) { return (await read(root)).map((item)=>({...item,proposal_hash:digest(item.proposal)})); }
const publicMedia=(src)=>typeof src==="string"&&/^(assets|audio|delivery|renders\/preview)\/[^?#]+$/.test(src)&&!src.includes("..")&&!src.includes("\\");
export const UPLOAD_PATTERN=/^assets\/imports\/images\/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/;
export async function publishCheckpoint(root, proposal) {
  if(!/^[a-z0-9-]{1,80}$/.test(proposal.id||"")||!Number.isInteger(proposal.revision)||proposal.revision<1)throw new Error("Checkpoint needs ID and positive revision");
  if(typeof proposal.title!=="string"||typeof proposal.body!=="string"||proposal.body.length>100000)throw new Error("Checkpoint needs title and body");
  if(!Array.isArray(proposal.options)||proposal.options.length<2||proposal.options.some((option)=>typeof option.id!=="string"||typeof option.label!=="string")||new Set(proposal.options.map((o)=>o.id)).size!==proposal.options.length)throw new Error("Checkpoint needs unique choices");
  if(proposal.media&&!publicMedia(proposal.media))throw new Error("Checkpoint media must be a local public asset");
  if(proposal.notice!==undefined&&(typeof proposal.notice!=="string"||proposal.notice.length>2000))throw new Error("Checkpoint notice must be short text");
  // Gallery: the user picks one rendered/generated candidate (studio looks, host designs, sources).
  if(proposal.candidates!==undefined){
    const list=proposal.candidates;
    if(!Array.isArray(list)||list.length<2||list.length>8)throw new Error("Gallery checkpoints need 2 to 8 candidates");
    if(list.some((c)=>!/^[a-z0-9-]{1,60}$/.test(c?.id||"")||typeof c.label!=="string"||(c.description!==undefined&&typeof c.description!=="string")
      ||(c.warning!==undefined&&typeof c.warning!=="string")||(c.media!==undefined&&!(Array.isArray(c.media)?c.media:[c.media]).every(publicMedia))))
      throw new Error("Each candidate needs an id, label and local public media");
    if(new Set(list.map((c)=>c.id)).size!==list.length)throw new Error("Candidate IDs must be unique");
    if(list.filter((c)=>c.recommended).length>1)throw new Error("Recommend at most one candidate");
  }
  if(proposal.allow_upload!==undefined){
    const u=proposal.allow_upload;
    if(typeof u!=="object"||typeof u.label!=="string"||!Number.isInteger(u.max??4)||(u.max??4)<1||(u.max??4)>12)throw new Error("allow_upload needs a label and max 1-12");
  }
  const items=await read(root),previous=items.find((item)=>item.proposal.id===proposal.id);
  if(previous&&proposal.revision<=previous.proposal.revision)throw new Error("Increment checkpoint revision");
  const item={proposal,status:"pending",history:previous?[...(previous.history||[]),{proposal:previous.proposal,response:previous.response}]:[]};
  const index=items.findIndex((entry)=>entry.proposal.id===proposal.id);
  if(index<0)items.push(item);else items[index]=item;
  await atomicJson(path.join(root,"review/checkpoints.json"),items);
  return {status:"published",proposal_hash:digest(proposal)};
}
export async function respondCheckpoint(root,input) {
  const items=await read(root),item=items.find((entry)=>entry.proposal.id===input.id);
  if(!item||digest(item.proposal)!==input.proposal_hash)throw new Error("Checkpoint changed; reload before confirming");
  if(!item.proposal.options.some((option)=>option.id===input.selected))throw new Error("Choose a valid response");
  if(typeof input.note!=="string"||input.note.length>10000)throw new Error("Invalid review note");
  if(item.proposal.requires_consent&&item.proposal.options.find((option)=>option.id===input.selected)?.authorizes===true&&input.consent!==true)throw new Error("Explicit external action consent is required");
  if(item.response)throw new Error("Already submitted; request a revised checkpoint");
  const option=item.proposal.options.find((o)=>o.id===input.selected);
  let candidate;
  if(item.proposal.candidates){
    candidate=input.candidate||undefined;
    if(candidate!==undefined&&!item.proposal.candidates.some((c)=>c.id===candidate))throw new Error("Choose one of the shown candidates");
    if(candidate===undefined&&option.without_candidate!==true)throw new Error("Choose a candidate first");
  }
  const uploads=input.uploads??[];
  if(!Array.isArray(uploads)||uploads.length>(item.proposal.allow_upload?.max??(item.proposal.allow_upload?4:0))||uploads.some((src)=>!UPLOAD_PATTERN.test(src)))throw new Error("Invalid uploaded files");
  for(const src of uploads)await fs.access(path.join(root,src));
  const required=item.proposal.candidates?.find((c)=>c.id===candidate)?.requires_upload;
  if(required&&!uploads.length)throw new Error("This choice needs an uploaded image");
  item.response={selected:input.selected,note:input.note,consent:input.consent===true,source:"browser-user-submission",at:new Date().toISOString(),proposal_hash:input.proposal_hash,
    ...(candidate?{candidate}:{}),...(uploads.length?{uploads}:{})};
  item.status="responded";
  await atomicJson(path.join(root,"review/checkpoints.json"),items);
  return {status:"saved"};
}
