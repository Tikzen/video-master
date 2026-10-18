# Transition Playbook

Read this when designing multi-scene videos, music videos, or any narrative work requiring scene transitions. This is internal Agent creative guidance, not a technical specification.

## The Purpose of Transitions

A transition is not just a technical necessity to move from Scene A to Scene B. **A transition is a narrative beat that gives meaning to the relationship between two scenes.**

Bad transitions feel like page flips in a slideshow. Good transitions feel like continuous flow, where one scene transforms into the next with purpose.

---

## Video-Master's Transition System

Video-Master already implements 7 transition types in `composition-transitions.js`. These are **real, working transitions** - not theoretical. Use them.

### Available Transition Types

```json
{
  "id": "scene-02",
  "transition": {
    "type": "wipe",
    "direction": "left",
    "duration_sec": 0.6
  }
}
```

**The 7 Types:**

1. **`cut`** - Instant switch, no transition
2. **`dissolve`** - Cross-fade between scenes
3. **`wipe`** - One scene pushes/reveals the next (supports `direction`: left/right/up/down)
4. **`push`** - Outgoing scene slides away as incoming slides in (supports `direction`)
5. **`zoom`** - Outgoing zooms out while incoming zooms in
6. **`flow`** - Organic liquid-like transition with edge highlights
7. **`iris`** - Circular reveal/conceal (supports `origin_x`, `origin_y`)

---

## The Three Levels of Transitions

### Level 1: Technical Transitions (Use Sparingly)

These have no narrative meaning - they're just ways to switch scenes.

- **`dissolve`** - Generic fade. Use only when you want to emphasize disconnection or time passage.
- **`cut`** - Hard switch. Use for musical hits or intentional jarring effect.

**When to use:** When the scenes are thematically separate, or you want to emphasize a break in continuity.

**Avoid:** Using these as your default. They make videos feel like slideshows.

---

### Level 2: Directional Transitions (Good Default)

These have spatial/temporal meaning through direction and movement.

#### **`wipe`** - The Reveal
- **Meaning:** "Here's what comes next" / "Time moves forward"
- **Direction semantics:**
  - `left`: Moving forward in time/space
  - `right`: Rewinding/flashback
  - `up`: Ascending/elevating/improving
  - `down`: Descending/grounding/deteriorating
- **When to use:** Scene relationships that are sequential, cause-effect, or comparative

**Example:**
```json
// Scene 1: Problem statement
// Transition: wipe left (moving forward)
// Scene 2: Solution demonstration
{
  "transition": {
    "type": "wipe",
    "direction": "left",
    "duration_sec": 0.5
  }
}
```

#### **`push`** - The Replacement
- **Meaning:** "This replaces that" / "New context"
- **Feels more forceful than wipe**
- **When to use:** When Scene B actively replaces or supersedes Scene A

#### **`zoom`** - Focus Shift
- **Meaning:** Outgoing scene loses importance, incoming gains focus
- **When to use:** Changing scale of concern (macro→micro or vice versa)

**Example:** Product overview → Close-up of feature

---

### Level 3: Organic Transitions (Best for Narrative)

These create a sense of continuous transformation rather than switching.

#### **`flow`** - Liquid Transformation
- **Meaning:** Organic evolution, metamorphosis, liquid continuity
- **Visual:** Scenes blend with flowing, liquid-like boundaries and edge highlights
- **When to use:** When scenes are different states of the same concept
- **Pairs well with:** Color continuity, shape evolution

**Example:**
```json
// Scene 1: Blue abstract particles
// Transition: flow (liquid metamorphosis)
// Scene 2: Red abstract waves
// Result: Particles seem to melt and reform into waves
{
  "transition": {
    "type": "flow",
    "direction": "down",
    "duration_sec": 0.8
  }
}
```

#### **`iris`** - Focus/Reveal
- **Meaning:** Looking through a lens, spotlight, or portal
- **Controlled by `origin_x`, `origin_y`** - where the iris is centered
- **When to use:** Entering/exiting a character's perspective, focusing on a detail, portal transitions

**Example - Zoom into detail:**
```json
{
  "transition": {
    "type": "iris",
    "origin_x": 0.7,    // Right side of screen
    "origin_y": 0.3,    // Upper area
    "duration_sec": 0.6
  }
}
```

---

## How to Choose a Transition

### Decision Framework

Ask these questions about your two scenes:

**1. What is their relationship?**
- Sequential (one after another) → `wipe` left
- Cause and effect → `flow` or `wipe`
- Contrasting/opposing → `push` or `wipe` with opposite directions
- Same subject, different view → `zoom` or `iris`
- Unrelated → `dissolve` (but reconsider if scenes are really unrelated)

**2. What emotion do you want?**
- Smooth/organic → `flow`
- Energetic/purposeful → `wipe` or `push`
- Dramatic focus → `iris` or `zoom`
- Contemplative → `dissolve`
- Shocking/abrupt → `cut`

**3. What's the pacing?**
- Fast-paced music/action → Shorter duration (0.3-0.5s), `wipe`/`push`
- Medium pace → 0.5-0.8s, any transition type
- Slow/emotional → Longer duration (0.8-1.2s), `flow`/`dissolve`

---

## Transition Duration Guidelines

```javascript
// Duration affects feel dramatically
{
  "duration_sec": 0.3   // Snappy, energetic, music video
  "duration_sec": 0.5   // Standard, professional
  "duration_sec": 0.8   // Smooth, organic
  "duration_sec": 1.2   // Slow, contemplative
}
```

**Rule of thumb:** Transition duration should be 10-20% of the shorter scene's duration, but never less than 0.3s or more than 1.5s.

---

## Common Patterns

### The Echo Pattern
Use the same transition type throughout, but vary direction or duration to create rhythm.

```
Scene 1 → wipe left (0.5s) → Scene 2 → wipe left (0.5s) → Scene 3 → wipe up (0.5s) → Scene 4
```

Creates coherence through repetition, variety through direction change.

### The Escalation Pattern
Start with subtle transitions, increase intensity.

```
Scene 1 → dissolve → Scene 2 → wipe → Scene 3 → push → Scene 4 → cut (climax)
```

### The Organic Flow Pattern
Use `flow` exclusively for abstract/artistic videos where everything feels connected.

```
Scene 1 → flow → Scene 2 → flow → Scene 3 → flow → Scene 4
```

Works best when scenes share visual elements (color, shapes, motion).

### The Portal Pattern
Use iris transitions to "zoom into" details or perspectives.

```
Overview → iris (focused on detail) → Close-up → iris (expand out) → New overview
```

---

## Anti-Patterns (Avoid These)

### ❌ All Cuts or All Dissolves
Makes your video feel like a PowerPoint presentation. **Use variety.**

### ❌ Random Transition Types
Don't pick transitions arbitrarily. Each should have a reason based on the scene relationship.

### ❌ Ignoring Direction
If you use `wipe` or `push`, the direction matters. Don't use `left` for one transition and `right` for the next unless there's a reason (like showing a back-and-forth).

### ❌ Too Long Duration
If your transition takes longer than 1.5s, it becomes the focus instead of the content. Only use long transitions intentionally.

### ❌ Fighting the Music
If your video has music, transitions should align with musical beats or phrases. A transition mid-phrase feels wrong.

---

## Practical Examples

### Example 1: 15-Second Product Showcase

```json
{
  "cues": [
    {
      "id": "intro",
      "start_sec": 0,
      "end_sec": 3,
      // Product floating in space
      "transition": {
        "type": "iris",
        "origin_x": 0.5,
        "origin_y": 0.5,
        "duration_sec": 0.5
      }
    },
    {
      "id": "feature-1",
      "start_sec": 3,
      "end_sec": 7,
      // Zoomed into first feature
      "transition": {
        "type": "wipe",
        "direction": "left",
        "duration_sec": 0.4
      }
    },
    {
      "id": "feature-2",
      "start_sec": 7,
      "end_sec": 11,
      // Second feature
      "transition": {
        "type": "wipe",
        "direction": "left",
        "duration_sec": 0.4
      }
    },
    {
      "id": "outro",
      "start_sec": 11,
      "end_sec": 15,
      // Pull back to full product + logo
      "transition": {
        "type": "zoom",
        "duration_sec": 0.6
      }
    }
  ]
}
```

**Rationale:**
- Iris into first view = focusing attention
- Wipe left between features = moving forward through features
- Zoom out at end = revealing the big picture

---

### Example 2: 30-Second Abstract Music Video

```json
{
  "cues": [
    {
      "id": "intro-sparse",
      "start_sec": 0,
      "end_sec": 8,
      // Minimal, single element
      "transition": {
        "type": "flow",
        "duration_sec": 0.8
      }
    },
    {
      "id": "build-complex",
      "start_sec": 8,
      "end_sec": 16,
      // Many elements, active
      "transition": {
        "type": "flow",
        "duration_sec": 0.6
      }
    },
    {
      "id": "drop-explosion",
      "start_sec": 16,
      "end_sec": 24,
      // Chaotic, explosive
      "transition": {
        "type": "push",
        "direction": "down",
        "duration_sec": 0.3
      }
    },
    {
      "id": "outro-minimal",
      "start_sec": 24,
      "end_sec": 30,
      // Return to simplicity
      "transition": null  // No transition, just ends
    }
  ]
}
```

**Rationale:**
- Flow transitions = organic evolution (intro through build)
- Fast push at drop = energetic break
- No transition at end = letting it breathe

---

## Advanced: Transition + Layer Continuity

**The most professional transitions combine the transition effect with visual elements that persist across scenes.**

### Example: Shared Element

```json
{
  "cues": [
    {
      "id": "scene-1",
      "layers": [
        {"id": "bg-1", ...},
        {
          "id": "shared-circle",
          "kind": "ellipse",
          "fill": "#ff5544",
          // This element continues into next scene
          "keyframes": [
            {"at": 0, "scale": 1},
            {"at": 2.5, "scale": 1.3, "x": 100}  // Moving during transition
          ]
        }
      ],
      "transition": {"type": "flow", "duration_sec": 0.8}
    },
    {
      "id": "scene-2",
      "start_sec": 3,
      "layers": [
        {"id": "bg-2", ...},
        {
          "id": "shared-circle-evolved",
          "kind": "ellipse",
          "fill": "#ff5544",  // Same color!
          // Continues the motion
          "transform": {"x": 100, "scale": 1.3},
          "keyframes": [
            {"at": 0, "scale": 1.3},
            {"at": 1.5, "scale": 1, "x": 0}
          ]
        }
      ]
    }
  ]
}
```

The circle seems to persist across the transition because:
1. Same color (#ff5544)
2. End state of scene 1 matches start state of scene 2
3. Flow transition makes it feel like continuous transformation

---

## Testing Your Transitions

After authoring your mv-plan.json, check:

1. **Watch the transition strips** - `motion-review.mjs` generates these
2. **Does each transition have a reason?** - Can you explain why you chose it?
3. **Do transitions match the music?** - If there's audio, are transitions on beats?
4. **Is there variety?** - Not all the same type?
5. **Do they enhance or distract?** - Transitions should be felt, not noticed

---

## Summary: The Transition Mindset

**Stop thinking:** "I need to switch from Scene A to Scene B"

**Start thinking:** "Scene A transforms into Scene B because [relationship]"

Every transition should answer: **What is the relationship between these two scenes?**

- Sequential → `wipe`
- Transformational → `flow`
- Perspective shift → `iris` or `zoom`
- Replacement → `push`
- Disconnected → `dissolve`
- Shock → `cut`

When in doubt, `flow` with 0.6-0.8s duration is rarely wrong for abstract or artistic content.
