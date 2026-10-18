import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createProjectServer } from "./server.mjs";
import { validateConfirmation } from "./planning.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
test("choice rounds: three candidates, opt-in custom text, actual scoped receipts and separate pages",{timeout:60000},async()=>{
  await fs.mkdir(path.join(root,".editor"),{recursive:true});
  const fixture=await fs.mkdtemp(path.join(root,".editor","rounds-test-"));
  let server,browser;
  try{
    for(const folder of ["src","assets"])await fs.cp(path.join(root,folder),path.join(fixture,folder),{recursive:true});
    for(const file of ["video.json","timeline.json","package.json"])await fs.copyFile(path.join(root,file),path.join(fixture,file));
    await fs.symlink(path.join(root,"node_modules"),path.join(fixture,"node_modules"),process.platform==="win32"?"junction":"dir");
    const instance=await createProjectServer(fixture);server=instance.server;
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[],paidCalls=[];page.on("pageerror",(error)=>errors.push(error.message));
    page.on("request",(request)=>{
      if(request.method()==="POST"&&/\/api\/voice-(preview|clone)$/.test(new URL(request.url()).pathname))paidCalls.push(request.url());
    });
    const flow=async()=>page.request.get(`${instance.url}/api/workflow`).then((result)=>result.json());
    const ready=async(url=`${instance.url}/create?round=stage1`)=>{await page.goto(url);await page.waitForFunction(()=>window.__plannerReady);};
    await ready();
    assert.equal(await page.locator(".genre").count(),3);
    assert.equal(await page.locator('[name=genre][value=other]').count(),1);
    for(const name of ["topic","audience","purpose","style"]){
      assert.equal(await page.locator(`[name="${name}"]`).count(),4,`${name}: three plus custom`);
      assert.equal(await page.locator(`[name="${name}_custom"]`).isVisible(),false);
    }
    assert.equal(await page.locator("#direction-form input[type=text]:visible,#direction-form textarea:visible").count(),0,"No typing by default");
    assert.equal(await page.locator("[name=duration],#plan-voice-provider,#plan-image-mode").count(),0,"Future-round fields not in DOM");
    await page.locator('[name=style][value=__custom__]').check();
    await page.locator('[name=style_custom]').fill("Retro manga and technical diagrams");
    await page.locator('[name=genre][value=other]').check();
    await page.locator("[name=custom_direction]").fill("A retro comic music explainer");
    await ready();
    assert.equal(await page.locator("[name=style_custom]").inputValue(),"Retro manga and technical diagrams");
    assert.equal(await page.locator("[name=custom_direction]").inputValue(),"A retro comic music explainer");
    assert.equal((await flow()).confirmations.stage1,null,"Draft is not consent");
    for(const [width,height] of [[1440,1000],[390,844],[320,700]]){
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: no overflow`);
    }
    await page.locator("#direction-form [type=submit]").click();
    await page.waitForSelector(".waiting");
    const accepted=await flow();
    assert.equal(accepted.confirmations.stage1.values.genre,"other");
    assert.equal(accepted.confirmations.stage1.values.style,"Retro manga and technical diagrams");
    assert.equal(accepted.confirmations.stage1.scope,"creative-direction");
    assert.ok(accepted.confirmations.stage1.deferred_fields.includes("duration"));
    assert.equal(accepted.confirmations.stage1.values.duration,undefined);
    assert.equal(await page.locator("#treatment-form").count(),0,"Submission doesn't advance automatically to a new choice form");
    const original=accepted.stage1,proposal={...original,revision:original.revision+1};
    delete proposal.proposal_hash;
    proposal.fields.topic={...proposal.fields.topic,value:"Fresh contextual topic",choices:["Fresh contextual topic","Product launch highlights","Studio introduction"]};
    const published=await page.request.post(`${instance.url}/api/proposals`,{data:{expected_hash:original.proposal_hash,proposal}});
    assert.equal(published.status(),200);
    await ready();
    assert.equal(await page.locator('[name=topic]:checked').inputValue(),"Fresh contextual topic","Stale drafts don't contaminate new round");
    assert.equal(await page.locator("[name=style_custom]").isVisible(),false);
    await page.locator('[name=mode][value=one_sentence]').check();
    assert.equal(await page.locator("[name=style]").first().isVisible(),false);
    await page.locator("#direction-form [type=submit]").click();
    await page.waitForFunction(()=>!document.querySelector("#direction-form"));
    const delegated=await flow();
    assert.equal(delegated.delegated,true);
    assert.equal(delegated.confirmations.stage2,null);
    assert.equal(delegated.confirmations.stage1.values.style,undefined,"Hidden styles not falsely approved");
    assert.deepEqual(paidCalls,[]);
    assert.deepEqual(errors,[]);
    const minimal={stage:"stage1",revision:proposal.revision+1,title:"Only unresolved style",context:{genre:"studio",topic:"Known from chat"},
      fields:{style:{label:"风格",value:"Pixel studio",choices:["Pixel studio","News studio","Comic studio"]},mode:{value:"interactive",options:["interactive","one_sentence"]}}};
    assert.equal((await page.request.post(`${instance.url}/api/proposals`,{data:{expected_hash:delegated.stage1.proposal_hash,proposal:minimal}})).status(),200);
    await ready();
    assert.equal(await page.locator("[name=genre],[name=topic],[name=audience],[name=purpose]").count(),0,"Already-known fields are not repeated");
    assert.equal(await page.locator('[name=style]').count(),4);
    await page.locator("#direction-form [type=submit]").click();await page.waitForSelector(".waiting");
    const minimalReceipt=(await flow()).confirmations.stage1;
    assert.deepEqual(Object.keys(minimalReceipt.values).sort(),["mode","style"]);
    assert.deepEqual(errors,[]);
  }finally{
    await browser?.close();
    if(server)await new Promise((resolve)=>server.close(resolve));
    const resolved=path.resolve(fixture),parent=path.resolve(root,".editor");
    assert.ok(resolved.startsWith(parent+path.sep));
    await fs.rm(resolved,{recursive:true,force:true});
  }
});

test("round scope rejects hidden approvals; custom choices keep numerical constraints",()=>{
  const proposal={fields:{genre:{options:["mv"]},topic:{},mode:{options:["interactive","one_sentence"]},duration:{type:"number",min:5,max:600},aspect:{options:["16:9","9:16"]}}};
  assert.throws(()=>validateConfirmation(proposal,{stage:"stage1",round:"creative-direction",values:{genre:"mv",topic:"Test",mode:"one_sentence",duration:"30"}}),/only confirms/);
  assert.throws(()=>validateConfirmation(proposal,{stage:"stage1",round:"creative-direction",values:{genre:"other",topic:"Test",mode:"one_sentence"}}),/custom direction/);
  assert.doesNotThrow(()=>validateConfirmation({fields:{duration:proposal.fields.duration,aspect:proposal.fields.aspect}},{stage:"stage2",values:{duration:"23.6",aspect:"2.39:1"}}));
  assert.throws(()=>validateConfirmation({fields:{duration:proposal.fields.duration}},{stage:"stage2",values:{duration:"-1"}}),/Invalid number/);
});
