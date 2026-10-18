# Motion Craft — principles with numbers

## 1. Easing vocabulary (never linear on objects)

| Use | Ease | Notes |
|---|---|---|
| Arrivals: titles, UI, cards | `SNAP` (bezier .16,1,.3,1) or `out_expo` | fast attack, long settle; the "premium" feel |
| Pops: icons, badges, shapes | `out_back(u, 1.7–2.5)` | 10–20 % overshoot |
| Physical objects | `spring(t, f, z)` | f 2–3 Hz; z 0.3 bouncy, 0.4–0.5 lively, 0.6–0.7 firm |
| Camera and big transforms | `io_cubic` / `io_expo` | start and end at rest |
| Exits, suck-ins | `in_cubic` / `in_expo` | accelerate away |
| Constant drift, rotation, scroll | `linear` | the only place it's allowed |
| Stop-motion / held feel | `steps(u, n)` | on-twos for a hand-made look |

Combine progress windows with `prog(t, a, b)`; chain steps with `keys(t, [(t, v, ease), ...])`.

## 2. The principles that matter on screen

- **Anticipation.** Before a big move, a small opposite move of 0.1–0.3 s: squash before a jump, a pull back before a launch, a breath before a drop.
- **Squash and stretch.** Stretch along velocity in flight and squash on contact. Keep the area: `sx · sy ≈ 1`. Stretch up to 1.3–1.4 at peak speed, squash 0.6–0.75 on impact.
- **Arcs.** Living things travel on arcs (parabolas, bezier cursor paths), not straight lines.
- **Slow in / slow out.** Spacing is tight near keys and wide in the middle. In a ballistic arc, constant gravity does this for you.
- **Follow-through and overlap.** Parts settle after the main body: a damped string, hair, a label lagging 60–120 ms, letters landing in a wave.
- **Secondary action.** A small reaction that supports the main one: ripple rings on landing, dust, a guide line drawing on, a counter ticking.
- **Staging.** One thing per moment. Dim, shrink or hold everything else (spotlight, opacity 0.38 on inactive items).
- **Timing = weight.** Heavy things are slow to start and stop; light things snap. Keep a "gravity" constant consistent within a scene.
- **Appeal.** Clean silhouettes, deliberate shapes, rhythmic repetition with variation.

## 3. Stagger patterns

- Letters: 25–45 ms each. Left→right for reading; centre-out (`centre_out(n)`) for symmetric words; random only for deliberate chaos.
- Lists and cards: 120–220 ms, in reading order.
- Grids: diagonal wave `delay = k · (i + j)` (25 ms) or radial from the event origin.
- Masks: letters rise through a clip rectangle (the slot reveal). Text should never just fade in.

## 4. Camera

- Every camera move has a reason: reveal, follow, push to emphasise, pull to give context.
- Speeds: push-in 2–6 % over a phrase; dives into an object 0.4–0.6 s with `io_cubic` and motion blur ≥ 8.
- Overscan the background so edges never show, at the most extreme scale, rotation and shake.
- Operator drift (≤ 3 px, noise-based) keeps static shots alive. Turn it off for UI demos that need pixel-crisp text.
- Shake belongs only on impacts (`film.impact`), decaying in ≤ 0.35 s.

## 5. Motion blur

`film.blur(default=6, windows=[(t0, t1, 10)])` renders sub-frames over a 180° shutter.
- Default 4–6. Fast handoffs, whips and particles in flight: 8–12.
- Thin lines moving faster than their width per frame strobe. Raise the samples there (the LINE chapter needed 12).
- Particles drawn as streaks (`sim.batch_streaks`) already read as blurred, so 3–4 samples is enough.

## 6. Hold and read

Motion exists to deliver information. After a reveal, **hold**:
- ≥ 0.8 s for a word or number;
- ≥ 2.5 s (or the narration length) for a sentence;
- ≥ 1.2 s for the end card, fully settled.

Idle life during holds is very small: breathing 1–2 %, drift 1–3 px, a slowly moving pattern.
Never shake text people are reading.

## 7. Self-check per chapter

- [ ] Can I name the opening state, the main action and the resulting state?
- [ ] Does every object use an ease from the table? Is anything sliding linearly?
- [ ] Are entrances staggered? Do physical things anticipate, overshoot and settle?
- [ ] Is there exactly one hero per moment?
- [ ] Do fast moves have blur windows? Does a still mid-transition look intentional?
