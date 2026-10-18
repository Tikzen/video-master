# Cinematography - Camera Movement Guide

Read this when designing camera motion for any video. Camera movement is not decoration—it's narrative tool that guides viewer attention and creates emotional impact.

## The Core Principle

**Camera should never be static unless intentionally creating stillness.**

Every scene needs camera motion that:
1. Matches the content's action
2. Enhances the emotional beat
3. Guides the viewer's eye

---

## The Seven Essential Camera Moves

### 1. Push In (推进)

**What it is:** Camera moves closer to subject (scale increases)

**Emotional effect:**
- Focus, attention, intimacy
- "Look at this"
- Building tension or importance

**When to use:**
- Introducing a key element
- Revealing a detail
- Building to a climax
- Creating intimacy

**Technical:**
```json
{
  "camera": {
    "keyframes": [
      {"at": 0, "scale": 1.0},
      {"at": 3, "scale": 1.5, "ease": "cubicIn"}
    ]
  }
}
```

**Pair with content:**
- Subject growing/becoming important
- Elements converging to center
- Building energy/complexity

**Example:**
```
Scene: Single point of light appears
Camera: Push in from scale 1.5 → 1.0
Effect: "Discovery" - like we're zooming in to investigate this light
```

---

### 2. Pull Out (拉远)

**What it is:** Camera moves away from subject (scale decreases)

**Emotional effect:**
- Revelation, context, scale
- "See the bigger picture"
- Release, expansion

**When to use:**
- Revealing the full scope
- Showing how elements relate
- Transitioning to wider context
- Creating sense of space

**Technical:**
```json
{
  "camera": {
    "keyframes": [
      {"at": 0, "scale": 1.5},
      {"at": 3, "scale": 0.8, "ease": "cubicOut"}
    ]
  }
}
```

**Pair with content:**
- Elements spreading outward
- Network expanding
- Scene getting more complex
- "Zooming out" metaphorically

**Example:**
```
Scene: Center point splits into network
Camera: Pull out from scale 1.0 → 0.7
Effect: As network grows, camera pulls back to show it all
```

---

### 3. Tracking / Follow (跟随)

**What it is:** Camera moves horizontally or vertically following subject

**Emotional effect:**
- Journey, flow, continuity
- "We're going somewhere"
- Smooth progression

**When to use:**
- Subject is moving across frame
- Showing a path or journey
- Creating flow between elements
- Horizontal timeline/progression

**Technical:**
```json
{
  "camera": {
    "keyframes": [
      {"at": 0, "x": 0, "y": 0},
      {"at": 3, "x": -200, "y": 0, "ease": "cubicInOut"}
    ]
  }
}
```

**Note:** Camera x/y are inverted - negative x moves view right

**Pair with content:**
- Elements moving in same direction
- Scanning across a scene
- Following a particle trail

**Example:**
```
Scene: Particle moves right across screen
Camera: x: 0 → -150 (follows the particle)
Effect: Particle stays roughly centered as world scrolls
```

---

### 4. Orbit / Rotate (环绕)

**What it is:** Camera rotates around center point

**Emotional effect:**
- Examination, dynamism, energy
- "Looking at this from all angles"
- Cyclical, continuous

**When to use:**
- Showcasing an object
- Adding energy without chaos
- Cyclical/repetitive themes
- 3D-feeling despite 2D

**Technical:**
```json
{
  "camera": {
    "keyframes": [
      {"at": 0, "rotation": 0},
      {"at": 4, "rotation": 360, "ease": "linear"}
    ]
  }
}
```

**Pair with content:**
- Circular orbits
- Spinning elements
- Symmetrical compositions
- Building rotation energy

**Example:**
```
Scene: Particles orbiting a center
Camera: Slow rotation 0 → 15 degrees
Effect: Adds subtle sense of depth and motion
```

---

### 5. Shake (震动)

**What it is:** Rapid small movements in x/y

**Emotional effect:**
- Impact, chaos, energy burst
- "Something powerful happened"
- Instability, danger

**When to use:**
- Explosions or impacts
- Transitions with energy
- Climactic moments
- Dramatic emphasis

**Technical:**
```json
{
  "camera": {
    "keyframes": [
      {"at": 0, "x": 0, "y": 0},
      {"at": 0.05, "x": -8, "y": 5},
      {"at": 0.10, "x": 6, "y": -7},
      {"at": 0.15, "x": -4, "y": 3},
      {"at": 0.20, "x": 0, "y": 0}
    ]
  }
}
```

**Important:** Use very short duration (0.2-0.5s), small displacement (±10px)

**Pair with content:**
- Explosions, bursts
- Collision impacts
- Beat drops in music
- Transformation moments

**Example:**
```
Scene: Particles burst outward from center
Camera: Quick shake (±8px) for 0.2s, then pull out
Effect: Impact feeling, then revealing the explosion scale
```

---

### 6. Breathing (呼吸)

**What it is:** Gentle periodic scale changes

**Emotional effect:**
- Organic, alive, calm
- "Natural rhythm"
- Meditative, flowing

**When to use:**
- Calm, contemplative scenes
- Organic/living themes
- Establishing rhythm
- Subtle background motion

**Technical:**
```json
{
  "camera": {
    "keyframes": [
      {"at": 0, "scale": 1.0},
      {"at": 1.5, "scale": 1.05, "ease": "cubicInOut"},
      {"at": 3.0, "scale": 1.0, "ease": "cubicInOut"}
    ]
  }
}
```

**Pair with content:**
- Pulsing elements
- Rhythmic patterns
- Peaceful finales
- Nature/organic themes

**Example:**
```
Scene: Gentle particles floating
Camera: Breathing scale 1.0 → 1.05 → 1.0 (cycle)
Effect: Everything feels alive and organic
```

---

### 7. Whip (甩镜)

**What it is:** Very fast pan or rotation

**Emotional effect:**
- Energy, surprise, transition
- "Sudden change"
- Dynamic cut alternative

**When to use:**
- High-energy transitions
- Surprise reveals
- Music video quick cuts
- Dramatic scene changes

**Technical:**
```json
{
  "camera": {
    "keyframes": [
      {"at": 0, "x": 0, "rotation": 0},
      {"at": 0.3, "x": -500, "rotation": 30, "ease": "cubicIn"}
    ]
  }
}
```

**Important:** Very short duration (0.2-0.4s), large displacement

**Pair with content:**
- Use with `flow` or `wipe` transition
- Content should also move rapidly
- Next scene starts with reverse whip

**Example:**
```
Scene end: Whip camera right + rotation
Transition: flow
Scene start: Continue rotation momentum
Effect: Seamless energetic transition
```

---

## Camera Movement Patterns

### Pattern 1: The Discovery Arc

```
Start: Distant (scale 0.6)
Push in: "What's that?" (scale → 1.0)
Hold: Examine (scale 1.0)
Pull out: "Ah, I see the context" (scale → 0.8)
```

**Use for:** Introduction sequences, reveals

---

### Pattern 2: The Build and Release

```
Start: Normal (scale 1.0)
Slow push: Building tension (scale → 1.3)
Shake: Impact moment
Pull out: Aftermath (scale → 0.7)
```

**Use for:** Climax sequences, explosions

---

### Pattern 3: The Journey

```
Start: Left side (x: 100)
Track right: Following subject (x → -100)
Slow down: Arriving at destination
Hold: Final position
```

**Use for:** Narrative progression, timelines

---

### Pattern 4: The Examination

```
Start: Front view (rotation: 0)
Orbit: Rotating around (rotation → 45)
Continue: Full circle (rotation → 360)
```

**Use for:** Product showcases, object focus

---

### Pattern 5: The Organic Pulse

```
Start: Normal (scale 1.0)
Breathe in: (scale → 1.05)
Breathe out: (scale → 1.0)
Repeat: Continuous cycle
```

**Use for:** Ambient pieces, meditation, nature

---

## Matching Camera to Content

### Content Type → Camera Choice

| Content Action | Camera Move | Why |
|----------------|-------------|-----|
| Elements spreading outward | Pull out | Show the expansion |
| Elements converging inward | Push in | Follow the convergence |
| Object moving right | Track right | Keep it in frame |
| Circular orbit pattern | Rotate | Match the motion |
| Explosion/burst | Shake → Pull out | Impact then scale |
| Gentle floating | Breathing | Match organic feel |
| Fast transition | Whip | Energetic cut |
| Stillness/peace | Slow breathing or static | Respect the calm |

---

## Common Mistakes

### ❌ Static Camera Throughout
Every frame looks the same depth and perspective. Boring.

**Fix:** At minimum, add gentle breathing motion.

---

### ❌ Random Camera Motion
Camera moves without reason, fighting the content.

**Fix:** Ask "Why is the camera moving this way?" Match content.

---

### ❌ Too Much Motion
Camera never stops moving, viewer gets dizzy.

**Fix:** Use stillness intentionally. Camera can rest during stable moments.

---

### ❌ Wrong Direction
Content moves right, camera pushes in. Disconnected.

**Fix:** Match camera direction to primary content direction.

---

### ❌ Wrong Speed
Slow content, fast camera. Or vice versa. Mismatch.

**Fix:** Camera speed should match content energy level.

---

### ❌ Ignoring Transitions
Camera resets between scenes. Jarring.

**Fix:** Camera motion should continue through transitions (see motion-continuity.md).

---

## Camera + Transition Integration

Camera motion should work WITH transitions, not against them.

### Example: Flow Transition

```json
{
  "scene-1": {
    "camera": {
      "keyframes": [
        {"at": 2, "scale": 1.0},
        {"at": 4, "scale": 1.3}  // Zooming in at end
      ]
    },
    "transition": {"type": "flow", "duration_sec": 0.8}
  },
  "scene-2": {
    "start_sec": 4,
    "camera": {
      "keyframes": [
        {"at": 0, "scale": 1.3},  // Start at same zoom
        {"at": 2, "scale": 1.0}   // Then zoom out
      ]
    }
  }
}
```

**Result:** Continuous camera motion across transition. No reset.

---

## Advanced: Multi-Axis Camera

Combine multiple axes for complex moves:

### Example: Dramatic Reveal

```json
{
  "camera": {
    "keyframes": [
      {
        "at": 0,
        "scale": 2.0,    // Close up
        "x": 100,        // Off-center
        "rotation": -10  // Tilted
      },
      {
        "at": 2,
        "scale": 1.0,    // Pull back
        "x": 0,          // Center
        "rotation": 0,   // Straighten
        "ease": "cubicOut"
      }
    ]
  }
}
```

**Effect:** Disorienting start → clarity. Powerful for reveals.

---

## Camera Speed and Easing

### Fast moves (< 1s)
- Use `cubicIn` or `cubicOut` for snap
- Good for: impacts, surprises, cuts

### Medium moves (1-3s)
- Use `cubicInOut` for smooth
- Good for: standard movements, reveals

### Slow moves (> 3s)
- Use `linear` or very gentle curves
- Good for: ambient, contemplative, drifting

### Organic moves
- Use `spring` for bounce
- Good for: playful, energetic, character

---

## Camera Motion Checklist

For each scene, verify:

- [ ] Does camera motion exist? (Even subtle breathing counts)
- [ ] Does camera motion match content action?
- [ ] Does camera motion enhance the emotional beat?
- [ ] Does camera continue through transitions?
- [ ] Is camera speed appropriate for content energy?
- [ ] Have I avoided random/meaningless motion?
- [ ] Does the motion guide viewer attention?

---

## Scene-by-Scene Camera Planning

### Template

```
Scene: [name]
Content action: [what's happening]
Emotional beat: [what should viewer feel]
Camera move: [type]
Timing: [start → end]
Reason: [why this camera move]
```

### Example: Birth → Growth → Release → Peace

```
Scene 1: Birth
Content: Point of light appears, ripples expand
Emotional: Discovery, curiosity
Camera: Push in (scale 1.8 → 1.0, 3s)
Reason: "Zooming in to discover what this is"

Scene 2: Growth
Content: Point splits into network
Emotional: Expansion, complexity
Camera: Pull out + rotate (scale 1.0 → 0.7, rotation 0 → 15, 4s)
Reason: "Pulling back to see the full network, rotation adds depth"

Scene 3: Release
Content: Explosion, particles scatter
Emotional: Impact, energy burst
Camera: Shake (0.2s) → Pull out fast (scale 0.7 → 0.4, 1s)
Reason: "Shake for impact, pull out to show explosion scale"

Scene 4: Peace
Content: Slow orbit, calm
Emotional: Serenity, completion
Camera: Breathing (scale 0.4 → 0.45 → 0.4, cycle 3s)
Reason: "Gentle breathing feels organic and peaceful"
```

---

## Integration with Other Guides

Camera motion works with:
- **transition-playbook.md** - Camera continues through transitions
- **motion-continuity.md** - Camera state carries between scenes
- **visual-storytelling.md** - Camera enhances narrative arc

---

## Summary: The Camera Mindset

**Stop thinking:** "Camera is just the viewport"

**Start thinking:** "Camera is an active participant in storytelling"

Every camera move should answer:
- **What is happening in this scene?**
- **How should the viewer feel?**
- **Where should attention be directed?**

When in doubt:
- Match camera direction to content direction
- Match camera speed to content energy
- Add at least gentle breathing motion
- Never reset camera at transitions

**The best camera work is felt, not noticed.**
