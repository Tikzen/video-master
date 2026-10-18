import test from "node:test";
import assert from "node:assert/strict";
import { clamp01, lerp, smoothstep, easeOutCubic, progressAt, springOut, staggeredProgress } from "./motion.js";

test("absolute-time motion is bounded, seek-independent and preserves intentional overshoot", () => {
  assert.equal(clamp01(-2), 0);
  assert.equal(clamp01(2), 1);
  for (const ease of [smoothstep, easeOutCubic]) {
    assert.equal(ease(-1), 0);
    assert.equal(ease(2), 1);
    assert.ok(ease(0.5) > 0 && ease(0.5) < 1);
  }
  assert.equal(progressAt(1, 2, 0.5), 0);
  assert.equal(progressAt(2.25, 2, 0.5), 0.5);
  assert.equal(progressAt(3, 2, 0.5), 1);
  assert.equal(progressAt(1, 2, 0), 0);
  assert.equal(progressAt(2, 2, 0), 1);
  assert.equal(springOut(0), 0);
  assert.equal(springOut(1), 1);
  assert.ok(springOut(0.25) > 1);
  assert.ok(lerp(0.9, 1.06, springOut(0.25)) > 1.06, "lerp must not clamp away a spring's overshoot");
  assert.throws(() => springOut(0.5, { damping: Infinity }), /finite/);
  assert.ok(staggeredProgress(0.4, 0) > staggeredProgress(0.4, 3));
  const pose = (t) => lerp(0.9, 1, springOut(progressAt(t, 2, 0.5)));
  const sequential = [1, 2.2, 2.5, 3].map(pose);
  assert.deepEqual([3, 1, 2.5, 2.2].map(pose), [sequential[3], sequential[0], sequential[2], sequential[1]]);
});

test("easing vocabulary: named, bezier() and spring() eases start at 0 and end at 1", async () => {
  const { EASINGS, easeByName, isEaseName } = await import("./motion.js");
  for (const [name, fn] of Object.entries(EASINGS)) {
    if (name === "step") continue;
    assert.ok(Math.abs(fn(0)) < 1e-6, `${name}(0)`);
    assert.ok(Math.abs(fn(1) - 1) < 1e-6, `${name}(1)`);
  }
  assert.ok(EASINGS.backOut(0.6) > 1, "backOut overshoots");
  assert.ok(EASINGS.snap(0.3) > 0.8, "snap front-loads");
  assert.ok(isEaseName("bezier(0.16,1,0.3,1)") && isEaseName("spring(6,12)"));
  assert.equal(isEaseName("bezier(2,0,0,1)"), false, "bezier x out of range");
  assert.equal(isEaseName("wobbly"), false);
  assert.ok(Math.abs(easeByName("bezier(0.16,1,0.3,1)")(0.5) - EASINGS.snap(0.5)) < 1e-9);
});
