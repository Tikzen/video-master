import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { qualityStatus, configureQuality, setQualityIntent, prepareQualityReview, submitQualityReview,
  beginQualityRepair, submitQualityComparison, restoreQualityBaseline, addQualityEvidence } from "./quality-review.mjs";
import { createProjectServer } from "./server.mjs";

const starter = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vm-quality-"));
  for (const folder of ["src", "assets"]) await fs.cp(path.join(starter, folder), path.join(root, folder), { recursive: true });
  for (const name of ["package.json", "video.json"]) await fs.copyFile(path.join(starter, name), path.join(root, name));
  await fs.symlink(path.join(starter, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const project = { ...JSON.parse(await fs.readFile(path.join(root, "video.json"), "utf8")), width: 640, height: 360, duration_seconds: 3 };
  await fs.writeFile(path.join(root, "video.json"), JSON.stringify(project));
  await fs.writeFile(path.join(root, "timeline.json"), JSON.stringify({ schema: "video-master.timeline.v1", duration_seconds: 3, fps: project.fps,
    tracks: [{ id: "scenes", kind: "video", name: "Scenes", visible: true, muted: false }],
    cues: [{ id: "shot", track_id: "scenes", kind: "scene", scene: "product_hero", start_sec: 0, end_sec: 3, word: "QUALITY" }] }));
  await fs.writeFile(path.join(root, "user-intent.md"), "Test-only user decision: keep the product recognizable.\n");
  const intent = { schema: "video-master.quality-intent.v1", summary: "Test product clarity.", genre: "product",
    requirements: [{ id: "identity", text: "Keep the product recognizable.", priority: "must", weight: 5, modality: "frame",
      source: { kind: "user", path: "user-intent.md", quote: "keep the product recognizable." } }] };
  return { root, intent };
}
async function dispose(root) {
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep), "Only remove isolated temp fixture");
  await fs.rm(root, { recursive: true, force: true });
}
async function judged(root, prepared, finding = true) {
  const job = JSON.parse(await fs.readFile(path.join(root, prepared.job), "utf8"));
  const frame = job.evidence.find((row) => row.time_sec > 0);
  return { schema: "video-master.quality-judgement.v1", run_id: job.run_id, job_hash: job.job_hash, reviewer: "test-only mocked observation, not an actual taste judge",
    inspections: [{ id: frame.id, method: "image-view", note: "Test evidence contract." }],
    expectations: [{ id: "identity", status: "met", rationale: "Test identity retained.", evidence_ids: [frame.id], uncertainty: "low" }],
    dimensions: job.dimensions.map((row) => ({ id: row.id, score: 3, rationale: "Test-only supplied judgement.", evidence_ids: [frame.id], uncertainty: "low" })),
    findings: finding ? [{ id: "focal", dimension_id: "composition", start_sec: 0, end_sec: 3, severity: "medium", scope: "local",
      summary: "Test-only focal issue.", suggestion: "Change a supporting text cue.", evidence_ids: [frame.id], uncertainty: "low" }] : [],
    limitations: ["Mock judgement verifies state/evidence behavior only."] };
}
test("quality defaults off, requires source-traceable explicit choice and preserves technical QA", async () => {
  const { root, intent } = await fixture();
  try {
    assert.equal((await qualityStatus(root)).settings.mode, "off");
    await assert.rejects(() => prepareQualityReview(root), /is off/);
    await assert.rejects(() => configureQuality(root, { mode: "deep", expected_revision: 0 }, "agent-recorded-chat"), /actual explicit user/);
    const wrong = structuredClone(intent); wrong.requirements[0].source.quote = "invented approval";
    await assert.rejects(() => setQualityIntent(root, wrong), /quote does not occur/);
    await setQualityIntent(root, intent);
    await configureQuality(root, { mode: "standard", expected_revision: 0, decision_evidence: { source: "chat-user-instruction", text: "Test-only: enable one repair round." } }, "agent-recorded-chat");
    assert.equal((await qualityStatus(root)).settings.max_rounds, 1);
    assert.equal((await qualityStatus(root)).settings.experimental, true);
  } finally { await dispose(root); }
});
test("real renderer evidence, bounded repairs, frozen intent, stale-report guards and reversible rejected changes", { timeout: 120000 }, async () => {
  const { root, intent } = await fixture();
  try {
    await setQualityIntent(root, intent);
    await configureQuality(root, { mode: "standard", expected_revision: 0 });
    const first = await prepareQualityReview(root);
    assert.ok(first.evidence.length >= 3);
    for (const row of first.evidence) assert.ok((await fs.stat(path.join(root, row.src))).size > 100);
    const before = await submitQualityReview(root, await judged(root, first));
    assert.equal(before.plan.action, "repair");
    const original = await fs.readFile(path.join(root, "timeline.json"), "utf8");
    await assert.rejects(() => setQualityIntent(root, intent), /frozen/);
    await beginQualityRepair(root, { run_id: first.run_id });
    const next = JSON.parse(original); next.cues[0].word = "REVISED";
    await fs.writeFile(path.join(root, "timeline.json"), JSON.stringify(next));
    const second = await prepareQualityReview(root);
    assert.equal(second.round, 1);
    const secondJudgement = await judged(root, second, false);
    await fs.writeFile(path.join(root, "timeline.json"), JSON.stringify({ ...next, cues: next.cues.map((row) => ({ ...row, word: "USER EDIT" })) }));
    await assert.rejects(() => submitQualityReview(root, secondJudgement), /Stale review/);
    await fs.writeFile(path.join(root, "timeline.json"), JSON.stringify(next));
    const after = await submitQualityReview(root, secondJudgement);
    assert.equal(after.plan.remaining_rounds, 0);
    const compare = { before_run: first.run_id, after_run: second.run_id, target_findings: ["focal"],
      target_results: [{ finding_id: "focal", outcome: "fixed", before_evidence_ids: before.inspections.map((row) => row.id),
        after_evidence_ids: after.inspections.map((row) => row.id), reason: "Test-only comparison." }],
      checks: [{ order: "AB", preferred: "B" }, { order: "BA", preferred: "A" }], rationale: "Test swapped-order disagreement." };
    assert.equal((await submitQualityComparison(root, compare)).accepted, false);
    await restoreQualityBaseline(root, { run_id: second.run_id });
    assert.equal(await fs.readFile(path.join(root, "timeline.json"), "utf8"), original);
    assert.equal((await qualityStatus(root)).latest.status, "rejected-and-restored");
    await assert.rejects(() => prepareQualityReview(root), /fresh user choice/);
  } finally { await dispose(root); }
});
test("changing the user's quality choice stops the active old budget", { timeout: 120000 }, async () => {
  const { root, intent } = await fixture();
  try {
    await setQualityIntent(root, intent); await configureQuality(root, { mode: "deep", expected_revision: 0 });
    const first = await prepareQualityReview(root);
    await submitQualityReview(root, await judged(root, first));
    await configureQuality(root, { mode: "custom", max_rounds: 0, focus: "", expected_revision: 1 });
    assert.equal((await qualityStatus(root)).session.status, "stopped");
    await assert.rejects(() => beginQualityRepair(root, { run_id: first.run_id }), /current reviewed/);
    const newRun = await prepareQualityReview(root);
    const report = await submitQualityReview(root, await judged(root, newRun));
    assert.equal(report.plan.remaining_rounds, 0); assert.equal(report.plan.action, "stop");
  } finally { await dispose(root); }
});
test("missing evidence can be supplemented under the same opt-in without a repair round or invented audio score", { timeout: 120000 }, async () => {
  const { root, intent } = await fixture();
  try {
    intent.requirements[0].modality = "data";
    await setQualityIntent(root, intent); await configureQuality(root, { mode: "standard", expected_revision: 0 });
    const first = await prepareQualityReview(root);
    const initial = await judged(root, first, false);
    const report = await submitQualityReview(root, initial);
    assert.equal(report.plan.action, "needs-evidence");
    assert.equal((await qualityStatus(root)).session.status, "needs-evidence");
    await fs.mkdir(path.join(root, "validation"), { recursive: true });
    await fs.writeFile(path.join(root, "validation", "identity-check.json"), JSON.stringify({ test_only: true, expected: "identity", observed: "identity" }));
    const supplement = await addQualityEvidence(root, { run_id: first.run_id,
      items: [{ id: "measured", kind: "data", src: "validation/identity-check.json", start_sec: 0, end_sec: 3, label: "Test-only measured identity." }] });
    const nextJob = JSON.parse(await fs.readFile(path.join(root, supplement.job), "utf8"));
    assert.equal(nextJob.round, 0);
    const final = await judged(root, supplement, false);
    final.inspections.push({ id: "measured", method: "data-check", note: "Test-only fixture equality inspected." });
    final.expectations[0].evidence_ids = ["measured"];
    const finalReport = await submitQualityReview(root, final);
    assert.equal(finalReport.expectation.items[0].status, "met");
    assert.equal(finalReport.aesthetics.dimensions.find((row) => row.id === "audio-visual").score, null);
    assert.equal((await qualityStatus(root)).settings.revision, 1);
    assert.equal((await qualityStatus(root)).session.round, 0);
  } finally { await dispose(root); }
});
test("repairs cannot silently change fps, duration or the approved source text", { timeout: 120000 }, async () => {
  const { root, intent } = await fixture();
  try {
    await setQualityIntent(root, intent); await configureQuality(root, { mode: "standard", expected_revision: 0 });
    const first = await prepareQualityReview(root);
    await submitQualityReview(root, await judged(root, first));
    await beginQualityRepair(root, { run_id: first.run_id });
    const original = await fs.readFile(path.join(root, "video.json"), "utf8"), project = JSON.parse(original);
    await fs.writeFile(path.join(root, "video.json"), JSON.stringify({ ...project, width: 1280, height: 720 }));
    await assert.rejects(() => prepareQualityReview(root), /output contract changed/);
    await fs.writeFile(path.join(root, "video.json"), original);
    await fs.appendFile(path.join(root, "user-intent.md"), "A new user constraint.\n");
    await assert.rejects(() => prepareQualityReview(root), /Approved source\/constraints changed/);
  } finally { await dispose(root); }
});
test("metadata paths reject a review junction outside the project", async () => {
  const { root } = await fixture(), external = await fs.mkdtemp(path.join(os.tmpdir(), "vm-quality-external-"));
  try {
    await fs.symlink(external, path.join(root, "review"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(() => configureQuality(root, { mode: "standard", expected_revision: 0 }), /outside the project/);
    await assert.rejects(() => fs.access(path.join(external, "quality", "settings.json")), /ENOENT/);
  } finally { await dispose(root); await dispose(external); }
});
test("HTTP quality selection is persisted, revision-bound, loopback guarded and read-only protected", async () => {
  const { root } = await fixture(); let server;
  try {
    const instance = await createProjectServer(root); server = instance.server;
    const request = async (route, data, headers = {}) => {
      const response = await fetch(instance.url + route, data === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data) });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await request("/api/quality-review")).body.settings.mode, "off");
    assert.equal((await request("/api/quality-prepare", {})).status, 403);
    assert.equal((await request("/api/quality-settings", { mode: "deep", expected_revision: 0 })).status, 400);
    assert.equal((await request("/api/quality-choice", { mode: "standard", expected_revision: 0 })).status, 200);
    assert.equal((await request("/api/quality-choice", { mode: "off", expected_revision: 0 })).status, 400);
    assert.equal((await request("/api/quality-choice", { mode: "off", expected_revision: 1 }, { Origin: "https://untrusted.example" })).status, 403);
    assert.equal((await request("/api/quality-review")).body.settings.source, "browser-user-submission");
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); server = null;
    const readOnly = await createProjectServer(root, 0, true); server = readOnly.server;
    const reply = await fetch(readOnly.url + "/api/quality-choice", { method: "POST", body: "{}" });
    assert.equal(reply.status, 403);
  } finally { if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } await dispose(root); }
});
