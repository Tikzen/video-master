const identifier = /^[a-z0-9][a-z0-9-]{0,79}$/;
const requiredText = (value, label, max = 8000) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} needs nonempty text (maximum ${max}).`);
  return value.trim();
};
const uniqueRows = (rows, label) => {
  if (!Array.isArray(rows) || rows.length > 128) throw new Error(`${label} must be a bounded array.`);
  const ids = rows.map((row) => row?.id);
  if (ids.some((id) => !identifier.test(id || "")) || new Set(ids).size !== ids.length) throw new Error(`${label} needs unique IDs.`);
};
export const SCORE_ANCHORS = {
  1: "Observed problems substantially obstruct the approved goal or viewing.",
  2: "Several evidenced problems distract or confuse.",
  3: "Clear and functional within the observed scope, with specific polish opportunities.",
  4: "Consistent, well-directed expression that supports the approved goal.",
  5: "Exceptionally coherent and purposeful within the observed scope; not a claim of universal taste.",
};
export function qualityDimensions(genre) {
  const weight = (common, overrides = {}) => overrides[genre] ?? common;
  return [
    { id: "composition", label: "构图与焦点", weight: 2, modalities: ["frame"], prompt: "One readable focus; supporting layers do not compete with it." },
    { id: "visual-system", label: "配色与视觉统一", weight: 1, modalities: ["frame"], prompt: "Palette, type and materials support the approved style, not generic photographic beauty." },
    { id: "legibility", label: "信息可读性", weight: weight(2, { mv: 1, report: 3 }), modalities: ["frame"], prompt: "Inspect full-resolution text, units, safe areas and focal competition. Stills do not prove sufficient reading time." },
    { id: "visual-story", label: "视觉事件与叙事", weight: 2, modalities: ["clip"], prompt: "Visible actions/results advance the intended message. Deliberate reading holds and meaningful motif returns are valid." },
    { id: "motion", label: "运动与节奏", weight: weight(2, { mv: 3 }), modalities: ["clip"], playback: true, prompt: "Judge anticipation, easing, impact, settle and camera comfort in playback. More motion is not inherently better." },
    { id: "continuity", label: "切镜与连续性", weight: weight(1, { studio: 2 }), modalities: ["clip"], prompt: "Cuts and returns preserve identity, orientation and causal focus. Inspect both sides of relevant cuts." },
    { id: "audio-visual", label: "声音与画面关系", weight: weight(1, { mv: 3 }), modalities: ["clip", "audio"], prompt: "Listen and inspect actual playback for speech/music relationship and sync. Waveforms or subtitles alone cannot establish listening quality." },
  ];
}
export function normalizeQualitySettings(input, previous = { revision: 0 }) {
  if (!["off", "standard", "deep", "custom"].includes(input.mode)) throw new Error("Choose off, standard, deep or custom.");
  const max = { off: 0, standard: 1, deep: 2 }[input.mode] ?? input.max_rounds;
  if (!Number.isInteger(max) || max < 0 || max > 2) throw new Error("Repair rounds must be an integer from 0 to 2.");
  const focus = input.mode === "custom" ? input.focus ?? "" : "";
  if (typeof focus !== "string" || focus.length > 2000) throw new Error("Custom review focus must be at most 2000 characters.");
  if (input.expected_revision !== previous.revision) throw new Error("Quality choice changed; reload before saving.");
  return { mode: input.mode, max_rounds: max, focus: focus.trim(), revision: previous.revision + 1 };
}
export function validateQualityIntent(intent, duration) {
  if (intent?.schema !== "video-master.quality-intent.v1") throw new Error("Use video-master.quality-intent.v1.");
  requiredText(intent.summary, "Intent summary");
  if (!["mv", "studio", "product", "report", "other"].includes(intent.genre)) throw new Error("Invalid intent genre.");
  uniqueRows(intent.requirements, "Requirements");
  if (!intent.requirements.length) throw new Error("Extract actual approved expectations before reviewing.");
  for (const item of intent.requirements) {
    requiredText(item.text, `${item.id} text`);
    if (!["must", "should", "preference"].includes(item.priority)) throw new Error(`${item.id}: invalid priority.`);
    if (!Number.isInteger(item.weight) || item.weight < 1 || item.weight > 5) throw new Error(`${item.id}: weight must be 1..5.`);
    if (!["frame", "clip", "audio", "data"].includes(item.modality)) throw new Error(`${item.id}: invalid modality.`);
    if (!["user", "approved-plan", "delegated"].includes(item.source?.kind)) throw new Error(`${item.id}: retain decision provenance.`);
    requiredText(item.source.path, `${item.id} source path`, 1000);
    requiredText(item.source.quote, `${item.id} exact source quote`);
    if (item.source.kind === "delegated" && item.priority === "must") throw new Error("Agent-delegated preferences are not user musts.");
    if (item.extent != null && !["sampled", "entire-video", "artifact"].includes(item.extent)) throw new Error(`${item.id}: invalid verification extent.`);
    if (item.start_sec != null || item.end_sec != null) {
      if (!Number.isFinite(item.start_sec) || !Number.isFinite(item.end_sec) || item.start_sec < 0 || item.end_sec <= item.start_sec || item.end_sec > duration) throw new Error(`${item.id}: invalid expectation range.`);
    }
  }
  return intent;
}
const methods = { frame: ["image-view"], clip: ["video-playback", "frame-sequence"], audio: ["audio-listening"], data: ["data-check"] };
const round = (value) => Math.round(value * 100) / 100;
export function evaluateQuality(job, judgement) {
  if (judgement?.schema !== "video-master.quality-judgement.v1" || judgement.run_id !== job.run_id || judgement.job_hash !== job.job_hash) throw new Error("Judgement must bind the exact review job.");
  requiredText(judgement.reviewer, "Reviewer identity", 200);
  uniqueRows(judgement.inspections, "Inspections");
  const evidence = new Map(job.evidence.map((row) => [row.id, row]));
  const inspections = new Map();
  for (const item of judgement.inspections) {
    const observed = evidence.get(item.id);
    if (!observed || !methods[observed.kind]?.includes(item.method)) throw new Error(`${item.id}: inspection method does not match evidence.`);
    requiredText(item.note, `${item.id} observed scope`);
    inspections.set(item.id, item);
  }
  const supported = (ids, modalities, playback = false, range) => {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some((id) => !evidence.has(id) || !inspections.has(id))) throw new Error("Cite distinct, actually inspected evidence IDs.");
    return modalities.every((kind) => ids.some((id) => {
      const row = evidence.get(id);
      if (row.kind !== kind || (playback && kind === "clip" && inspections.get(id).method !== "video-playback")) return false;
      if (!range) return true;
      const start = row.kind === "frame" ? row.time_sec : row.start_sec, end = row.kind === "frame" ? start : row.end_sec;
      return Number.isFinite(start) && start < range.end_sec && end >= range.start_sec;
    }));
  };
  const confidence = (item) => {
    if (!["low", "medium", "high"].includes(item.uncertainty)) throw new Error("Use qualitative uncertainty: low, medium or high.");
    return item.uncertainty;
  };
  const coversRange = (ids, kind, start, end) => {
    const ranges = ids.map((id) => evidence.get(id)).filter((row) => row.kind === kind && Number.isFinite(row.start_sec) && Number.isFinite(row.end_sec))
      .map((row) => [Math.max(start, row.start_sec), Math.min(end, row.end_sec)]).sort((a, b) => a[0] - b[0]);
    let covered = start;
    for (const [a, b] of ranges) { if (a > covered + 1e-6) break; covered = Math.max(covered, b); }
    return covered >= end - 1e-6;
  };
  uniqueRows(judgement.expectations, "Expectation results");
  if (judgement.expectations.length !== job.intent.requirements.length) throw new Error("Review every frozen expectation, including unknowns.");
  const expectations = job.intent.requirements.map((requirement) => {
    const item = judgement.expectations.find((row) => row.id === requirement.id);
    if (!item || !["met", "partial", "missed", "unknown"].includes(item.status)) throw new Error(`${requirement.id}: missing expectation result.`);
    const rationale = requiredText(item.rationale, `${item.id} rationale`);
    const uncertainty = confidence(item);
    const observed = supported(item.evidence_ids, [requirement.modality], requirement.modality === "clip", requirement.start_sec == null ? null : requirement);
    const complete = requirement.extent !== "entire-video" || !["met", "partial"].includes(item.status) ||
      (["clip", "audio"].includes(requirement.modality) && coversRange(item.evidence_ids, requirement.modality, requirement.start_sec ?? 0, requirement.end_sec ?? job.duration_seconds));
    const enough = observed && complete && (uncertainty !== "high" || item.status === "unknown");
    return { ...requirement, status: enough ? item.status : "unknown", rationale, evidence_ids: item.evidence_ids,
      uncertainty, ...(enough ? {} : { abstention: "Required observed evidence, full-scope coverage or certainty is missing." }) };
  });
  uniqueRows(judgement.dimensions, "Dimension results");
  if (judgement.dimensions.length !== job.dimensions.length) throw new Error("Review all dimensions; use null when unsupported.");
  const dimensions = job.dimensions.map((dimension) => {
    const item = judgement.dimensions.find((row) => row.id === dimension.id);
    if (!item || (item.score !== null && (!Number.isInteger(item.score) || item.score < 1 || item.score > 5))) throw new Error(`${dimension.id}: score must be 1..5 or null.`);
    const enough = supported(item.evidence_ids, dimension.modalities, dimension.playback);
    return { ...dimension, score: enough ? item.score : null, rationale: requiredText(item.rationale, `${item.id} rationale`),
      evidence_ids: item.evidence_ids, uncertainty: confidence(item),
      ...(enough && item.score !== null ? {} : { abstention: item.abstention || "Not established by the inspected evidence." }) };
  });
  uniqueRows(judgement.findings, "Findings");
  const findings = judgement.findings.map((item) => {
    if (!["blocking", "high", "medium", "low"].includes(item.severity)) throw new Error("Invalid finding severity.");
    if (!["local", "approval-required"].includes(item.scope)) throw new Error("Declare local fix or approval-required scope.");
    if (!Number.isFinite(item.start_sec) || !Number.isFinite(item.end_sec) || item.start_sec < 0 || item.end_sec <= item.start_sec || item.end_sec > job.duration_seconds) throw new Error("Finding timecode is outside the video.");
    requiredText(item.summary, "Finding summary"); requiredText(item.suggestion, "Actionable fix");
    const requirement = job.intent.requirements.find((row) => row.id === item.expectation_id);
    const dimension = job.dimensions.find((row) => row.id === item.dimension_id);
    if (!requirement && !dimension) throw new Error("Bind each finding to a frozen expectation or rubric dimension.");
    if (requirement && dimension) throw new Error("Bind a finding to exactly one expectation or dimension, not mixed evidence requirements.");
    const modalities = requirement ? [requirement.modality] : dimension.modalities;
    if (!item.evidence_ids?.length || !supported(item.evidence_ids, modalities, dimension?.playback || requirement?.modality === "clip", item)) throw new Error("Findings require relevant timecoded observed evidence.");
    return { ...item, uncertainty: confidence(item) };
  });
  const known = expectations.filter((row) => row.status !== "unknown");
  const knownWeight = known.reduce((sum, row) => sum + row.weight, 0);
  const totalWeight = expectations.reduce((sum, row) => sum + row.weight, 0);
  const score = knownWeight ? round(100 * known.reduce((sum, row) => sum + row.weight * ({ met: 1, partial: .5, missed: 0 }[row.status]), 0) / knownWeight) : null;
  const seen = dimensions.filter((row) => row.score !== null);
  const seenWeight = seen.reduce((sum, row) => sum + row.weight, 0);
  const dimensionWeight = dimensions.reduce((sum, row) => sum + row.weight, 0);
  const aestheticScore = seenWeight ? round(100 * seen.reduce((sum, row) => sum + row.weight * (row.score - 1) / 4, 0) / seenWeight) : null;
  const mustMiss = expectations.some((row) => row.priority === "must" && ["missed", "partial"].includes(row.status));
  const mustUnknown = expectations.some((row) => row.priority === "must" && row.status === "unknown");
  const serious = findings.some((row) => ["blocking", "high"].includes(row.severity));
  const verdict = job.technical.errors.length ? "blocked" : mustMiss || serious ? "needs-revision" : mustUnknown || !seen.length ? "needs-evidence" : "acceptable";
  if (judgement.limitations != null && (!Array.isArray(judgement.limitations) || judgement.limitations.length > 64)) throw new Error("Limitations must be a bounded array.");
  return { schema: "video-master.quality-report.v1", experimental: true, run_id: job.run_id, round: job.round, status: "reviewed",
    reviewer: judgement.reviewer, verdict, technical: job.technical,
    expectation: { score, coverage: round(knownWeight / totalWeight), items: expectations },
    aesthetics: { score: aestheticScore, coverage: round(seenWeight / dimensionWeight), dimensions },
    findings, inspections: judgement.inspections, evidence: job.evidence,
    limitations: [...new Set([...(judgement.limitations || []).map((text) => requiredText(text, "Limitation")),
      "Scores are advisory within inspected evidence, not calibrated audience ratings or full-video acceptance.",
      ...dimensions.filter((row) => row.abstention).map((row) => `${row.label}: ${row.abstention}`)])] };
}
export function qualityRepairPlan(report, remaining) {
  if (report.technical.errors.length) return { action: "stop", reason: "Repair technical defects through normal QA first.", selected_findings: [], remaining_rounds: remaining };
  if (report.findings.some((row) => row.scope === "approval-required" && ["blocking", "high"].includes(row.severity))) return { action: "needs-approval", reason: "A proposed fix changes approved content or constraints.", selected_findings: [], remaining_rounds: remaining };
  const order = { blocking: 0, high: 1, medium: 2, low: 3 };
  const candidates = report.findings.filter((row) => row.scope === "local" && row.uncertainty !== "high" && row.severity !== "low")
    .sort((a, b) => order[a.severity] - order[b.severity] || a.start_sec - b.start_sec).slice(0, 3);
  if (remaining > 0 && candidates.length) return { action: "repair", reason: "One consolidated, evidence-backed local pass; preserve the frozen intent.", selected_findings: candidates.map((row) => row.id), remaining_rounds: remaining };
  if (report.verdict === "needs-evidence") return { action: "needs-evidence", reason: "Inspect missing modalities; do not invent ratings.", selected_findings: [], remaining_rounds: remaining };
  return { action: "stop", reason: remaining === 0 ? "Opted-in repair limit reached." : "No sufficiently supported local fixes. Do not chase small score increases.", selected_findings: [], remaining_rounds: remaining };
}
export function compareQuality(before, after, input, maxRounds) {
  if (input.before_run !== before.run_id || input.after_run !== after.run_id) throw new Error("Bind comparison to the actual before/after runs.");
  if (!Array.isArray(input.target_findings) || !input.target_findings.length || input.target_findings.some((id) => !before.findings.some((row) => row.id === id))) throw new Error("Compare the selected repair targets.");
  requiredText(input.rationale, "Comparison evidence and rationale");
  if (!Array.isArray(input.target_results) || input.target_results.length !== input.target_findings.length ||
      new Set(input.target_results.map((row) => row.finding_id)).size !== input.target_findings.length) throw new Error("Record observed before/after results for every repair target.");
  for (const item of input.target_results) {
    if (!input.target_findings.includes(item.finding_id) || !["fixed", "unchanged", "worse", "unknown"].includes(item.outcome)) throw new Error("Invalid repair target result.");
    requiredText(item.reason, "Target comparison evidence");
    for (const [report, ids] of [[before, item.before_evidence_ids], [after, item.after_evidence_ids]]) {
      if (!Array.isArray(ids) || !ids.length || ids.some((id) => !report.inspections.some((row) => row.id === id))) throw new Error("Compare actually inspected evidence from both runs.");
      const target = before.findings.find((row) => row.id === item.finding_id);
      if (!ids.some((id) => {
        const row = report.evidence.find((evidence) => evidence.id === id);
        const start = row?.kind === "frame" ? row.time_sec : row?.start_sec;
        const end = row?.kind === "frame" ? start : row?.end_sec;
        return Number.isFinite(start) && start < target.end_sec && end >= target.start_sec;
      })) throw new Error("Comparison evidence must overlap the actual repaired interval.");
    }
  }
  if (!Array.isArray(input.checks) || input.checks.length !== 2 || input.checks[0].order !== "AB" || input.checks[1].order !== "BA" ||
      input.checks.some((row) => !["A", "B", "tie", "unknown"].includes(row.preferred))) throw new Error("Compare anonymized A/B in both orders; preferences use stable A/B identifiers.");
  const beforeKnown = before.expectation.items.filter((row) => row.status !== "unknown");
  const rank = { missed: 0, partial: 1, met: 2 };
  const regression = after.technical.errors.length || beforeKnown.some((row) => {
    const next = after.expectation.items.find((item) => item.id === row.id);
    return !next || (row.status !== "unknown" && (next.status === "unknown" || rank[next.status] < rank[row.status]));
  }) || after.findings.some((row) => ["blocking", "high"].includes(row.severity) &&
    !before.findings.some((old) => ["blocking", "high"].includes(old.severity) && old.expectation_id === row.expectation_id &&
      old.dimension_id === row.dimension_id && (row.severity !== "blocking" || old.severity === "blocking") &&
      row.start_sec >= old.start_sec && row.end_sec <= old.end_sec && !input.target_findings.includes(old.id)));
  const preference = input.checks[0].preferred === input.checks[1].preferred ? input.checks[0].preferred : "unknown";
  const accepted = !regression && preference === "B" && input.target_results.every((row) => row.outcome === "fixed");
  return { accepted, decision: regression || preference === "A" ? "restore-before" : accepted ? "keep-after" : "needs-review",
    reason: regression ? "A retained expectation or technical/serious-quality gate regressed." : !accepted && preference !== "A" ? "Order disagreement, unverified repair or no clear improvement." : input.rationale,
    checks: input.checks, target_findings: input.target_findings, target_results: input.target_results, rationale: input.rationale,
    remaining_rounds: Math.max(0, maxRounds - after.round) };
}
