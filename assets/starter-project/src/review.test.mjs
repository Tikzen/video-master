import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkpoints,publishCheckpoint,respondCheckpoint } from "./review.mjs";
test("review checkpoints: hashes, actual user decisions, consent, immutable history",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"vm-review-"));
  try{
    const proposal={id:"image-cost",revision:1,title:"Test-only image approval",body:"Test scope and cost",requires_consent:true,
      options:[{id:"go",label:"Approve",authorizes:true},{id:"no",label:"Decline"}]};
    await publishCheckpoint(root,proposal);
    const [item]=await checkpoints(root);
    await assert.rejects(()=>respondCheckpoint(root,{id:proposal.id,proposal_hash:"old",selected:"go",note:"",consent:true}),/changed/);
    await assert.rejects(()=>respondCheckpoint(root,{id:proposal.id,proposal_hash:item.proposal_hash,selected:"go",note:"",consent:false}),/consent/);
    await respondCheckpoint(root,{id:proposal.id,proposal_hash:item.proposal_hash,selected:"no",note:"Not now",consent:false});
    await assert.rejects(()=>respondCheckpoint(root,{id:proposal.id,proposal_hash:item.proposal_hash,selected:"go",note:"",consent:true}),/Already/);
    await publishCheckpoint(root,{...proposal,revision:2});
    const [next]=await checkpoints(root);
    assert.equal(next.status,"pending");assert.equal(next.history[0].response.selected,"no");
    await assert.rejects(()=>publishCheckpoint(root,{...proposal,revision:3,media:"assets/../private"}),/local public/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test("gallery checkpoints: one shown candidate, discouraged template, required host-art upload",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"vm-gallery-"));
  try{
    const proposal={id:"host-source",revision:1,title:"主播从哪里来",body:"选择角色来源",notice:"不推荐直接使用模板角色。",
      candidates:[{id:"upload",label:"上传立绘",requires_upload:true,recommended:true},{id:"generate",label:"生图 API 原创"},
        {id:"template",label:"内置模板",warning:"不推荐：模板角色辨识度低"}],
      allow_upload:{label:"上传立绘",max:2},
      options:[{id:"use",label:"采用所选"},{id:"more",label:"都不满意，再出几套",without_candidate:true}]};
    await assert.rejects(()=>publishCheckpoint(root,{...proposal,candidates:[{id:"x",label:"x",media:"../secret.png"},{id:"y",label:"y"}]}),/local public/);
    await assert.rejects(()=>publishCheckpoint(root,{...proposal,candidates:[{id:"x",label:"x",recommended:true},{id:"y",label:"y",recommended:true}]}),/at most one/);
    await publishCheckpoint(root,proposal);
    const [item]=await checkpoints(root);
    const base={id:proposal.id,proposal_hash:item.proposal_hash,note:"",consent:false};
    await assert.rejects(()=>respondCheckpoint(root,{...base,selected:"use"}),/candidate first/);
    await assert.rejects(()=>respondCheckpoint(root,{...base,selected:"use",candidate:"other"}),/shown candidates/);
    await assert.rejects(()=>respondCheckpoint(root,{...base,selected:"use",candidate:"upload"}),/uploaded image/);
    await assert.rejects(()=>respondCheckpoint(root,{...base,selected:"use",candidate:"upload",uploads:["assets/../x.png"]}),/Invalid uploaded/);
    const art="assets/imports/images/0b8f8a8e-6b8e-4c39-9a51-3d3f5d5e7a10.png";
    await fs.mkdir(path.join(root,"assets/imports/images"),{recursive:true});await fs.writeFile(path.join(root,art),"x");
    await respondCheckpoint(root,{...base,selected:"use",candidate:"upload",uploads:[art]});
    const [done]=await checkpoints(root);
    assert.equal(done.response.candidate,"upload");assert.deepEqual(done.response.uploads,[art]);
    await publishCheckpoint(root,{...proposal,revision:2});
    const [next]=await checkpoints(root);
    await respondCheckpoint(root,{id:proposal.id,proposal_hash:next.proposal_hash,note:"更可爱",consent:false,selected:"more"});
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
