# Layering and Depth - Creating Rich Visuals

Read this when your scenes feel flat, empty, or amateur. This guide teaches how to create depth and richness through proper layering.

## The Core Problem

**Flat scene (单薄):**
```
1 background + 1 main element + 1 text = 3 layers
Result: Empty, amateur, PowerPoint-like
```

**Rich scene (丰满):**
```
Background atmosphere (8 layers) +
Main content (10 layers) +
Foreground details (5 layers) +
Effects and accents (5 layers) = 28 layers
Result: Professional, cinematic, alive
```

---

## The Three-Layer System

Every scene should have distinct depth layers:

### Background Layer (背景层)
**Purpose:** Establish space, atmosphere, context
**Characteristics:** Large, slow-moving, muted
**Count:** 5-10 elements

### Mid-ground Layer (中景层)
**Purpose:** Main content, focal points
**Characteristics:** Medium size, primary motion, vibrant
**Count:** 5-15 elements

### Foreground Layer (前景层)
**Purpose:** Details, frame, depth cues
**Characteristics:** Small or large (frame), fast-moving, accents
**Count:** 3-8 elements

---

## Background Layer Design

### Elements to Include

#### 1. Base Fill
```json
{
  "id": "bg-base",
  "kind": "rect",
  "width": 1920,
  "height": 1080,
  "material": {
    "gradient": {
      "type": "radial",
      "stops": [
        {"offset": 0, "color": "#1a1a2e"},
        {"offset": 1, "color": "#0a0a0f"}
      ]
    }
  }
}
```

**Never use solid colors.** Always gradients.

---

#### 2. Atmospheric Particles

50-100 small dots, slow drift:

```json
{
  "id": "bg-particle-01",
  "kind": "ellipse",
  "width": 3,
  "height": 3,
  "fill": "#ffffff",
  "transform": {"x": 200, "y": 300},
  "material": {
    "glow": {"color": "#ffffff", "blur": 5, "opacity": 0.3}
  },
  "keyframes": [
    {"at": 0, "x": 200, "y": 300, "opacity": 0.2},
    {"at": 8, "x": 250, "y": 200, "opacity": 0.4, "ease": "linear"}
  ]
}
// Repeat for bg-particle-02, 03, ... 50
```

**Pattern:** Random positions, slow drift, subtle opacity changes

---

#### 3. Large Geometric Shapes

Subtle depth and interest:

```json
{
  "id": "bg-shape-01",
  "kind": "ellipse",
  "width": 400,
  "height": 400,
  "stroke": "#2a2a4a",
  "stroke_width": 1,
  "transform": {"x": 100, "y": 100},
  "keyframes": [
    {"at": 0, "opacity": 0.1, "scale": 1},
    {"at": 10, "opacity": 0.15, "scale": 1.1, "ease": "cubicInOut"}
  ]
}
```

**Use:** 3-5 large circles, rectangles, or paths

---

#### 4. Texture/Noise Layer

Adds organic feeling:

```json
{
  "id": "bg-texture",
  "kind": "rect",
  "width": 1920,
  "height": 1080,
  "fill": "#ffffff",
  "material": {
    "gradient": {
      "type": "radial",
      "stops": [
        {"offset": 0, "color": "#00000000"},
        {"offset": 0.5, "color": "#11111111"},
        {"offset": 1, "color": "#00000000"}
      ]
    }
  },
  "keyframes": [
    {"at": 0, "opacity": 0.05}
  ]
}
```

---

### Background Motion Rules

1. **Slow:** 5-10x slower than main content
2. **Subtle:** Opacity 0.1-0.3
3. **Large movements:** drift 50-100px over scene duration
4. **Independent:** Each element on own timing

**Example timing:**
```javascript
// Main content: 0.5-2s actions
// Background: 5-10s actions
```

---

## Mid-ground Layer Design

This is your **main content**. Where the story happens.

### Primary Subject

The focal point:

```json
{
  "id": "main-core",
  "kind": "ellipse",
  "width": 80,
  "height": 80,
  "fill": "#66e8ff",
  "transform": {"x": 960, "y": 540},
  "material": {
    "glow": {"color": "#66e8ff", "blur": 40, "opacity": 0.8}
  }
}
```

---

### Supporting Elements

5-10 elements that relate to primary:

```json
{
  "id": "orbit-01",
  "kind": "ellipse",
  "width": 30,
  "height": 30,
  "fill": "#88ccff",
  "transform": {"x": 960, "y": 340},
  "material": {
    "glow": {"color": "#88ccff", "blur": 20, "opacity": 0.6}
  }
}
```

---

### Connections

Lines, paths showing relationships:

```json
{
  "id": "connection-01",
  "kind": "path",
  "points": [[960, 540], [960, 340]],
  "stroke": "#66e8ff",
  "stroke_width": 1,
  "material": {
    "glow": {"color": "#66e8ff", "blur": 8, "opacity": 0.4}
  }
}
```

---

### Secondary Details

Fill empty space:

```json
{
  "id": "detail-dot-01",
  "kind": "ellipse",
  "width": 8,
  "height": 8,
  "fill": "#aaccff",
  "transform": {"x": 800, "y": 600}
}
```

Add 5-10 of these in negative space.

---

### Mid-ground Motion Rules

1. **Active:** Primary motion happens here
2. **Clear:** Should be easy to follow
3. **Coordinated:** Elements move with purpose
4. **Contrasting:** Fast vs slow, big vs small

---

## Foreground Layer Design

### Elements to Include

#### 1. Frame Elements

Large shapes that create depth by occluding:

```json
{
  "id": "fg-frame-left",
  "kind": "rect",
  "width": 200,
  "height": 1080,
  "fill": "#000000",
  "transform": {"x": -100, "y": 0},
  "keyframes": [
    {"at": 0, "opacity": 0.3}
  ]
}
```

**Use:** Left/right/top bars that frame content

---

#### 2. Light Rays / Beams

```json
{
  "id": "fg-light-ray",
  "kind": "rect",
  "width": 4,
  "height": 1200,
  "fill": "#ffffff",
  "transform": {"x": 500, "y": -60, "rotation": 15},
  "material": {
    "gradient": {
      "type": "linear",
      "angle_deg": 0,
      "stops": [
        {"offset": 0, "color": "#ffffff00"},
        {"offset": 0.5, "color": "#ffffff33"},
        {"offset": 1, "color": "#ffffff00"}
      ]
    }
  },
  "keyframes": [
    {"at": 0, "x": 500, "opacity": 0.6},
    {"at": 6, "x": 700, "opacity": 0.3, "ease": "linear"}
  ]
}
```

**Use:** 2-4 diagonal rays drifting slowly

---

#### 3. Bokeh / Light Spots

```json
{
  "id": "fg-bokeh-01",
  "kind": "ellipse",
  "width": 60,
  "height": 60,
  "fill": "#ffffff",
  "transform": {"x": 1600, "y": 200},
  "material": {
    "gradient": {
      "type": "radial",
      "stops": [
        {"offset": 0, "color": "#ffffff44"},
        {"offset": 0.7, "color": "#ffffff11"},
        {"offset": 1, "color": "#ffffff00"}
      ]
    }
  },
  "keyframes": [
    {"at": 0, "opacity": 0.4, "scale": 1},
    {"at": 3, "opacity": 0.6, "scale": 1.2, "ease": "cubicInOut"},
    {"at": 6, "opacity": 0.4, "scale": 1, "ease": "cubicInOut"}
  ]
}
```

**Use:** 4-8 scattered, pulsing slowly

---

#### 4. Fast Moving Particles

```json
{
  "id": "fg-particle-01",
  "kind": "ellipse",
  "width": 4,
  "height": 4,
  "fill": "#ffffff",
  "transform": {"x": 100, "y": 600},
  "keyframes": [
    {"at": 0, "x": 100, "opacity": 0},
    {"at": 0.5, "x": 300, "opacity": 0.8, "ease": "linear"},
    {"at": 1.0, "x": 500, "opacity": 0, "ease": "linear"}
  ]
}
```

**Use:** 5-10 particles, fast motion across screen

---

#### 5. Scan Lines / Tech Elements

```json
{
  "id": "fg-scanline",
  "kind": "rect",
  "width": 1920,
  "height": 2,
  "fill": "#00ff00",
  "transform": {"x": 0, "y": 0},
  "keyframes": [
    {"at": 0, "y": 0, "opacity": 0.3},
    {"at": 2, "y": 1080, "opacity": 0.1, "ease": "linear"}
  ]
}
```

**Use:** For tech/digital themes

---

### Foreground Motion Rules

1. **Fast or Static:** Either very fast or framing
2. **High Contrast:** Bright or very dark
3. **Partial Opacity:** 0.2-0.6 typical
4. **Independent Timing:** Don't sync with main content

---

## The Element Count Formula

```
Minimum professional scene:
- Background: 8 elements
- Mid-ground: 10 elements
- Foreground: 5 elements
Total: 23 elements

Recommended range: 20-35 elements per scene
```

---

## Practical Example: "Growth" Scene

### Background Layer (10 elements)

```json
{
  "layers": [
    {"id": "bg-gradient", "kind": "rect", ...},
    {"id": "bg-particle-01", ...},
    {"id": "bg-particle-02", ...},
    {"id": "bg-particle-03", ...},
    {"id": "bg-particle-04", ...},
    {"id": "bg-particle-05", ...},
    {"id": "bg-shape-circle", "kind": "ellipse", ...},
    {"id": "bg-shape-rect", "kind": "rect", ...},
    {"id": "bg-line-01", "kind": "path", ...},
    {"id": "bg-texture", "kind": "rect", ...}
  ]
}
```

---

### Mid-ground Layer (12 elements)

```json
{
  "layers": [
    {"id": "main-core", ...},
    {"id": "orbit-north", ...},
    {"id": "orbit-east", ...},
    {"id": "orbit-south", ...},
    {"id": "orbit-west", ...},
    {"id": "connection-north", ...},
    {"id": "connection-east", ...},
    {"id": "connection-south", ...},
    {"id": "connection-west", ...},
    {"id": "detail-dot-01", ...},
    {"id": "detail-dot-02", ...},
    {"id": "text-label", ...}
  ]
}
```

---

### Foreground Layer (6 elements)

```json
{
  "layers": [
    {"id": "fg-light-ray-01", ...},
    {"id": "fg-light-ray-02", ...},
    {"id": "fg-bokeh-01", ...},
    {"id": "fg-bokeh-02", ...},
    {"id": "fg-particle-fast-01", ...},
    {"id": "fg-particle-fast-02", ...}
  ]
}
```

**Total: 28 elements** - Feels rich and professional

---

## Layer Separation Techniques

### Technique 1: Opacity Differentiation

```
Background: opacity 0.1-0.3
Mid-ground: opacity 0.8-1.0
Foreground: opacity 0.2-0.6
```

---

### Technique 2: Speed Differentiation

```
Background: Very slow (5-10s animations)
Mid-ground: Normal (0.5-3s animations)
Foreground: Very fast (0.2-1s animations)
```

---

### Technique 3: Size Differentiation

```
Background: Very large (500-2000px) or very small (2-5px)
Mid-ground: Medium (50-200px)
Foreground: Very large (frame elements) or small (particles 3-10px)
```

---

### Technique 4: Blur/Glow Differentiation

```
Background: No glow or subtle (blur 5-10)
Mid-ground: Strong glow (blur 20-40)
Foreground: Medium glow (blur 10-20) or none
```

---

## Common Composition Patterns

### Pattern 1: Center Focus

```
Background: Radial gradient from center
Mid-ground: Main content at center
Foreground: Frame elements on edges
```

**Use for:** Focal, important moments

---

### Pattern 2: Horizontal Flow

```
Background: Horizontal lines/gradients
Mid-ground: Elements moving left→right
Foreground: Vertical accents
```

**Use for:** Journey, progression

---

### Pattern 3: Depth Corridor

```
Background: Large distant elements
Mid-ground: Medium middle distance
Foreground: Large close elements (out of focus)
```

**Use for:** 3D feeling, depth

---

### Pattern 4: Scattered Field

```
Background: Even distribution
Mid-ground: Clustered groups
Foreground: Random accents
```

**Use for:** Organic, natural, chaos

---

## Fixing Flat Scenes

### Before (Flat - 5 elements)

```json
{
  "layers": [
    {"id": "bg", "kind": "rect", "fill": "#1a1a1a"},
    {"id": "circle-01", ...},
    {"id": "circle-02", ...},
    {"id": "circle-03", ...},
    {"id": "text", ...}
  ]
}
```

**Problems:**
- Only 5 elements
- No depth separation
- No atmosphere
- Feels empty

---

### After (Rich - 25 elements)

```json
{
  "layers": [
    // Background (8)
    {"id": "bg-gradient", ...},
    {"id": "bg-particle-01", ...},
    {"id": "bg-particle-02", ...},
    {"id": "bg-particle-03", ...},
    {"id": "bg-particle-04", ...},
    {"id": "bg-shape-01", ...},
    {"id": "bg-shape-02", ...},
    {"id": "bg-texture", ...},
    
    // Mid-ground (12)
    {"id": "circle-01-glow", ...},
    {"id": "circle-01", ...},
    {"id": "circle-02-glow", ...},
    {"id": "circle-02", ...},
    {"id": "circle-03-glow", ...},
    {"id": "circle-03", ...},
    {"id": "connection-01", ...},
    {"id": "connection-02", ...},
    {"id": "detail-01", ...},
    {"id": "detail-02", ...},
    {"id": "detail-03", ...},
    {"id": "text", ...},
    
    // Foreground (5)
    {"id": "fg-light-01", ...},
    {"id": "fg-light-02", ...},
    {"id": "fg-bokeh-01", ...},
    {"id": "fg-particle-01", ...},
    {"id": "fg-particle-02", ...}
  ]
}
```

**Improvements:**
- 25 elements
- Clear depth layers
- Atmospheric
- Professional

---

## Performance Considerations

### GPU-Friendly Techniques

**Good:**
- Many simple shapes (circles, rects)
- Opacity changes
- Position/scale/rotation

**Expensive:**
- Complex paths with many points
- Heavy blur (>50)
- Many gradients with many stops

**Guideline:**
- < 30 elements: No problem
- 30-50 elements: Good balance
- 50+ elements: Test performance

---

## Color Coordination Across Layers

### Monochromatic Depth

```
Background: Dark blue (#0a0e18)
Mid-ground: Medium blue (#1a3a5a)
Foreground: Bright blue (#66e8ff)
```

---

### Complementary Depth

```
Background: Cool (blues #0a1a2a)
Mid-ground: Mixed (blue-purple #3a3a5a)
Foreground: Warm accents (orange #ff8844)
```

---

### Saturation Depth

```
Background: Low saturation
Mid-ground: High saturation
Foreground: Medium saturation
```

---

## Verification Checklist

For each scene:

- [ ] **Background layer exists?** (5-10 elements)
- [ ] **Mid-ground has main content?** (5-15 elements)
- [ ] **Foreground adds depth?** (3-8 elements)
- [ ] **Total count 20-35 elements?**
- [ ] **Layers move at different speeds?**
- [ ] **Layers have different opacity ranges?**
- [ ] **No large empty spaces?**
- [ ] **Colors coordinated across layers?**

---

## Integration with Other Guides

Layering works with:
- **element-logic.md** - Each layer follows timing logic
- **cinematography.md** - Camera reveals depth
- **visual-storytelling.md** - Layers support narrative

---

## Summary: The Depth Mindset

**Stop thinking:** "One background, one main element"

**Start thinking:** "Three distinct depth layers, each with multiple elements"

Every scene should answer:
- **What's in the back?** (Atmosphere, context)
- **What's in the middle?** (Story, main action)
- **What's in the front?** (Details, frame, depth cues)

**Minimum professional standard: 20 elements**

The formula:
- 8 background elements (slow, muted)
- 10 mid-ground elements (active, clear)
- 5 foreground elements (fast or framing)

**Empty space is wasted opportunity.**

**The best depth is felt, not counted.**
