import test from "node:test";
import assert from "node:assert/strict";
import { qualityDimensions, evaluateQuality, qualityRepairPlan, compareQuality,
  normalizeQualitySettings, validateQualityIntent } from "./quality-rubric.mjs";

const intent = () => ({ schema: "video-master.quality-intent.v1", summary: "A quiet, accurate report.", genre: "report",
  requirements: [{ id: "quiet-style", text: "Keep the approved restrained style.", priority: "must", weight: 5, modality: "frame",
    source: { kind: "user", path: "user-intent.md", quote: "quiet" } }] });
const fixture = () => {
  const job = { run_id: "test-run", job_hash: "bound-job", round: 0, duration_seconds: 6, intent: intent(),
    dimensions: qualityDimensions("report"), technical: { errors: [] },
    evidence: [{ id: "frame-1", kind: "frame", time_sec: 1 }, { id: "clip-1", kind: "clip", start_sec: 0, end_sec: 6 }] };
  const judgement = { schema: "video-master.quality-judgement.v1", run_id: job.run_id, job_hash: job.job_hash, reviewer: "test-only",
    inspections: [{ id: "frame-1", method: "image-view", note: "Test frame observed." }],
    expectations: [{ id: "quiet-style", status: "met", rationale: "Restrained in the observed sample.", evidence_ids: ["frame-1"], uncertainty: "low" }],
    dimensions: job.dimensions.map((row) => ({ id: row.id, score: 5, rationale: "Test-only rubric result.", evidence_ids: ["frame-1"], uncertainty: "low" })),
    findings: [], limitations: [] };
  return { job, judgement };
};
test("good-looking but wrong user style cannot pass via a high aesthetic score", () => {
  const { job, judgement } = fixture();
  judgement.expectations[0].status = "missed";
  const report = evaluateQuality(job, judgement);
  assert.equal(report.aesthetics.score, 100);
  assert.equal(report.expectation.score, 0);
  assert.equal(report.verdict, "needs-revision");
});
test("missing temporal/audio observations abstain rather than hallucinate scores", () => {
  const { job, judgement } = fixture(), report = evaluateQuality(job, judgement);
  assert.equal(report.aesthetics.dimensions.find((row) => row.id === "motion").score, null);
  assert.equal(report.aesthetics.dimensions.find((row) => row.id === "audio-visual").score, null);
  assert.ok(report.aesthetics.coverage < 1);
  assert.throws(() => evaluateQuality(job, { ...judgement, inspections: [{ id: "frame-1", method: "audio-listening", note: "No." }] }), /method/);
});
test("only relevant range evidence establishes a scoped expectation/finding", () => {
  const { job, judgement } = fixture();
  job.intent.requirements[0].start_sec = 3; job.intent.requirements[0].end_sec = 6;
  const report = evaluateQuality(job, judgement);
  assert.equal(report.expectation.items[0].status, "unknown");
  assert.equal(report.expectation.score, null);
  assert.equal(report.verdict, "needs-evidence");
  judgement.findings = [{ id: "clutter", expectation_id: "quiet-style", severity: "high", scope: "local",
    start_sec: 4, end_sec: 5, summary: "Clutter", suggestion: "Reduce secondary contrast.", uncertainty: "low", evidence_ids: ["frame-1"] }];
  assert.throws(() => evaluateQuality(job, judgement), /relevant timecoded/);
});
test("global success cannot be inferred from sparse stills or high uncertainty", () => {
  const { job, judgement } = fixture();
  job.intent.requirements[0].extent = "entire-video";
  assert.equal(evaluateQuality(job, judgement).expectation.items[0].status, "unknown");
  judgement.expectations[0].status = "missed";
  assert.equal(evaluateQuality(job, judgement).expectation.items[0].status, "missed", "one counterexample can disprove a global rule");
  job.intent.requirements[0].extent = "sampled"; judgement.expectations[0].uncertainty = "high";
  assert.equal(evaluateQuality(job, judgement).expectation.items[0].status, "unknown");
});
test("intentional holds and returns have no automatic low-motion/repetition penalty", () => {
  const { job, judgement } = fixture();
  judgement.inspections.push({ id: "clip-1", method: "video-playback", note: "Reading hold and purposeful returning chart." });
  for (const row of judgement.dimensions) if (row.id !== "audio-visual") row.evidence_ids.push("clip-1");
  const report = evaluateQuality(job, judgement);
  assert.equal(report.aesthetics.dimensions.find((row) => row.id === "motion").score, 5);
  assert.equal(report.findings.length, 0);
  assert.equal(qualityRepairPlan(report, 2).action, "stop");
});
test("stale jobs, omitted expectations, arbitrary score ranges and fake evidence fail", () => {
  const { job, judgement } = fixture();
  assert.throws(() => evaluateQuality(job, { ...judgement, job_hash: "stale" }), /exact review job/);
  assert.throws(() => evaluateQuality(job, { ...judgement, expectations: [] }), /every frozen/);
  assert.throws(() => evaluateQuality(job, { ...judgement, dimensions: judgement.dimensions.map((row) => ({ ...row, score: 90 })) }), /1..5/);
  assert.throws(() => evaluateQuality(job, { ...judgement, expectations: [{ ...judgement.expectations[0], evidence_ids: ["invented"] }] }), /inspected/);
});
test("repair is bounded, evidence-backed and never authorizes an approved-content change", () => {
  const { job, judgement } = fixture();
  judgement.findings = [{ id: "clutter", dimension_id: "composition", severity: "high", scope: "local",
    start_sec: .5, end_sec: 2, summary: "Focal competition.", suggestion: "Fade supporting layer.", uncertainty: "medium", evidence_ids: ["frame-1"] }];
  const report = evaluateQuality(job, judgement);
  assert.equal(qualityRepairPlan(report, 1).action, "repair");
  assert.equal(qualityRepairPlan(report, 0).action, "stop");
  report.findings[0].scope = "approval-required";
  assert.equal(qualityRepairPlan(report, 2).action, "needs-approval");
  report.findings[0].scope = "local"; report.findings[0].uncertainty = "high";
  assert.equal(qualityRepairPlan(report, 2).action, "stop");
});
test("default-off settings reject stale changes and cap customization at two", () => {
  assert.equal(normalizeQualitySettings({ mode: "off", expected_revision: 0 }).max_rounds, 0);
  assert.equal(normalizeQualitySettings({ mode: "standard", expected_revision: 0 }).max_rounds, 1);
  assert.throws(() => normalizeQualitySettings({ mode: "deep", expected_revision: 9 }), /changed/);
  assert.throws(() => normalizeQualitySettings({ mode: "custom", max_rounds: 3, expected_revision: 0 }), /0 to 2/);
  const value = intent(); value.requirements[0].source.kind = "delegated";
  assert.throws(() => validateQualityIntent(value, 6), /not user musts/);
});
test("before-after prefers proven target fixes, not a tiny aggregate increase", () => {
  const { job, judgement } = fixture();
  judgement.findings = [{ id: "clutter", dimension_id: "composition", severity: "medium", scope: "local", start_sec: 0, end_sec: 2,
    summary: "Clutter", suggestion: "Fade a supporting element.", uncertainty: "low", evidence_ids: ["frame-1"] }];
  const before = evaluateQuality(job, judgement);
  const after = { ...evaluateQuality({ ...job, run_id: "after", round: 1 }, { ...judgement, run_id: "after", findings: [] }), run_id: "after" };
  const comparison = { before_run: before.run_id, after_run: after.run_id, target_findings: ["clutter"], rationale: "The target focal competition is visibly resolved.",
    target_results: [{ finding_id: "clutter", outcome: "fixed", before_evidence_ids: ["frame-1"], after_evidence_ids: ["frame-1"], reason: "Supporting layer no longer competes." }],
    checks: [{ order: "AB", preferred: "B" }, { order: "BA", preferred: "B" }] };
  assert.equal(compareQuality(before, after, comparison, 1).accepted, true);
  comparison.checks[1].preferred = "A";
  assert.equal(compareQuality(before, after, comparison, 1).decision, "needs-review");
  comparison.checks[1].preferred = "B"; comparison.target_results[0].outcome = "unknown";
  assert.equal(compareQuality(before, after, comparison, 1).accepted, false);
  comparison.target_results[0].outcome = "fixed"; after.expectation.items[0].status = "missed";
  assert.equal(compareQuality(before, after, comparison, 1).decision, "restore-before");
});
test("mixed finding targets cannot bypass missing temporal evidence", () => {
  const { job, judgement } = fixture();
  judgement.findings = [{ id: "motion-claim", expectation_id: "quiet-style", dimension_id: "motion", severity: "high", scope: "local",
    start_sec: 0, end_sec: 2, summary: "Camera is uncomfortable.", suggestion: "Reduce orbit.", uncertainty: "low", evidence_ids: ["frame-1"] }];
  assert.throws(() => evaluateQuality(job, judgement), /exactly one/);
});
test("clip time_sec overrides cannot relocate evidence into another interval", () => {
  const { job, judgement } = fixture();
  job.evidence[1] = { id: "clip-1", kind: "clip", start_sec: 4, end_sec: 6, time_sec: 0 };
  job.intent.requirements[0] = { ...job.intent.requirements[0], modality: "clip", start_sec: 0, end_sec: 1 };
  judgement.inspections.push({ id: "clip-1", method: "video-playback", note: "Observed late clip." });
  judgement.expectations[0].evidence_ids = ["clip-1"];
  assert.equal(evaluateQuality(job, judgement).expectation.items[0].status, "unknown");
});
test("an old dimension issue does not hide a new blocking issue elsewhere", () => {
  const { job, judgement } = fixture();
  judgement.findings = [{ id: "old-focus", dimension_id: "composition", severity: "high", scope: "local", start_sec: 0, end_sec: 2,
    summary: "Opening focal problem.", suggestion: "Fade background.", uncertainty: "low", evidence_ids: ["frame-1"] }];
  const before = evaluateQuality(job, judgement);
  const nextJob = { ...job, run_id: "after", round: 1, evidence: [...job.evidence, { id: "late-frame", kind: "frame", time_sec: 4 }] };
  const nextJudgement = { ...judgement, run_id: "after", inspections: [...judgement.inspections, { id: "late-frame", method: "image-view", note: "Observed later problem." }],
    findings: [{ id: "new-focus", dimension_id: "composition", severity: "blocking", scope: "local", start_sec: 3, end_sec: 5,
      summary: "Later content obscured.", suggestion: "Restore layout.", uncertainty: "low", evidence_ids: ["late-frame"] }] };
  const after = evaluateQuality(nextJob, nextJudgement);
  const comparison = { before_run: before.run_id, after_run: after.run_id, target_findings: ["old-focus"],
    target_results: [{ finding_id: "old-focus", outcome: "fixed", before_evidence_ids: ["frame-1"], after_evidence_ids: ["frame-1"], reason: "Opening alone improved." }],
    checks: [{ order: "AB", preferred: "B" }, { order: "BA", preferred: "B" }], rationale: "Do not ignore a later regression." };
  assert.equal(compareQuality(before, after, comparison, 1).decision, "restore-before");
});
