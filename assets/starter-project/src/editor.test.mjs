import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { createProjectServer } from "./server.mjs";
import { run, ffmpegPath } from "./media.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("editor: timeline, preview, persistence, audio, confirmations and responsive layout", { timeout: 180000 }, async () => {
  await fs.mkdir(path.join(root, ".editor"), { recursive: true });
  const fixture = await fs.mkdtemp(path.join(root, ".editor", "ui-test-"));
  let browser, server;
  try {
    await fs.cp(path.join(root, "src"), path.join(fixture, "src"), { recursive: true });
    for (const name of ["video.json", "timeline.json", "package.json"]) await fs.copyFile(path.join(root, name), path.join(fixture, name));
    const vendor = path.join(fixture, "node_modules/lucide/dist/umd");
    await fs.mkdir(vendor, { recursive: true });
    await fs.copyFile(path.join(root, "node_modules/lucide/dist/umd/lucide.js"), path.join(vendor, "lucide.js"));
    const instance = await createProjectServer(fixture);
    server = instance.server;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (res) => { if (res.status() >= 500) errors.push(`${res.status()} ${res.url()}`); });
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(instance.url);
    await page.waitForFunction(() => window.__editorReady);
    assert.equal(await page.locator(".second-mark").count(), 9);
    assert.equal(await page.locator(".second-cell").count(), 8);
    assert.equal(await page.locator(".track-lane").count(), 3);
    assert.ok(await page.locator("svg.lucide").count() > 10);
    assert.equal(await page.locator(".waveform").count(), 1);
    const sample = (t) => page.evaluate((time) => {
      window.__renderAt(time);
      const c = document.querySelector("canvas");
      const pixels = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let min = 255, max = 0;
      for (let i = 0; i < pixels.length; i += 137 * 4) { min = Math.min(min, pixels[i]); max = Math.max(max, pixels[i]); }
      return { png: c.toDataURL(), range: max - min };
    }, t);
    const first = await sample(1), repeat = await sample(1), next = await sample(4);
    assert.equal(first.png, repeat.png, "same-time pixel output");
    assert.notEqual(first.png, next.png, "animation changes over time");
    assert.ok(first.range > 60, "canvas is not blank");
    await page.getByRole("button", { name: "定位到第 2 秒", exact: true }).click();
    assert.equal(await page.locator("#time-readout").textContent(), "00:00:02:00");
    await page.locator("#step-forward").click();
    assert.equal(await page.locator("#time-readout").textContent(), "00:00:02:01");
    await page.locator("#play-toggle").click();
    await page.waitForTimeout(350);
    await page.locator("#play-toggle").click();
    assert.notEqual(await page.locator("#time-readout").textContent(), "00:00:02:01");
    await page.locator("#go-start").click();
    const head = await page.locator("#playhead > span").boundingBox();
    await page.mouse.move(head.x + head.width / 2, head.y + 3);
    await page.mouse.down();
    await page.mouse.move(head.x + head.width / 2 + 96, head.y + 3, { steps: 6 });
    await page.mouse.up();
    assert.equal(await page.locator("#time-readout").textContent(), "00:00:01:00");

    const clip = page.locator('.clip[data-id="title-01"]');
    await clip.click();
    await page.locator("#cue-text").fill("TEST TITLE");
    await page.locator("#cue-text").press("Tab");
    assert.equal(await page.locator("#save-state").textContent(), "未保存");
    await page.locator("#undo-button").click();
    assert.equal(await page.locator("#cue-text").inputValue(), "DESIGNED TO MOVE");
    await page.locator("#redo-button").click();
    assert.equal(await page.locator("#cue-text").inputValue(), "TEST TITLE");
    const before = await sample(1);
    await page.locator("#cue-x").focus();
    await page.locator("#cue-x").press("ArrowRight");
    assert.equal(await page.locator("#x-value").textContent(), "1 px");
    assert.notEqual((await sample(1)).png, before.png);
    const bounds = await clip.boundingBox();
    const originalStart = await page.locator("#cue-start").inputValue();
    await page.mouse.move(bounds.x + 20, bounds.y + 16);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 116, bounds.y + 16, { steps: 6 });
    await page.mouse.up();
    assert.ok(Math.abs(Number(await page.locator("#cue-start").inputValue()) - Number(originalStart) - 1) < 0.002);
    const handle = await clip.locator(".right").boundingBox();
    const originalLength = Number(await page.locator("#cue-duration").inputValue());
    await page.mouse.move(handle.x + 3, handle.y + 15);
    await page.mouse.down();
    await page.mouse.move(handle.x + 3 - 48, handle.y + 15, { steps: 6 });
    await page.mouse.up();
    assert.ok(Number(await page.locator("#cue-duration").inputValue()) < originalLength - 0.4);
    await page.locator("#save-button").click();
    await page.waitForFunction(() => document.querySelector("#save-state").textContent === "已保存");
    await page.reload();
    await page.waitForFunction(() => window.__editorReady);
    await page.locator('.clip[data-id="title-01"]').click();
    assert.equal(await page.locator("#cue-text").inputValue(), "TEST TITLE");
    assert.equal(await page.locator("#x-value").textContent(), "1 px");
    await page.locator("#go-start").click();
    await page.locator("#audio-file").setInputFiles(path.join(fixture, "audio/demo-score.wav"));
    await page.waitForFunction(() => document.querySelectorAll(".waveform").length === 2);
    assert.equal(await page.locator(".track-lane").count(), 4);
    await page.locator("#cue-volume").focus();
    await page.locator("#cue-volume").press("Home");
    assert.equal(await page.locator("#volume-value").textContent(), "0%");
    await page.locator("#review-note").fill("Test-only note");
    await page.locator("#add-note").click();
    await page.waitForFunction(() => document.querySelectorAll(".note-item").length === 1);

    await fs.mkdir(path.join(fixture, "planning"), { recursive: true });
    const stage1 = { stage: "stage1", revision: 1, title: "Test brief", summary: "Test-only confirmation",
      fields: { audience: { label: "Audience", value: "Test audience" } } };
    await fs.writeFile(path.join(fixture, "planning/stage1.json"), JSON.stringify(stage1));
    await page.locator("#plan-button").click();
    const firstTab=page.waitForEvent("popup");
    await page.getByRole("link",{name:"打开本轮选择页",exact:true}).click();
    const choices=await firstTab;await choices.waitForFunction(()=>window.__plannerReady);
    await choices.locator('[name=audience][value=__custom__]').check();
    await choices.locator('[name=audience_custom]').fill("Updated test audience");
    await choices.getByRole("button",{name:"确认方向，交给 Agent",exact:true}).click();
    await choices.waitForSelector(".waiting");await choices.close();await page.locator("#close-plan").click();
    const receipt = JSON.parse(await fs.readFile(path.join(fixture, "confirmations/stage1.json")));
    assert.equal(receipt.values.audience, "Updated test audience");
    const stage2 = { stage: "stage2", revision: 1, stage1_hash: digest(receipt), title: "Test treatments",
      candidates: ["a","b","c"].map((id) => ({ id, name: id, description: "Test treatment" })) };
    await fs.writeFile(path.join(fixture, "planning/stage2.json"), JSON.stringify(stage2));
    await page.locator("#plan-button").click();
    const secondTab=page.waitForEvent("popup");
    await page.getByRole("link",{name:"打开本轮选择页",exact:true}).click();
    const treatment=await secondTab;await treatment.waitForFunction(()=>window.__plannerReady);
    await treatment.locator('input[name="selected"][value="b"]').check();
    await treatment.getByRole("button",{name:"确认方案，交给 Agent 制作",exact:true}).click();
    await treatment.waitForFunction(()=>!document.querySelector("#treatment-form"));await treatment.close();await page.locator("#close-plan").click();
    assert.equal(JSON.parse(await fs.readFile(path.join(fixture, "confirmations/stage2.json"))).values.selected, "b");
    const invalid = await page.request.post(`${instance.url}/api/timeline`, { data: { duration_seconds: -1, tracks: [], cues: [] } });
    assert.equal(invalid.status(), 422);
    const outside = await page.request.get(`${instance.url}/video.json`);
    assert.equal(outside.status(), 404);
    const crossOrigin = await page.request.post(`${instance.url}/api/render`, { headers: { Origin: "https://invalid.test" } });
    assert.equal(crossOrigin.status(), 403);
    await page.locator("#image-tool-button").click();
    await page.locator("#image-tool-mode").selectOption("external");
    await page.locator("#image-tool-backend").selectOption("openai");
    await page.getByRole("button",{name:"确认工具方案",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector("#image-tool-result").textContent.includes(".env"));
    assert.ok((await fs.readFile(path.join(fixture,".env"),"utf8")).includes("OPENAI_API_KEY=\n"));
    assert.equal((await page.request.get(`${instance.url}/.env`)).status(),404);
    await page.locator("#close-image-tool").click();

    // Capture the untouched demo rather than test edits.
    await page.request.post(`${instance.url}/api/timeline`, { data: JSON.parse(await fs.readFile(path.join(root, "timeline.json"))) });
    await fs.writeFile(path.join(fixture,"review/annotations.json"),"[]");
    await page.reload();
    await page.waitForFunction(() => window.__editorReady);
    await page.getByRole("button", { name: "定位到第 1 秒", exact: true }).click();
    await fs.mkdir(path.join(root, "validation"), { recursive: true });
    for (const [name, width, height] of [["desktop",1440,1000], ["mobile",390,844], ["small",320,700]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no page overflow`);
      const box = await page.locator("#scene-canvas").boundingBox();
      assert.ok(box.width > 250 && box.height > 130, `${name}: canvas framed`);
      await page.screenshot({ path: path.join(root, `validation/ui-${name}.png`), fullPage: true });
    }
    await fs.mkdir(path.join(fixture,"assets"),{recursive:true});
    await run(ffmpegPath,["-v","error","-f","lavfi","-i","testsrc2=size=320x180:rate=30","-t","2","-c:v","libx264","-pix_fmt","yuv420p",path.join(fixture,"assets/test.mp4")]);
    const sequence=JSON.parse(await fs.readFile(path.join(root,"timeline.json")));
    sequence.tracks.push({id:"media-test",kind:"video",name:"Test footage",visible:true,muted:false});
    sequence.cues.push({id:"test-footage",track_id:"media-test",kind:"footage",src:"assets/test.mp4",title:"Test footage",start_sec:0,end_sec:2,source_offset:0});
    await page.goto(`${instance.url}/src/render.html`);
    await page.waitForFunction(()=>typeof window.renderFrameAt==="function");
    const config=JSON.parse(await fs.readFile(path.join(root,"video.json")));
    const videoFrame=(time)=>page.evaluate(({sequence,config,time})=>window.renderFrameAt(sequence,config,time),{sequence,config,time});
    const frameA=await videoFrame(.5),frameB=await videoFrame(1.2),frameARepeat=await videoFrame(.5);
    assert.notEqual(frameA,frameB,"video source advances by timeline time");
    assert.equal(frameA,frameARepeat,"seeking backwards reproduces the source frame");

    const unlabeled = {
      fps: config.fps, duration_seconds: config.duration_seconds,
      tracks: [{ id: "composition", kind: "video", name: "Scene", visible: true }],
      cues: [{ id: "independent-layers", track_id: "composition", kind: "scene",
        scene: "composition", start_sec: 0, end_sec: config.duration_seconds,
        canvas: { width: config.width, height: config.height }, transform: { x: 10 },
        layers: [{ id: "shape", kind: "rect", width: 200, height: 100, fill: "#f54462" }] }],
    };
    assert.equal((await page.request.post(`${instance.url}/api/timeline`, { data: unlabeled })).status(), 200);
    await page.goto(instance.url);
    await page.waitForFunction(() => window.__editorReady);
    assert.equal(await page.locator("#scene-name").textContent(), "independent-layers");
    assert.ok((await page.locator("#second-summary").textContent()).includes("independent-layers"));
    assert.ok((await page.locator(".second-cell").first().textContent()).includes("independent-layers"));
    await page.locator('.clip[data-id="independent-layers"]').click();
    assert.equal(await page.locator("#cue-title").inputValue(), "");
    assert.equal(await page.locator("#x-value").textContent(), "10 px");
    assert.equal(await page.locator("#scale-value").textContent(), "100%");
    assert.equal(await page.locator("#opacity-value").textContent(), "100%");
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await fs.rm(fixture, { recursive: true, force: true });
  }
});
