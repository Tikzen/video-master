import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createProjectServer } from "./server.mjs";
import { renderQualityReport, localQualityMedia, qualityTime } from "./quality-ui.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("quality report keeps evidence coverage, unmet user expectations and unsupported aesthetics distinct", () => {
  const rendered = renderQualityReport({
    run_id: "test-run", verdict: "needs-evidence", round: 0,
    expectation: { score: 50, coverage: .5, items: [{ id: "product", text: "<script>unsafe</script>", status: "missed", priority: "must", rationale: "Product operation isn't demonstrated", evidence_ids: ["frame-1"] }] },
    aesthetics: { score: null, coverage: 0, dimensions: [{ id: "rhythm", label: "Rhythm", score: null, abstention: "A frame cannot prove motion quality" }] },
    evidence: [{ id: "frame-1", kind: "frame", time_sec: 4.5, src: "https://example.com/private.png" }],
    findings: [{ id: "operation", start_sec: null, end_sec: null, summary: "Need operational evidence" }],
    limitations: ["No audio listening evidence"]
  });
  assert.ok(rendered.includes("50 / 100"));
  assert.ok(rendered.includes("50%"));
  assert.ok(rendered.includes("未评估"));
  assert.ok(rendered.includes("未满足"));
  assert.ok(rendered.includes("必须保持"));
  assert.ok(rendered.includes("&lt;script&gt;unsafe&lt;/script&gt;"));
  assert.ok(!rendered.includes("<script>"));
  assert.ok(!rendered.includes('src="https:'));
  assert.ok(rendered.includes('data-quality-seek="4.5"'));
  assert.ok(!rendered.includes('data-quality-seek="0"'));
  assert.ok(renderQualityReport({ limitations: ["Partial report"] }).includes("Partial report"));
  assert.ok(renderQualityReport(null).includes("尚无实验性自测记录"));
  assert.ok(renderQualityReport({ status: "awaiting-evaluation" }).includes("尚未完成评测"));
  assert.ok(renderQualityReport({ status: "rejected-restored", comparison: { decision: "restore-before", reason: "Approved style changed", rationale: "Keep the actual baseline" } }).includes("已恢复修改前版本"));
  assert.ok(renderQualityReport({ status: "rejected-and-restored" }).includes("已恢复修改前版本"));
  assert.ok(renderQualityReport({ status: "stopped-by-user-choice" }).includes("原自测轮次已结束"));
  assert.ok(renderQualityReport({ comparison: { decision: "needs-review", reason: "Different evidence scope" } }).includes("Different evidence scope"));
});

test("quality evidence only previews plain local public media and requires known numeric times", () => {
  assert.equal(localQualityMedia("renders/preview/review.png"), "/renders/preview/review.png");
  assert.equal(localQualityMedia("/audio/music/sample.wav"), "/audio/music/sample.wav");
  for (const src of ["https://example.com/a.png", "//example.com/a.png", ".env", "validation/private.png",
    "assets/../private.png", "assets/%2e%2e/private.png", "assets/x%2fy.png", "assets\\private.png",
    "assets/a.svg", "assets/a.png?token=private", "data:image/png,test"]) assert.equal(localQualityMedia(src), "", src);
  assert.equal(qualityTime(64.5), "01:04.50");
  for (const time of [null, undefined, "", "4", -1, Infinity, NaN]) assert.equal(qualityTime(time), "");
});

test("quality round is default-off, user-selected, revision-bound and separate from creative rounds", { timeout: 120000 }, async () => {
  await fs.mkdir(path.join(root, ".editor"), { recursive: true });
  const fixture = await fs.mkdtemp(path.join(root, ".editor", "quality-ui-"));
  let server, browser;
  try {
    for (const folder of ["src", "assets"]) await fs.cp(path.join(root, folder), path.join(fixture, folder), { recursive: true });
    for (const file of ["video.json", "timeline.json", "package.json"]) await fs.copyFile(path.join(root, file), path.join(fixture, file));
    await fs.symlink(path.join(root, "node_modules"), path.join(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const instance = await createProjectServer(fixture); server = instance.server;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [], selections = [], externalRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (!request.url().startsWith(instance.url)) externalRequests.push(request.url()); });
    const state = { settings: { mode: "off", max_rounds: 0, focus: "", revision: 0 }, intent: null, runs: [], latest: null };
    // The UI contract fixture deliberately contains no evaluator or paid service.
    await page.route("**/api/quality-review", (route) => route.fulfill({ json: structuredClone(state) }));
    await page.route("**/api/quality-choice", async (route) => {
      const payload = route.request().postDataJSON(); selections.push(payload);
      if (payload.expected_revision !== state.settings.revision) {
        await route.fulfill({ status: 409, json: { error: "自测选择已被修改，请重新载入后确认。" } }); return;
      }
      state.settings = { mode: payload.mode, max_rounds: payload.mode === "custom" ? payload.max_rounds : { off: 0, standard: 1, deep: 2 }[payload.mode],
        focus: payload.mode === "custom" ? payload.focus : "", revision: state.settings.revision + 1,
        selected_at: "2026-10-13T00:00:00Z", source: "browser-user-submission" };
      await route.fulfill({ json: { settings: state.settings } });
    });
    await page.goto(`${instance.url}/create?panel=quality`);
    await page.waitForSelector("#quality-form"); await page.waitForFunction(() => window.__plannerReady);
    assert.ok(await page.locator("#stage-title").textContent().then((text) => text.includes("实验性")));
    assert.ok(await page.locator('[name=quality_mode][value=off]').isChecked());
    assert.equal(await page.locator("[name=quality_mode]").count(), 4);
    assert.equal(await page.locator("[data-quality-custom]").isVisible(), false);
    assert.equal(await page.locator("#quality-form textarea:visible").count(), 0);
    assert.equal(selections.length, 0);
    await page.locator('[name=quality_mode][value=standard]').check();
    assert.equal(selections.length, 0, "Choosing a radio is not a receipt");
    await page.locator("#quality-form [type=submit]").click();
    await page.waitForFunction(() => document.querySelector("[data-quality-choice-status]").textContent.includes("等待当前 Agent"));
    assert.deepEqual(selections[0], { mode: "standard", expected_revision: 0 });
    assert.equal(state.settings.source, "browser-user-submission");
    assert.equal(new URL(page.url()).searchParams.get("panel"), "quality", "Save never opens the next round");
    await page.locator('[name=quality_mode][value=custom]').check();
    assert.ok(await page.locator("[data-quality-custom]").isVisible());
    await page.locator("[name=quality_rounds]").selectOption("0");
    await page.locator("[name=quality_focus]").fill("Preserve restrained pacing; don't add visual noise");
    await page.locator("#quality-form [type=submit]").click();
    await page.waitForFunction(() => !document.querySelector("#quality-form [type=submit]").disabled);
    assert.deepEqual(selections[1], { mode: "custom", expected_revision: 1, max_rounds: 0, focus: "Preserve restrained pacing; don't add visual noise" });
    state.settings.revision++;
    await page.locator('[name=quality_mode][value=deep]').check();
    await page.locator("#quality-form [type=submit]").click();
    await page.waitForFunction(() => document.querySelector("[data-quality-choice-status]").textContent.includes("重新载入"));
    assert.deepEqual(selections[2], { mode: "deep", expected_revision: 2 });
    assert.equal(state.settings.mode, "custom", "Stale choices do not overwrite current settings");
    await page.reload(); await page.waitForSelector("#quality-form");
    await page.locator('[name=quality_mode][value=off]').check();
    await page.locator("#quality-form [type=submit]").click();
    await page.waitForFunction(() => document.querySelector("[data-quality-choice-status]").textContent.includes("常规检查保持不变"));
    state.intent = { summary: "<img src=x onerror=alert(1)>", requirements: [{ id: "intent", text: "Show the product operation" }] };
    state.latest = {
      run_id: "ui-evidence-fixture", round: 0, verdict: "needs-evidence",
      expectation: { score: 50, coverage: .5, items: [{ id: "intent", text: "Show the product operation", status: "partial", rationale: "Only a title is visible", evidence_ids: ["frame"] }] },
      aesthetics: { score: null, coverage: 0, dimensions: [{ id: "motion", label: "Motion hierarchy", score: null, abstention: "Playback not available" }] },
      findings: [{ id: "focus", severity: "medium", start_sec: 2, end_sec: 3, summary: "Need visible product operation", suggestion: "Keep the approved style; replace this placeholder with actual operation" }],
      evidence: [{ id: "frame", kind: "frame", time_sec: 2, src: "https://example.com/private.png", label: "External source not shared" }],
      limitations: ["No continuous playback inspected"], plan: { action: "needs-evidence", reason: "Render an operational clip before scoring", remaining_rounds: 0 }
    };
    await page.waitForSelector("[data-quality-report]");
    assert.equal(await page.locator(".quality-intent img").count(), 0, "Intent text is escaped");
    assert.equal(await page.locator(".quality-evidence img").count(), 0, "External evidence isn't fetched");
    assert.ok(await page.locator(".quality-score").textContent().then((text) => text.includes("未评估")));
    for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844], ["small", 320, 700]]) {
      await page.setViewportSize({ width, height });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no overflow`);
      await fs.mkdir(path.join(root, "validation"), { recursive: true });
      await page.screenshot({ path: path.join(root, `validation/quality-${name}.png`), fullPage: true });
    }
    const workspace = await page.request.get(`${instance.url}/api/workspace`).then((response) => response.json());
    await page.locator('[data-quality-seek="2"]').first().click();
    await page.waitForURL(instance.url + "/"); await page.waitForFunction(() => window.__editorReady);
    const sought = await page.request.get(`${instance.url}/api/workspace`).then((response) => response.json());
    assert.equal(sought.view.time, 2);
    assert.equal(sought.view.playing, false);
    assert.ok(sought.revision >= workspace.revision);
    assert.equal(await page.locator('a[href="/create?panel=quality"]').count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Small-screen workbench doesn't overflow after adding the review link");
    await page.goto(`${instance.url}/create?round=stage1`); await page.waitForFunction(() => window.__plannerReady);
    assert.equal(await page.locator("#quality-form").count(), 0, "Quality choices don't expand the first creative round");
    assert.equal(state.settings.mode, "off");
    await page.locator('[name=mode][value=one_sentence]').check();
    await page.locator("#direction-form [type=submit]").click();
    await page.waitForFunction(() => !document.querySelector("#direction-form"));
    await page.unroute("**/api/quality-review");
    await page.unroute("**/api/quality-choice");
    const actualDefault = await page.request.get(`${instance.url}/api/quality-review`).then((response) => response.json());
    assert.equal(actualDefault.settings.mode, "off", "One-sentence delegation never enables this enhancement");
    assert.equal(actualDefault.settings.revision, 0);
    assert.equal(actualDefault.experimental, true);
    await page.goto(`${instance.url}/create?panel=quality`); await page.waitForSelector("#quality-form");
    assert.ok(await page.locator('[name=quality_mode][value=off]').isChecked());
    await page.locator('[name=quality_mode][value=standard]').check();
    await page.locator("#quality-form [type=submit]").click();
    await page.waitForFunction(() => document.querySelector("[data-quality-choice-status]").textContent.includes("等待当前 Agent"));
    const actualSaved = await page.request.get(`${instance.url}/api/quality-review`).then((response) => response.json());
    assert.equal(actualSaved.settings.mode, "standard");
    assert.equal(actualSaved.settings.max_rounds, 1);
    assert.equal(actualSaved.settings.source, "browser-user-submission");
    assert.equal(actualSaved.settings.revision, 1);
    assert.equal(actualSaved.latest, null, "Saving a choice doesn't start evaluation");
    assert.deepEqual(actualSaved.runs, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); if (server) await new Promise((resolve) => server.close(resolve));
    assert.ok(path.resolve(fixture).startsWith(path.resolve(root, ".editor") + path.sep));
    await fs.rm(fixture, { recursive: true, force: true });
  }
});
