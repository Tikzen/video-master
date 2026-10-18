# Motion Continuity

Read this when designing multi-scene videos where motion feels disjointed or scenes feel like they "jump" rather than flow. This is creative Agent guidance for making animation feel continuous and intentional.

## The Problem: Scene Jumps

**What it looks like:**
- Scene 1 ends with elements moving left
- Cut/transition happens
- Scene 2 starts with elements moving right
- **Result:** Feels jarring, like the video "reset"

**What it should feel like:**
- Scene 1 ends with elements moving left
- Transition continues the leftward motion
- Scene 2 starts with elements continuing left (or intentionally reversing)
- **Result:** Feels like continuous flow

---

## The Core Principle

**Motion has momentum. Respect it.**

When Scene 1 ends, its visual elements have:
- A direction (left, right, up, down, rotating, expanding)
- A speed (fast, slow, accelerating, decelerating)
- An energy level (calm, chaotic, intense, gentle)

Scene 2 should either:
1. **Continue** that momentum
2. **Transform** it smoothly
3. **Reverse** it intentionally (for dramatic effect)

**Never:** Ignore it and start something unrelated.

---

## Six Strategies for Motion Continuity

### Strategy 1: Direction Continuation

The simplest form of continuity: keep moving in the same direction.

#### Example: Left Motion

```json
{
  "scene-1": {
    "layers": [
      {
        "id": "element",
        "keyframes": [
          {"at": 0, "x": 500},
          {"at": 3, "x": 1200}  // Moving RIGHT
        ]
      }
    ],
    "transition": {
      "type": "wipe",
      "direction": "left"  // Wipe also moves RIGHT (revealing from left)
    }
  },
  "scene-2": {
    "start_sec": 3.5,
    "layers": [
      {
        "id": "new-element",
        "keyframes": [
          {"at": 0, "x": 500},   // Starts from similar position
          {"at": 2, "x": 1100}   // Continues moving RIGHT
        ]
      }
    ]
  }
}
```

**Result:** Feels like camera panning right across a continuous space.

---

### Strategy 2: Shared Element Handoff

An element from Scene 1 persists through the transition into Scene 2 (even if transformed).

#### Example: Color Handoff

```json
{
  "scene-1": {
    "end_sec": 5,
    "layers": [
      {
        "id": "red-circle",
        "fill": "#ff4444",
        "keyframes": [
          {"at": 3, "x": 960, "y": 540, "scale": 1},
          {"at": 5, "x": 960, "y": 540, "scale": 3, "opacity": 0.8}
          // Expanding as scene ends
        ]
      }
    ],
    "transition": {"type": "flow", "duration_sec": 0.8}
  },
  "scene-2": {
    "start_sec": 5,
    "layers": [
      {
        "id": "red-background",
        "kind": "rect",
        "width": 1920,
        "height": 1080,
        "fill": "#ff4444",  // Same red!
        "keyframes": [
          {"at": 0, "opacity": 1},
          {"at": 2, "opacity": 0.3}  // Fading but persists
        ]
      },
      {
        "id": "new-content",
        // New elements on top of red background
      }
    ]
  }
}
```

**Result:** The red circle "becomes" the background of the next scene. Feels like transformation, not replacement.

---

### Strategy 3: Motion Echo

Scene 2 starts with a motion that "echoes" the ending of Scene 1.

#### Example: Rotation Echo

```json
{
  "scene-1": {
    "layers": [
      {
        "id": "spinner",
        "keyframes": [
          {"at": 0, "rotation": 0},
          {"at": 3, "rotation": 360}  // Spinning clockwise
        ]
      }
    ]
  },
  "scene-2": {
    "camera": {
      "keyframes": [
        {"at": 0, "rotation": 0},
        {"at": 2, "rotation": 90, "ease": "cubicOut"}  // Camera rotates clockwise
      ]
    },
    "layers": [
      // New elements, but the camera rotation echoes the spinner
    ]
  }
}
```

**Result:** The spinning sensation continues, even though it's now camera rotation instead of element rotation.

---

### Strategy 4: Energy Matching

Match the **energy level** at transition boundaries.

#### Example: Calm → Calm

```json
{
  "scene-1": {
    "layers": [
      {
        "keyframes": [
          {"at": 2, "scale": 1, "opacity": 1},
          {"at": 4, "scale": 1.05, "opacity": 0.9, "ease": "cubicInOut"}
          // Gentle breathing motion at end
        ]
      }
    ]
  },
  "scene-2": {
    "layers": [
      {
        "keyframes": [
          {"at": 0, "scale": 1.05, "opacity": 0.9},  // Matches end state of scene-1
          {"at": 1.5, "scale": 1, "opacity": 1, "ease": "cubicInOut"}
          // Continues gentle motion
        ]
      }
    ]
  }
}
```

#### Anti-Example: Energy Mismatch

```json
{
  "scene-1": {
    "layers": [
      {
        "keyframes": [
          {"at": 2.5, "x": 500, "y": 300},
          {"at": 3, "x": 1500, "y": 800}  // FAST motion at end
        ]
      }
    ]
  },
  "scene-2": {
    "layers": [
      {
        "keyframes": [
          {"at": 0, "scale": 1},
          {"at": 5, "scale": 1.1, "ease": "cubicInOut"}  // SLOW motion
        ]
      }
    ]
  }
}
```

**Problem:** Scene 1 ends with high energy, Scene 2 starts with low energy. Feels like hitting a wall.

---

### Strategy 5: Overlap and Stagger

Scene 2's elements start appearing **before** Scene 1 ends.

This requires using `animation_offset_sec` to shift Scene 2's animation timeline.

#### Example: Staggered Entry

```json
{
  "scene-1": {
    "start_sec": 0,
    "end_sec": 5,
    "layers": [
      {
        "keyframes": [
          {"at": 3, "opacity": 1},
          {"at": 5, "opacity": 0.3}  // Fading out at end
        ]
      }
    ]
  },
  "scene-2": {
    "start_sec": 5,
    "end_sec": 10,
    "animation_offset_sec": -1.5,  // Start animation 1.5s early
    "layers": [
      {
        "keyframes": [
          {"at": 0, "opacity": 0, "y": 100},
          {"at": 1.5, "opacity": 1, "y": 0, "ease": "cubicOut"}
          // Fading in while scene-1 is still visible
        ]
      }
    ]
  }
}
```

**Result:** New elements start appearing while old elements are still visible during transition. Creates overlap and smoothness.

---

### Strategy 6: Intentional Reversal

Sometimes you **want** to reverse momentum for dramatic effect. But do it intentionally with a transition that sells it.

#### Example: Reversal with Impact

```json
{
  "scene-1": {
    "layers": [
      {
        "keyframes": [
          {"at": 0, "x": 200},
          {"at": 3, "x": 1720}  // Moving RIGHT, fast
        ]
      }
    ],
    "transition": {
      "type": "push",
      "direction": "right",  // Push in SAME direction (intensifies)
      "duration_sec": 0.3    // Fast transition = impact
    }
  },
  "scene-2": {
    "layers": [
      {
        "keyframes": [
          {"at": 0, "x": 1720},     // Starts from where scene-1 ended
          {"at": 2, "x": 200, "ease": "cubicIn"}  // REVERSES, moves LEFT
        ]
      }
    ]
  }
}
```

**Why this works:**
- Transition intensifies the rightward motion (push right)
- Then Scene 2 deliberately reverses (bounces back)
- Feels like hitting a wall and bouncing, not random direction change

---

## Continuity Checklist

For every pair of adjacent scenes, check these:

### Last 0.5s of Scene A vs First 0.5s of Scene B

Compare:

- [ ] **Direction of motion** - Same, transformed, or intentionally reversed?
- [ ] **Speed of motion** - Similar energy level?
- [ ] **Visual elements** - Any shared colors, shapes, or materials?
- [ ] **Transition type** - Does it match the relationship? (see transition-playbook.md)

### Transition as Bridge

- [ ] Does the transition **continue** the motion from Scene A?
- [ ] Or does it **transform** smoothly?
- [ ] Or does it **intensify** for dramatic reversal?

### Animation Timing

- [ ] Consider using `animation_offset_sec` for overlap
- [ ] Scene B's first keyframe should consider Scene A's last state

---

## Common Continuity Patterns

### Pattern 1: The Flow

Every scene continues the previous scene's motion direction.

```
Scene 1: Move right
Transition: Wipe left (reveals right-to-left)
Scene 2: Move right
Transition: Wipe left
Scene 3: Move right
```

**Use for:** Journey, progression, forward momentum themes

---

### Pattern 2: The Orbit

Scenes rotate around a conceptual center.

```
Scene 1: Camera/elements move clockwise
Scene 2: Continue clockwise (different radius)
Scene 3: Continue clockwise (return to start)
```

**Use for:** Cyclical themes, examination from multiple angles

---

### Pattern 3: The Pulse

All scenes share a rhythmic "breathing" motion.

```
All scenes: Scale 1.0 → 1.1 → 1.0 with same timing
Different content, but same underlying rhythm
```

**Use for:** Organic, living, meditative themes

---

### Pattern 4: The Cascade

Motion "falls" through the video.

```
Scene 1: Elements move down
Scene 2: Elements continue falling (different elements)
Scene 3: Elements settle at bottom
```

**Use for:** Gravity, descent, settling themes

---

### Pattern 5: The Expansion

All motion radiates outward from center.

```
Scene 1: Small circle expands
Scene 2: Circle becomes particles, scatter outward
Scene 3: Particles fill entire space
```

**Use for:** Growth, explosion, discovery themes

---

## Anti-Patterns (Avoid These)

### ❌ The Reset

Each scene starts from a neutral state, ignoring what came before.

```json
// Scene 1 ends with fast rightward motion
{"at": 3, "x": 1500, "rotation": 180}

// Scene 2 starts from center, no rotation
{"at": 0, "x": 960, "rotation": 0}
// Feels like hitting reset button
```

**Fix:** Scene 2 should start from x: 1500, or continue rotation

---

### ❌ The Random Direction

Each scene moves in a random direction with no pattern.

```
Scene 1: Move right
Scene 2: Move up
Scene 3: Move down-left
Scene 4: Move right
```

**Fix:** Pick a pattern (all same direction, or intentional rotation)

---

### ❌ The Speed Whiplash

Dramatic speed changes at boundaries.

```
Scene 1: Ends with 3-second slow drift
Scene 2: Starts with 0.2-second rapid flash
```

**Fix:** Either ramp up speed during transition, or match energy levels

---

### ❌ The Ignored Transition

Transition type doesn't match the motion relationship.

```json
{
  "scene-1": {
    // Elements spiraling inward
    "transition": {"type": "wipe", "direction": "left"}
    // Wipe is linear, spiral is rotational - mismatch
  }
}
```

**Fix:** Use `iris` or `flow` transition for spiral motion

---

## Advanced: Transition-Aware Keyframes

Design your keyframes with the transition in mind.

### Example: Zoom Transition

```json
{
  "scene-1": {
    "end_sec": 5,
    "layers": [
      {
        "keyframes": [
          {"at": 3, "scale": 1},
          {"at": 5, "scale": 1.2}  // Scaling UP at end
        ]
      }
    ],
    "transition": {
      "type": "zoom",
      "duration_sec": 0.6
      // Zoom transition also scales up
    }
  },
  "scene-2": {
    "start_sec": 5,
    "layers": [
      {
        "keyframes": [
          {"at": 0, "scale": 1.5},  // Starts even larger
          {"at": 2, "scale": 1, "ease": "cubicOut"}  // Settles back
        ]
      }
    ]
  }
}
```

**Result:** Continuous scaling: Scene 1 scales up → Transition amplifies → Scene 2 continues then settles. Feels like one continuous zoom.

---

### Example: Flow Transition

```json
{
  "scene-1": {
    "layers": [
      {
        "fill": "#ff4444",
        "keyframes": [
          {"at": 3, "opacity": 1},
          {"at": 5, "opacity": 0.8}
        ]
      }
    ],
    "transition": {
      "type": "flow",
      "direction": "down",
      "duration_sec": 0.8
    }
  },
  "scene-2": {
    "layers": [
      {
        "fill": "#ff6644",  // Similar color (slightly shifted)
        "keyframes": [
          {"at": 0, "opacity": 0.6},  // Starts semi-transparent
          {"at": 1.5, "opacity": 1}    // Fades in fully
        ]
      }
    ]
  }
}
```

**Result:** The flow transition creates liquid-like blending between similar colors. Feels like one color melting into another.

---

## Practical Exercise: Diagnosing Continuity

Given this problematic sequence, identify the issues:

```json
{
  "scene-1": {
    "start_sec": 0,
    "end_sec": 4,
    "layers": [
      {
        "keyframes": [
          {"at": 0, "x": 500, "rotation": 0},
          {"at": 4, "x": 1400, "rotation": 360}  // Moving right, spinning
        ]
      }
    ],
    "transition": {"type": "dissolve", "duration_sec": 0.5}
  },
  "scene-2": {
    "start_sec": 4,
    "end_sec": 8,
    "layers": [
      {
        "keyframes": [
          {"at": 0, "x": 960, "y": 540, "scale": 1},
          {"at": 4, "y": 100, "scale": 1.5}  // Moving up, scaling
        ]
      }
    ],
    "transition": {"type": "cut"}
  },
  "scene-3": {
    "start_sec": 8,
    "end_sec": 12,
    "layers": [
      {
        "keyframes": [
          {"at": 0, "x": 200, "opacity": 0},
          {"at": 2, "x": 200, "opacity": 1}  // Fading in, no motion
        ]
      }
    ]
  }
}
```

**Issues:**

1. **Scene 1 → 2:**
   - Scene 1 ends moving RIGHT and ROTATING
   - Scene 2 starts CENTERED and moves UP
   - No direction continuity
   - Dissolve transition is generic, doesn't relate to the spinning
   
2. **Scene 2 → 3:**
   - Scene 2 ends with upward motion and large scale
   - Scene 3 starts small on left with no motion
   - Complete reset
   - Cut transition is jarring after upward motion

**Fixes:**

```json
{
  "scene-1": {
    "transition": {
      "type": "iris",
      "origin_x": 0.75,  // Where element ends up
      "duration_sec": 0.6
      // Iris relates to the spinning motion
    }
  },
  "scene-2": {
    "layers": [
      {
        "keyframes": [
          {"at": 0, "x": 1400, "rotation": 360},  // Start where scene-1 ended
          {"at": 1, "x": 960, "rotation": 450},   // Continue rotation
          {"at": 4, "y": 100, "scale": 1.5}
        ]
      }
    ],
    "transition": {
      "type": "zoom",  // Matches the scaling up
      "duration_sec": 0.5
    }
  },
  "scene-3": {
    "camera": {
      "keyframes": [
        {"at": 0, "scale": 1.5, "y": -100},  // Match scene-2's end state
        {"at": 2, "scale": 1, "y": 0}        // Settle back
      ]
    },
    "layers": [
      {
        "keyframes": [
          {"at": 0, "opacity": 1},
          // Already visible, no fade needed
        ]
      }
    ]
  }
}
```

---

## Integration with Other Guides

Motion continuity works with:

- **transition-playbook.md** - Choose transitions that match motion relationships
- **visual-storytelling.md** - Continuity reinforces narrative coherence
- **motion-direction.md** - Technical implementation of motion patterns

---

## Summary: The Continuity Mindset

**Stop thinking:** "Scene 1 ends, Scene 2 begins"

**Start thinking:** "Scene 1's motion flows into Scene 2"

Every scene boundary should answer:
- **What momentum does Scene 1 have at the end?**
- **Does Scene 2 continue, transform, or intentionally reverse it?**
- **Does the transition support that relationship?**

### Quick Continuity Audit

For each scene transition:

1. **Describe Scene 1's end state:** "Moving right, spinning, bright red"
2. **Describe Scene 2's start state:** "Centered, scaling up, orange"
3. **What's carried over?** "Color (red→orange), energy level (high)"
4. **What's transformed?** "Direction (right→up), motion type (spin→scale)"
5. **Is the transition appropriate?** "Zoom transition matches scaling"

If you can't clearly articulate the relationship, your continuity needs work.

---

## Final Principle

**Motion is conversation.** Each scene responds to the previous one. If Scene 1 "says" something with its motion (moving fast, spinning, expanding), Scene 2 should respond meaningfully—not ignore it and start a new conversation.

The best videos feel like continuous transformation rather than a series of slides. Every frame should feel like the natural consequence of the frame before it, even across scene boundaries.
