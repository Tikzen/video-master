import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { configureImages } from "./image-tools.mjs";

test("image tool setup emits blank env, preserves existing credentials and stores only selection", async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"video-master-tools-"));
  try {
    const result=await configureImages(root,"external","openai");
    assert.equal(result.env_created,true);
    const empty=await fs.readFile(path.join(root,".env"),"utf8");
    assert.ok(empty.includes("OPENAI_API_KEY=\n"));
    assert.ok(empty.includes("OPENAI_MODEL=\n"));
    assert.ok(empty.includes("OPENAI_BASE_URL=\n"));
    const fake=empty.replace("OPENAI_API_KEY=\n","OPENAI_API_KEY=fake-test-secret\n");
    await fs.writeFile(path.join(root,".env"),fake);
    const next=await configureImages(root,"external","gemini");
    assert.equal(next.env_created,false);
    assert.equal(await fs.readFile(path.join(root,".env"),"utf8"),fake);
    const selected=await fs.readFile(path.join(root,"asset_tools.json"),"utf8");
    assert.ok(!selected.includes("fake-test-secret"));
    assert.equal(JSON.parse(selected).backend,"gemini");
    await configureImages(root,"builtin");
    assert.equal(JSON.parse(await fs.readFile(path.join(root,"asset_tools.json"))).image_path,"builtin");
    assert.ok((await fs.readFile(path.join(root,".gitignore"),"utf8")).includes(".env\n"));
    await assert.rejects(configureImages(root,"external","unknown"),/Unknown/);
  } finally {
    assert.ok(!path.relative(os.tmpdir(),root).startsWith(".."));
    await fs.rm(root,{recursive:true,force:true});
  }
});
