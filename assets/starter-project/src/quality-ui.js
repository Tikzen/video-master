const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

const modeLabels = { off: "不开启", standard: "标准自测", deep: "加强自测", custom: "自定义" };
const verdictLabels = {
  "needs-revision": "建议返工", "needs-evidence": "证据待补充",
  acceptable: "所见范围内可接受", blocked: "评测受阻"
};
const requirementLabels = { met: "已满足", partial: "部分满足", missed: "未满足", unknown: "待验证" };
const priorityLabels = { must: "必须保持", should: "应当满足", preference: "偏好", preferences: "偏好" };
const planLabels = { repair: "建议局部返工", stop: "结束本轮自测", "needs-evidence": "补充证据", "needs-approval": "需要用户决定" };
const statusLabels = { "awaiting-evaluation": "证据已准备，尚未完成评测", "awaiting-comparison": "返工已评测，等待前后对照", "rejected-restored": "返工结果未通过，已恢复修改前版本", "rejected-and-restored": "返工结果未通过，已恢复修改前版本", "stopped-by-user-choice": "用户已更改选择，原自测轮次已结束", "restore-pending": "返工结果未通过，等待恢复修改前版本", reviewed: "本轮评测已完成", completed: "本轮自测已结束" };
const comparisonLabels = { "keep-after": "保留本轮返工", "restore-before": "恢复修改前版本", "needs-review": "前后对照待确认" };

export function qualityTime(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "";
  const time = value;
  const minutes = Math.floor(time / 60), seconds = time % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
}

export function localQualityMedia(src) {
  if (typeof src !== "string" || !src || /[%\\?#\u0000-\u001f]/.test(src)) return "";
  const value = src.replace(/^\//, "");
  if (!/^(assets|renders|delivery|audio)\//.test(value)) return "";
  if (value.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) return "";
  if (!/\.(png|jpg|jpeg|webp|mp4|webm|wav|mp3|m4a|ogg)$/i.test(value)) return "";
  return `/${value}`;
}

const list = (value) => Array.isArray(value) ? value : [];
const note = (value) => value == null ? "" : typeof value === "string" ? value : typeof value === "object" ? value.reason || value.summary || "" : String(value);
const uncertainty = (value) => ({ low: "低", medium: "中", high: "高" }[value] || note(value));
const score = (value, scale) => Number.isFinite(value) ? `${value.toFixed(Number.isInteger(value) ? 0 : 1)} / ${scale}` : "未评估";
const coverage = (value) => Number.isFinite(value) && value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : "未知";

function evidenceLinks(ids, evidence) {
  return list(ids).map((id) => {
    const item = evidence.find((entry) => entry.id === id);
    const time = item?.time_sec ?? item?.start_sec;
    return qualityTime(time) ? `<a class="quality-evidence-link" href="/" data-quality-seek="${Number(time)}" title="在工作台定位此证据"><i data-lucide="scan-search"></i>${escape(qualityTime(time))}</a>` : `<span class="quality-evidence-id">${escape(id)}</span>`;
  }).join("");
}

function media(item) {
  if (item.kind === "data") return "";
  const src = localQualityMedia(item.src);
  if (!src) return "";
  if (/\.(mp4|webm)$/i.test(src)) return `<video src="${escape(src)}" controls preload="metadata" aria-label="${escape(item.label || "评测片段")}"></video>`;
  if (/\.(wav|mp3|m4a|ogg)$/i.test(src)) return `<audio src="${escape(src)}" controls preload="metadata" aria-label="${escape(item.label || "评测音频")}"></audio>`;
  return `<img src="${escape(src)}" alt="${escape(item.label || "评测画面")}" loading="lazy"/>`;
}

export function renderQualityReport(value) {
  const report = value?.report || value;
  if (!report || typeof report !== "object") return `<section class="band quality-empty"><h2>尚无实验性自测记录</h2><p class="confirmation-note">已保存的选择由当前 Agent 执行；页面不会自行启动模型。</p></section>`;
  const expectation = report.expectation || {}, aesthetics = report.aesthetics || {}, evidence = list(report.evidence);
  const verdict = verdictLabels[report.verdict] || report.verdict || "评测结果待确认";
  const plan = report.plan || {};
  return `<section class="band quality-report" data-quality-report>
    <div class="quality-report-heading"><h2>本轮实验性自测</h2><span class="quality-verdict" data-verdict="${escape(report.verdict || "unknown")}">${escape(verdict)}</span></div>
    <p class="confirmation-note">${report.run_id ? `记录 ${escape(report.run_id)}` : "当前记录"}${Number.isFinite(report.round) ? ` · 第 ${report.round} 轮` : ""}</p>
    ${report.status ? `<p class="quality-run-status">${escape(statusLabels[report.status] || report.status)}</p>` : ""}
    <div class="quality-metrics">
      <div><h3>用户期望符合程度</h3><dl><dt>符合指数</dt><dd>${score(expectation.score, 100)}</dd><dt>证据覆盖</dt><dd>${coverage(expectation.coverage)}</dd></dl></div>
      <div><h3>表达质量（所见范围）</h3><dl><dt>建议质量指数</dt><dd>${score(aesthetics.score, 100)}</dd><dt>证据覆盖</dt><dd>${coverage(aesthetics.coverage)}</dd></dl></div>
    </div>
    <p class="confirmation-note">指数是辅助判断，不是专业艺术保证。缺少证据不等于低分，也不代表已满足。</p>
    <section class="quality-section"><h3>与用户目标核对</h3>${list(expectation.items).length ? `<ul class="quality-items">${expectation.items.map((item) => `<li>
      <div class="quality-item-heading"><strong>${escape(item.text || item.label || item.id)}</strong><span class="quality-state" data-state="${escape(item.status || "unknown")}">${escape(requirementLabels[item.status] || item.status || "待验证")}</span></div>
      ${item.priority ? `<small>${escape(priorityLabels[item.priority] || item.priority)}</small>` : ""}
      ${item.rationale ? `<p>${escape(item.rationale)}</p>` : ""}
      ${note(item.uncertainty) ? `<p class="quality-uncertainty">不确定度：${escape(uncertainty(item.uncertainty))}</p>` : ""}
      <div class="quality-evidence-links">${evidenceLinks(item.evidence_ids, evidence)}</div>
    </li>`).join("")}</ul>` : `<p class="confirmation-note">尚无可核对的目标明细。</p>`}</section>
    <section class="quality-section"><h3>表达质量维度</h3>${list(aesthetics.dimensions).length ? `<ul class="quality-items">${aesthetics.dimensions.map((item) => `<li>
      <div class="quality-item-heading"><strong>${escape(item.label || item.id)}</strong><span class="quality-score">${score(item.abstention ? null : item.score, 5)}</span></div>
      ${item.rationale ? `<p>${escape(item.rationale)}</p>` : ""}
      ${item.abstention ? `<p class="quality-uncertainty">未评估：${escape(note(item.abstention) || "当前证据不足")}</p>` : ""}
      ${note(item.uncertainty) ? `<p class="quality-uncertainty">不确定度：${escape(uncertainty(item.uncertainty))}</p>` : ""}
      <div class="quality-evidence-links">${evidenceLinks(item.evidence_ids, evidence)}</div>
    </li>`).join("")}</ul>` : `<p class="confirmation-note">尚无可评估的画面或运动维度。</p>`}</section>
    ${list(report.findings).length ? `<section class="quality-section"><h3>问题与局部修改建议</h3><ul class="quality-items quality-findings">${report.findings.map((finding) => `<li>
      <div class="quality-item-heading"><strong>${escape(finding.summary || finding.id)}</strong><small>${escape({blocking: "阻断", critical: "阻断", high: "高优先级", medium: "中优先级", low: "低优先级"}[finding.severity] || finding.severity || "")}</small></div>
      ${qualityTime(finding.start_sec) ? `<a class="quality-evidence-link" href="/" data-quality-seek="${Number(finding.start_sec)}" title="在工作台定位问题"><i data-lucide="scan-search"></i>${qualityTime(finding.start_sec)}${qualityTime(finding.end_sec) ? `–${qualityTime(finding.end_sec)}` : ""}</a>` : ""}
      ${finding.suggestion ? `<p>${escape(finding.suggestion)}</p>` : ""}
      ${note(finding.uncertainty) ? `<p class="quality-uncertainty">不确定度：${escape(uncertainty(finding.uncertainty))}</p>` : ""}
      <div class="quality-evidence-links">${evidenceLinks(finding.evidence_ids, evidence)}</div>
    </li>`).join("")}</ul></section>` : ""}
    ${plan.action ? `<section class="quality-section"><h3>${escape(planLabels[plan.action] || plan.action)}</h3>${plan.reason ? `<p>${escape(plan.reason)}</p>` : ""}${Number.isFinite(plan.remaining_rounds) ? `<p class="confirmation-note">剩余返工上限：${plan.remaining_rounds} 轮</p>` : ""}</section>` : ""}
    ${report.comparison ? `<section class="quality-section"><h3>与上轮对照${report.comparison.decision ? ` · ${escape(comparisonLabels[report.comparison.decision] || report.comparison.decision)}` : ""}</h3>${report.comparison.reason || report.comparison.summary ? `<p>${escape(report.comparison.reason || report.comparison.summary)}</p>` : ""}${report.comparison.rationale ? `<p>${escape(report.comparison.rationale)}</p>` : ""}</section>` : ""}
    ${evidence.length ? `<details class="quality-evidence"><summary>评测证据 · ${evidence.length} 项</summary><div class="quality-evidence-grid">${evidence.map((item) => `<figure><figcaption><strong>${escape(item.label || item.id)}</strong>${evidenceLinks([item.id], evidence)}</figcaption>${media(item)}${!localQualityMedia(item.src) || item.kind === "data" ? `<p class="confirmation-note">仅记录证据引用，未公开原文件。</p>` : ""}</figure>`).join("")}</div></details>` : ""}
    ${list(report.limitations).length ? `<section class="quality-section"><h3>本轮限制</h3><ul class="quality-limitations">${report.limitations.map((item) => `<li>${escape(note(item))}</li>`).join("")}</ul></section>` : ""}
  </section>`;
}

function renderIntent(intent) {
  if (!intent) return "";
  const requirements = list(intent.requirements);
  return `<details class="quality-intent"><summary>本轮用户目标依据</summary>${intent.summary ? `<p>${escape(intent.summary)}</p>` : ""}${requirements.length ? `<ul class="quality-limitations">${requirements.map((item) => `<li>${escape(typeof item === "string" ? item : item.text || item.label || item.id)}</li>`).join("")}</ul>` : ""}</details>`;
}

export async function mountQualityUI(target, { api, touched = () => {}, saved = () => {} }) {
  const snapshot = await api("quality-review");
  if (!target.isConnected) return;
  let settings = snapshot.settings || { mode: "off", max_rounds: 0, revision: 0 }, dirty = false;
  const selected = Object.hasOwn(modeLabels, settings.mode) ? settings.mode : "off";
  target.innerHTML = `<form id="quality-form" novalidate>
    <section class="band"><fieldset class="choice-field"><legend>美学自测与返工（实验性）<small>可选增强</small></legend>
      <div class="choice-options quality-options">${[
        ["off", "不开启", "完成常规画面、音频和成片检查，不增加美学返工。"],
        ["standard", "标准自测", "核对用户期望与表达质量，最多返工 1 轮。"],
        ["deep", "加强自测", "增加复查与前后对照，最多返工 2 轮。"]
      ].map(([value, label, description]) => `<label><input type="radio" name="quality_mode" value="${value}" ${selected === value ? "checked" : ""}/><span><strong>${label}</strong><small>${description}</small></span></label>`).join("")}
      <label class="custom-choice"><input type="radio" name="quality_mode" value="custom" ${selected === "custom" ? "checked" : ""}/><span>自定义</span></label></div></fieldset>
      <div data-quality-custom hidden><div class="field-grid">
        <label class="field"><span>最多返工轮数</span><select name="quality_rounds">${[0, 1, 2].map((value) => `<option value="${value}" ${settings.max_rounds === value ? "selected" : ""}>${value === 0 ? "仅评测，不返工" : `${value} 轮`}</option>`).join("")}</select></label>
        <label class="field"><span>重点关注</span><textarea name="quality_focus" rows="2" maxlength="2000" placeholder="例如：保留克制风格，优先检查产品操作是否清楚">${escape(settings.focus || "")}</textarea></label>
      </div></div>
      <div class="quality-warning"><i data-lucide="clock-3"></i><p>实验性功能，默认关闭。开启后会增加采样、片段渲染与评测时间，耗时取决于视频和可用工具。仅在已确认的内容与风格内返工，不保证专业艺术效果；不包含付费调用或向外部服务上传素材的授权。</p></div>
      <p class="confirmation-note">更改并保存选择会结束当前自测轮次。</p>
      <div class="submit-row"><span data-quality-choice-status role="status">${settings.selected_at ? `已保存：${escape(modeLabels[selected])}` : "默认不开启"}</span><button class="button primary" type="submit"><i data-lucide="check"></i>保存自测选择</button></div>
    </section></form>
    ${renderIntent(snapshot.intent)}
    <div data-quality-result>${renderQualityReport(snapshot.latest)}</div>`;
  const form = target.querySelector("#quality-form"), el = (selector) => form.querySelector(selector);
  function update() {
    el("[data-quality-custom]").hidden = el("[name=quality_mode]:checked")?.value !== "custom";
  }
  form.addEventListener("input", () => { dirty = true; touched(); update(); });
  form.addEventListener("change", () => { dirty = true; touched(); update(); });
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = el("[type=submit]");
    if (button.disabled) return;
    button.disabled = true;
    try {
      const mode = el("[name=quality_mode]:checked").value;
      const payload = { mode, expected_revision: settings.revision };
      if (mode === "custom") {
        payload.max_rounds = Number(el("[name=quality_rounds]").value);
        payload.focus = el("[name=quality_focus]").value.trim();
      }
      const result = await api("quality-choice", payload);
      if (!form.isConnected) return;
      settings = result.settings || (await api("quality-review")).settings;
      dirty = false; saved();
      el("[data-quality-choice-status]").textContent = mode === "off" ? "已关闭增强，常规检查保持不变。" : "实验性自测选择已保存，等待当前 Agent 执行；未启动模型或付费调用。";
    } catch (error) {
      if (form.isConnected) el("[data-quality-choice-status]").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  target.querySelectorAll("[data-quality-seek]").forEach((link) => {
    link.onclick = async (event) => {
      event.preventDefault();
      if (dirty && !confirm("当前自测选择尚未保存，是否前往工作台？")) return;
      try {
        const workspace = await api("workspace");
        const time = Math.min(Number(link.dataset.qualitySeek), Number(workspace.timeline?.duration_seconds ?? Infinity));
        await api("actions", { expected_revision: workspace.revision, actions: [{ type: "view.set", patch: { time, playing: false } }] });
        location.assign("/");
      } catch (error) {
        if (form.isConnected) el("[data-quality-choice-status]").textContent = error.message;
      }
    };
  });
  update();
  window.lucide?.createIcons();
}
