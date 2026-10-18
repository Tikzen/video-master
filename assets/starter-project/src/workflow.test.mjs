import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createProjectServer } from "./server.mjs";
import { probe } from "./media.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");

test("workflow: browser choices, real agent actions, conflicts, voice setup and encoded export",{timeout:240000},async()=>{
  await fs.mkdir(path.join(root,".editor"),{recursive:true});
  const fixture=await fs.mkdtemp(path.join(root,".editor","workflow-test-"));
  let server,browser;
  try{
    for(const folder of ["src","assets"])await fs.cp(path.join(root,folder),path.join(fixture,folder),{recursive:true});
    for(const file of ["video.json","timeline.json","package.json"])await fs.copyFile(path.join(root,file),path.join(fixture,file));
    await fs.symlink(path.join(root,"node_modules"),path.join(fixture,"node_modules"),process.platform==="win32"?"junction":"dir");
    const instance=await createProjectServer(fixture);server=instance.server;
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on("pageerror",(error)=>errors.push(error.message));
    const api=async(route,data,method="POST")=>{
      const reply=await page.request.fetch(`${instance.url}/api/${route}`,{method:data===undefined?"GET":method,...(data===undefined?{}:{data})});
      return {status:reply.status(),data:await reply.json()};
    };
    const health=(await api("health")).data;
    assert.equal(health.service,"video-master");
    assert.equal(health.root,fixture);
    assert.equal(health.pid,process.pid);
    assert.equal(health.read_only,false);
    assert.match(health.instance_id,/^[a-f0-9-]{36}$/);
    await page.goto(`${instance.url}/create`);
    await page.waitForSelector("#direction-form");
    await page.waitForFunction(()=>window.__plannerReady);
    assert.ok(await page.locator(".header svg").count()>0,"Lucide dependency icons render with linked node_modules");
    assert.ok(await page.locator("#planner-canvas").evaluate((canvas)=>{
      const pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
      for(let i=0;i<pixels.length;i+=64)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
      return colors.size>8;
    }),"Planner contains actual nonblank project pixels");
    for(const [name,width,height] of [["desktop",1440,1000],["mobile",390,844],["small",320,700]]){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: no overflow`);
      assert.equal(await page.locator(".genre img").evaluateAll((items)=>items.filter((item)=>item.complete&&item.naturalWidth>0).length),3);
      await fs.mkdir(path.join(root,"validation"),{recursive:true});
      await page.screenshot({path:path.join(root,`validation/planner-${name}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1440,height:1000});
    assert.equal(await page.locator("[name=duration]").count(),0);
    assert.equal(await page.locator("#plan-voice-provider").count(),0);
    await page.locator('input[name=genre][value=studio]').check();
    await page.locator('[name=style][value=__custom__]').check();
    await page.locator('[name=style_custom]').fill("Test-only studio style");
    await page.reload();await page.waitForFunction(()=>window.__plannerReady);
    assert.equal(await page.locator("[name=style_custom]").inputValue(),"Test-only studio style");
    assert.equal((await api("workflow")).data.confirmations.stage1,null,"Draft is not consent");
    await page.getByRole("button",{name:"确认方向，交给 Agent",exact:true}).click();
    await page.waitForFunction(()=>document.body.textContent.includes("等待 Agent 准备下一轮方案"));
    let flow=(await api("workflow")).data;
    assert.equal(flow.confirmations.stage1.values.style,"Test-only studio style");
    assert.equal(flow.confirmations.stage1.values.duration,undefined);
    assert.equal(flow.confirmations.stage2,null);
    const proposal={stage:"stage2",revision:1,title:"Test-only treatments",stage1_hash:flow.confirmations.stage1_hash,
      fields:{resolution:{label:"分辨率",value:"1280x720",choices:["1280x720","1920x1080","3840x2160"]},captions:{label:"字幕",value:"显示",choices:["显示","不显示","只显示重点"]}},
      candidates:["a","b","c"].map((id)=>({id,name:`Test treatment ${id}`,recommended:id==="a",
        concept:"Test concept",image_system:"Test visual system",motion_system:"Test camera system",structure:"Test story structure",execution:"Test execution"}))};
    const early=await api("proposals",{expected_hash:flow.stage2.proposal_hash,proposal:{...proposal,candidates:proposal.candidates.slice(0,2)}});
    assert.equal(early.status,400);
    assert.equal((await api("proposals",{expected_hash:flow.stage2.proposal_hash,proposal})).status,200);
    await page.goto(`${instance.url}/create?round=stage2`);await page.waitForSelector(".treatment");
    await page.screenshot({path:path.join(root,"validation/treatments-desktop.png"),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(root,"validation/treatments-mobile.png"),fullPage:true});
    await page.locator('[name=selected][value=__custom__]').check();
    await page.locator('[name=selected_custom]').fill("Test-only alternate camera grammar");
    await page.getByRole("button",{name:"确认方案，交给 Agent 制作",exact:true}).click();
    await page.waitForSelector(".waiting");
    flow=(await api("workflow")).data;
    assert.equal(flow.confirmations.stage2,null,"Custom treatment requests are not approval");
    assert.equal(flow.treatment_request.text,"Test-only alternate camera grammar");
    await page.goto(`${instance.url}/create?round=stage2`);await page.waitForSelector(".treatment");
    await page.locator('input[name=selected][value=b]').check();
    await page.getByRole("button",{name:"确认方案，交给 Agent 制作",exact:true}).click();
    await page.waitForFunction(()=>document.body.textContent.includes("等待 Agent 接续制作"));
    flow=(await api("workflow")).data;
    assert.equal(flow.confirmations.stage2.values.selected,"b");
    await page.goto(instance.url);await page.waitForFunction(()=>window.__editorReady);
    await page.setViewportSize({width:1440,height:1000});
    let state=(await api("workspace")).data;
    const originalRevision=state.revision;
    const action=await api("actions",{expected_revision:state.revision,actions:[
      {type:"cue.update",id:"title-01",patch:{text:"AGENT EDIT",transform:{x:30}}},
      {type:"view.set",patch:{time:1,selected_id:"title-01",zoom:110,snap:false,playing:false}},
    ]});
    assert.equal(action.status,200);
    await page.waitForFunction(()=>document.querySelector("#cue-text").value==="AGENT EDIT");
    assert.equal(await page.locator("#x-value").textContent(),"30 px");
    assert.equal(await page.locator("#timeline-zoom").inputValue(),"110");
    assert.equal(await page.locator("#snap-toggle").getAttribute("aria-pressed"),"false");
    assert.equal((await api("actions",{expected_revision:originalRevision,actions:[{type:"cue.delete",id:"title-01"}]})).status,409);
    await page.locator("#cue-text").fill("USER DRAFT");await page.locator("#cue-text").press("Tab");
    await api("editor-presence",{dirty:true});
    state=(await api("workspace")).data;
    assert.equal((await api("actions",{expected_revision:state.revision,actions:[{type:"cue.delete",id:"title-01"}]})).status,409);
    await page.locator("#save-button").click();await page.waitForFunction(()=>document.querySelector("#save-state").textContent==="已保存");
    await api("editor-presence",{dirty:false});
    state=(await api("workspace")).data;
    assert.equal((await api("actions",{expected_revision:state.revision,command:"undo"})).status,200);
    await page.waitForFunction(()=>window.__videoTimeline.cues.find((item)=>item.id==="title-01").text==="AGENT EDIT");
    state=(await api("workspace")).data;
    assert.equal((await api("actions",{expected_revision:state.revision,actions:[{type:"view.set",patch:{panel:"voice"}}]})).status,200);
    await page.waitForFunction(()=>document.querySelector("#voice-tool-dialog").open);
    await page.locator("#voice-provider").selectOption("minimax");
    await page.locator("#voice-speakers input").first().fill("test-voice");
    await page.getByRole("button",{name:"保存配音方案",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector("#voice-tool-result").textContent.includes("MINIMAX_API_KEY"));
    assert.equal((await api("voice-preview",{text:"test",speaker:"narrator"})).status,403);
    assert.equal((await page.request.get(`${instance.url}/.env`)).status(),404);
    await page.screenshot({path:path.join(root,"validation/voice-setup.png"),fullPage:true});
    if(process.env.VM_TEST_AUDIO){
      await page.locator("#voice-provider").selectOption("provided");
      await page.locator("#narration-file").setInputFiles(process.env.VM_TEST_AUDIO);
      await page.locator("#apply-narration").waitFor({state:"visible",timeout:120000});
      await page.locator("#apply-narration").click();
      await page.waitForFunction(()=>document.querySelector("#narration-result").textContent.includes("已加入"));
      const current=(await api("workspace")).data;
      assert.ok(current.timeline.cues.some((cue)=>cue.title==="上传配音"));
      assert.ok(current.timeline.cues.some((cue)=>cue.kind==="subtitle"&&cue.words?.length));
      assert.equal((await api("narration-assets")).data.length,1);
    }
    await page.locator("#close-voice-tool").click();
    const checkpoint={id:"script-test",revision:1,title:"Test-only script review",body:"This is an isolated test, not production approval.",
      options:[{id:"approve",label:"确认台本"},{id:"revise",label:"修改台本"}]};
    assert.equal((await api("checkpoints",checkpoint)).status,200);
    await page.goto(`${instance.url}/create?panel=review`);
    await page.waitForSelector("[data-checkpoint]");
    await page.locator('[data-checkpoint] select').selectOption("revise");
    await page.locator('[data-checkpoint] summary').click();
    await page.locator('[data-checkpoint] textarea').fill("Test-only revision request");
    await page.getByRole("button",{name:"提交意见",exact:true}).click();
    await page.waitForFunction(()=>document.body.textContent.includes("已提交：修改台本"));
    assert.equal((await api("checkpoints")).data[0].response.selected,"revise");
    await page.locator('button[data-stage=voice]').click();
    await page.waitForSelector("#plan-voice-provider");
    await page.waitForFunction(()=>!document.querySelector('#tools-form [type=submit]').disabled);
    await page.locator("#plan-voice-provider").selectOption("minimax");
    await page.getByRole("button",{name:"保存工具方案",exact:true}).waitFor({state:"visible"});
    for(const [name,width,height] of [["desktop",1440,1000],["mobile",390,844]]){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(root,`validation/voice-planner-${name}.png`),fullPage:true});
    }
    await page.locator("#plan-clone > summary").click();
    await page.locator('[data-clone=submit]').click();
    assert.match(await page.locator('[data-clone=status]').textContent(),/选择样本/);
    assert.equal((await api("voice-clone",{voice_id:"NoConsent001"})).status,403);
    assert.equal((await page.request.get(`${instance.url}/voice-samples/clones.json`)).status(),404);
    const note=(await api("annotations",{time_sec:1,text:"Test-only agent note"})).data.at(-1);
    assert.equal((await api("annotations",{id:note.id,status:"resolved",resolution:"Test-only fix"},"PATCH")).status,200);
    assert.equal((await api("render",{})).status,202);
    const start=Date.now();
    let render;
    do{
      await new Promise((resolve)=>setTimeout(resolve,500));
      render=(await api("render-status")).data;
      if(render.state==="error")throw new Error(render.error);
    }while(render.state!=="done"&&Date.now()-start<160000);
    assert.equal(render.state,"done");
    const info=await probe(path.join(fixture,render.output));
    assert.ok(info.streams.some((stream)=>stream.codec_type==="video"));
    assert.ok(info.streams.some((stream)=>stream.codec_type==="audio"));
    assert.equal((await api("deliveries")).data.files.length,1);
    assert.deepEqual(errors,[]);
  }finally{
    await browser?.close();
    if(server)await new Promise((resolve)=>server.close(resolve));
    await fs.rm(fixture,{recursive:true,force:true});
  }
});
