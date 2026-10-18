import test from "node:test";
import assert from "node:assert/strict";
import { finishConfig, samplesAt, validateFinish } from "./finish.js";

test("finish config: defaults are inert, windows override motion-blur samples", () => {
  const off = finishConfig({});
  assert.equal(off.active, false);
  assert.equal(samplesAt(off, 1), 1);
  const cfg = finishConfig({ finish: { motion_blur: { samples: 4, windows: [{ start_sec: 2, end_sec: 3, samples: 10 }] }, grain: 0.02 } });
  assert.equal(cfg.active, true);
  assert.equal(samplesAt(cfg, 1), 4);
  assert.equal(samplesAt(cfg, 2.5), 10);
});

test("finish validation rejects out-of-range values", () => {
  assert.deepEqual(validateFinish({}), []);
  assert.deepEqual(validateFinish({ finish: { bloom: { amount: 0.5, threshold: 0.6 }, vignette: 0.2 } }), []);
  const errs = validateFinish({ finish: { motion_blur: { samples: 40, windows: [{ start_sec: 3, end_sec: 2, samples: 4 }] }, grain: 0.5 } });
  assert.equal(errs.length, 3);
});
