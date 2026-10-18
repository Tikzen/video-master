# Element Logic - Timing and Causality

Read this when elements in your video appear randomly or without clear reason. This guide teaches how to make every element's appearance feel intentional and logical.

## The Core Problem

**Bad timing:**
```json
{
  "id": "particle-05",
  "keyframes": [
    {"at": 1.7, "opacity": 0},
    {"at": 2.3, "opacity": 1}
  ]
}
```

**Questions this doesn't answer:**
- Why 1.7 seconds?
- Why this particle specifically?
- What caused it to appear?

**Without answers, it feels random.**

---

## The Five Logic Systems

### 1. Causal Chain (因果链)

**Principle:** A causes B, B causes C, C causes D

Each element's appearance is triggered by a previous element's action.

#### Example: Energy Pulse System

```
Step 1: Core pulses
Step 2: Energy wave radiates from core
Step 3: Wave reaches edge
Step 4: Node appears where wave hit
Step 5: Connection draws from core to node
```

**Implementation:**

```json
{
  "layers": [
    {
      "id": "core",
      "keyframes": [
        {"at": 0, "scale": 1},
        {"at": 0.3, "scale": 1.3, "ease": "cubicOut"},  // Pulse
        {"at": 0.6, "scale": 1, "ease": "cubicIn"}
      ]
    },
    {
      "id": "energy-wave",
      "keyframes": [
        {"at": 0.3, "scale": 0, "opacity": 1},  // Starts when core pulses
        {"at": 1.2, "scale": 4, "opacity": 0}   // Expands outward
      ]
    },
    {
      "id": "node-north",
      "transform": {"x": 960, "y": 340},
      "keyframes": [
        {"at": 0, "scale": 0, "opacity": 0},
        {"at": 1.0, "scale": 0, "opacity": 0},    // Wait for wave
        {"at": 1.3, "scale": 1, "opacity": 1, "ease": "spring"}  // Appear when wave arrives
      ]
    },
    {
      "id": "connection-north",
      "keyframes": [
        {"at": 1.3, "reveal": 0},                 // Start after node appears
        {"at": 2.0, "reveal": 1, "ease": "cubicOut"}
      ]
    }
  ]
}
```

**Timing calculation:**
- Core pulse: 0.3s
- Wave travel time: 0.3s to 1.2s (0.9s duration)
- Node appears when wave hits: 1.0s + (distance_factor * 0.3s)
- Connection draws: immediately after node

**Result:** Clear cause-and-effect. Viewer understands the system.

---

### 2. Growth Progression (生长序列)

**Principle:** Organic development through visible stages

Like a plant: seed → sprout → stem → leaves → flower

#### Example: Fractal Branching

```
Stage 1: Single line (trunk)
Stage 2: Split into 2 branches
Stage 3: Each branch splits into 2 (now 4 branches)
Stage 4: Each splits again (now 8 branches)
```

**Implementation:**

```json
{
  "layers": [
    {
      "id": "trunk",
      "keyframes": [
        {"at": 0, "reveal": 0},
        {"at": 1.0, "reveal": 1}  // Draw trunk
      ]
    },
    {
      "id": "branch-L1-left",
      "keyframes": [
        {"at": 1.0, "reveal": 0},           // Start when trunk completes
        {"at": 1.8, "reveal": 1}
      ]
    },
    {
      "id": "branch-L1-right",
      "keyframes": [
        {"at": 1.0, "reveal": 0},
        {"at": 1.8, "reveal": 1}
      ]
    },
    {
      "id": "branch-L2-left-left",
      "keyframes": [
        {"at": 1.8, "reveal": 0},           // Start when L1 completes
        {"at": 2.4, "reveal": 1}
      ]
    }
    // Continue pattern...
  ]
}
```

**Timing pattern:**
- Each generation takes 0.8s to grow
- Next generation starts immediately after previous completes
- Exponential growth: 1 → 2 → 4 → 8

**Result:** Feels like natural growth, not random spawning.

---

### 3. Convergence/Divergence (聚合/发散)

**Principle:** Many → one, or one → many

Elements move toward/away from a focal point.

#### Example: Particle Convergence

```
Step 1: Particles scattered across screen
Step 2: All start moving toward center
Step 3: Arrive at staggered times (nearest first)
Step 4: Merge into single element
```

**Implementation:**

```json
{
  "layers": [
    {
      "id": "particle-01",
      "keyframes": [
        {"at": 0, "x": 300, "y": 200, "opacity": 1},
        {"at": 2.0, "x": 960, "y": 540, "opacity": 1, "ease": "cubicInOut"},
        {"at": 2.1, "scale": 0}  // Absorbed
      ]
    },
    {
      "id": "particle-02",
      "keyframes": [
        {"at": 0, "x": 1600, "y": 400, "opacity": 1},
        {"at": 2.5, "x": 960, "y": 540, "opacity": 1, "ease": "cubicInOut"},  // Arrives later (farther)
        {"at": 2.6, "scale": 0}
      ]
    },
    {
      "id": "particle-03",
      "keyframes": [
        {"at": 0, "x": 800, "y": 800, "opacity": 1},
        {"at": 1.8, "x": 960, "y": 540, "opacity": 1, "ease": "cubicInOut"},  // Arrives first (closest)
        {"at": 1.9, "scale": 0}
      ]
    },
    {
      "id": "merged-core",
      "keyframes": [
        {"at": 1.8, "scale": 0, "opacity": 0},        // Start when first arrives
        {"at": 2.6, "scale": 1, "opacity": 1, "ease": "cubicOut"}  // Grow as others arrive
      ]
    }
  ]
}
```

**Timing calculation:**
```javascript
const center = {x: 960, y: 540};
const distance = Math.sqrt((x - center.x)**2 + (y - center.y)**2);
const arrivalTime = 1.5 + (distance / 500) * 1.0;  // Base time + distance factor
```

**Result:** Movement feels physical and intentional.

---

### 4. Rhythm Pattern (节奏模式)

**Principle:** Elements appear on beats/intervals

Musical or mathematical timing creates predictability.

#### Example: Beat-Synchronized Spawn

```
Beat pattern: Every 0.5 seconds
Elements spawn: On each beat
Pattern: Radial positions, rotating
```

**Implementation:**

```json
{
  "layers": [
    {
      "id": "beat-element-01",
      "transform": {"x": 960, "y": 340},  // North
      "keyframes": [
        {"at": 0.0, "scale": 0},
        {"at": 0.2, "scale": 1, "ease": "spring"}
      ]
    },
    {
      "id": "beat-element-02",
      "transform": {"x": 1160, "y": 540},  // East
      "keyframes": [
        {"at": 0.5, "scale": 0},
        {"at": 0.7, "scale": 1, "ease": "spring"}
      ]
    },
    {
      "id": "beat-element-03",
      "transform": {"x": 960, "y": 740},  // South
      "keyframes": [
        {"at": 1.0, "scale": 0},
        {"at": 1.2, "scale": 1, "ease": "spring"}
      ]
    },
    {
      "id": "beat-element-04",
      "transform": {"x": 760, "y": 540},  // West
      "keyframes": [
        {"at": 1.5, "scale": 0},
        {"at": 1.7, "scale": 1, "ease": "spring"}
      ]
    }
  ]
}
```

**Timing pattern:**
- Interval: 0.5s
- Spawn times: 0.0, 0.5, 1.0, 1.5, 2.0...
- Position: Rotates around circle

**Result:** Predictable, rhythmic, musical feeling.

---

### 5. State Transition (状态转换)

**Principle:** One element transforms into another

Not disappear/appear, but morph/split/merge.

#### Example: Split and Multiply

```
State 1: One large circle
State 2: Circle starts shaking
State 3: Circle splits into two
State 4: Two circles separate
```

**Implementation:**

```json
{
  "layers": [
    {
      "id": "original-circle",
      "keyframes": [
        {"at": 0, "scale": 1, "opacity": 1},
        {"at": 1.0, "scale": 1.05, "ease": "cubicInOut"},  // Shake
        {"at": 1.1, "scale": 0.95, "ease": "cubicInOut"},
        {"at": 1.2, "scale": 1.05, "ease": "cubicInOut"},
        {"at": 1.3, "scale": 1, "opacity": 0}  // Disappear as split happens
      ]
    },
    {
      "id": "split-circle-left",
      "transform": {"x": 960, "y": 540},
      "keyframes": [
        {"at": 1.3, "x": 960, "scale": 1, "opacity": 0},
        {"at": 1.4, "x": 960, "scale": 1, "opacity": 1},  // Appear
        {"at": 2.0, "x": 760, "ease": "cubicOut"}         // Move apart
      ]
    },
    {
      "id": "split-circle-right",
      "transform": {"x": 960, "y": 540},
      "keyframes": [
        {"at": 1.3, "x": 960, "scale": 1, "opacity": 0},
        {"at": 1.4, "x": 960, "scale": 1, "opacity": 1},
        {"at": 2.0, "x": 1160, "ease": "cubicOut"}
      ]
    }
  ]
}
```

**Key:** Original disappears at exact moment splits appear (1.3s)

**Result:** Feels like transformation, not random swap.

---

## Timing Design Method

### Step 1: Draw the Timeline

```
Scene duration: 5 seconds
|----|----|----|----|----| 
0s   1s   2s   3s   4s   5s

Events:
- 0.0s: Core appears
- 0.5s: Core pulses
- 0.8s: Wave starts
- 1.5s: Wave hits edge
- 1.6s: Nodes appear
- 2.0s: Connections draw
- 3.0s: Network complete
```

### Step 2: Mark Dependencies

```
Core pulse (0.5s)
  ↓ triggers
Wave expansion (0.8s - 1.5s)
  ↓ triggers
Node appearance (1.6s)
  ↓ triggers
Connection drawing (2.0s)
```

### Step 3: Calculate Timing

```javascript
const corePulse = 0.5;
const waveDelay = 0.3;
const waveDuration = 0.7;
const waveEnd = corePulse + waveDelay + waveDuration;  // 1.5s
const nodeAppear = waveEnd + 0.1;  // 1.6s
const connectionStart = nodeAppear + 0.4;  // 2.0s
```

### Step 4: Implement in JSON

```json
{
  "keyframes": [
    {"at": 0.5, ...},      // corePulse
    {"at": 0.8, ...},      // waveStart
    {"at": 1.5, ...},      // waveEnd
    {"at": 1.6, ...},      // nodeAppear
    {"at": 2.0, ...}       // connectionStart
  ]
}
```

---

## Common Timing Patterns

### Pattern 1: Sequential (顺序)

```
Element 1: 0.0s - 1.0s
Element 2: 1.0s - 2.0s  (starts when 1 ends)
Element 3: 2.0s - 3.0s  (starts when 2 ends)
```

**Use for:** Linear progression, steps, tutorials

---

### Pattern 2: Overlapping (重叠)

```
Element 1: 0.0s - 1.5s
Element 2: 1.0s - 2.5s  (starts before 1 ends)
Element 3: 2.0s - 3.5s  (starts before 2 ends)
```

**Use for:** Building complexity, layering

---

### Pattern 3: Simultaneous (同步)

```
Element 1: 0.0s - 2.0s
Element 2: 0.0s - 2.0s  (same timing)
Element 3: 0.0s - 2.0s  (same timing)
```

**Use for:** Unity, harmony, synchronized action

---

### Pattern 4: Cascade (级联)

```
Element 1: 0.0s
Element 2: 0.1s  (slight delay)
Element 3: 0.2s  (slight delay)
Element 4: 0.3s  (slight delay)
```

**Use for:** Wave effects, ripples, domino

---

### Pattern 5: Radial (径向)

```
Center: 0.0s
Ring 1 (4 elements): 0.5s
Ring 2 (8 elements): 1.0s
Ring 3 (12 elements): 1.5s
```

**Use for:** Expansion, growth from center

---

## Fixing Random Timing

### Before (Random)

```json
{
  "layers": [
    {"id": "el-01", "keyframes": [{"at": 0.7, "opacity": 0}, {"at": 1.2, "opacity": 1}]},
    {"id": "el-02", "keyframes": [{"at": 1.3, "opacity": 0}, {"at": 1.9, "opacity": 1}]},
    {"id": "el-03", "keyframes": [{"at": 0.4, "opacity": 0}, {"at": 1.1, "opacity": 1}]}
  ]
}
```

**Problem:** 0.7, 1.3, 0.4 - no pattern, no reason

---

### After (Cascade Pattern)

```json
{
  "layers": [
    {"id": "el-01", "keyframes": [{"at": 0.0, "opacity": 0}, {"at": 0.3, "opacity": 1}]},
    {"id": "el-02", "keyframes": [{"at": 0.2, "opacity": 0}, {"at": 0.5, "opacity": 1}]},
    {"id": "el-03", "keyframes": [{"at": 0.4, "opacity": 0}, {"at": 0.7, "opacity": 1}]}
  ]
}
```

**Fix:** 0.0, 0.2, 0.4 - clear 0.2s interval cascade

---

## Element Count Logic

### Too Few Elements (单薄)

```
Scene: 5 elements total
Problem: Feels empty, amateur
```

**Fix:** Add layers:
- Background atmosphere: 5-10 elements
- Main content: 5-10 elements
- Foreground details: 3-5 elements
- **Total: 15-25 elements per scene**

---

### Too Many Random Elements

```
Scene: 50 random particles
Problem: Chaotic, no structure
```

**Fix:** Organize into groups:
- Group 1: 10 particles, appear at 0.0s, move left
- Group 2: 10 particles, appear at 0.5s, move right
- Group 3: 10 particles, appear at 1.0s, move up
- **Same count, but organized**

---

## Integration with Camera

Element timing should coordinate with camera:

```json
{
  "camera": {
    "keyframes": [
      {"at": 0, "scale": 1.5},
      {"at": 2, "scale": 1.0}  // Zoom in
    ]
  },
  "layers": [
    {
      "id": "detail-element",
      "keyframes": [
        {"at": 1.5, "opacity": 0},      // Start appearing
        {"at": 2.0, "opacity": 1}       // Fully visible when zoom completes
      ]
    }
  ]
}
```

**Coordination:** Detail appears as camera zooms in to see it.

---

## Verification Checklist

For each element, answer:

- [ ] **Why does this element exist?** (purpose)
- [ ] **Why does it appear at this time?** (timing reason)
- [ ] **What caused it to appear?** (trigger/cause)
- [ ] **Where does it go?** (destination/fate)
- [ ] **Does its timing relate to other elements?** (pattern)

If you can't answer these, the timing is arbitrary.

---

## Common Anti-Patterns

### ❌ Magic Numbers

```json
{"at": 1.73, "opacity": 1}  // Why 1.73?
```

**Fix:** Use calculated values or round numbers

---

### ❌ No Stagger

```json
// 10 elements all appear at exactly 0.5s
```

**Fix:** Add stagger: 0.5, 0.52, 0.54, 0.56...

---

### ❌ Instant Disappear

```json
{"at": 3.0, "opacity": 1},
{"at": 3.0, "opacity": 0}  // Poof, gone
```

**Fix:** Fade out over time, or transform into something

---

### ❌ Dead Time

```
0-2s: Action
2-4s: Nothing happens
4-6s: Action
```

**Fix:** Fill dead time or compress timeline

---

## Advanced: Physics-Based Timing

For realistic motion, use physics:

```javascript
// Gravity fall
const gravity = 9.8;  // m/s²
const fallTime = Math.sqrt(2 * distance / gravity);

// Constant velocity
const velocity = 200;  // pixels/second
const travelTime = distance / velocity;

// Ease-based (approximate acceleration)
const easedTime = distance / (velocity * 0.75);  // cubicOut feels like ~75% average speed
```

Use these for calculating realistic arrival times.

---

## Summary: The Logic Mindset

**Stop thinking:** "I'll make elements appear when it looks good"

**Start thinking:** "Every element appears for a reason"

Every element's timing should answer:
- **What triggered this element?**
- **Why this moment specifically?**
- **What pattern does this follow?**

The five logic systems:
1. Causal chain - A triggers B
2. Growth progression - Stages of development
3. Convergence/Divergence - Moving toward/from
4. Rhythm pattern - Musical/mathematical
5. State transition - Transformation

**When in doubt, use causal chain or rhythm pattern.**

**The best timing feels inevitable, not random.**
