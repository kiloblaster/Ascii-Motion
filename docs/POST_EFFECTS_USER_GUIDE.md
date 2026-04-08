# Post Effects User Guide

## 🎨 What Are Post Effects?

Post effects are GPU-accelerated visual effects that are applied to the entire canvas as a final render pass. Unlike standard effects (which modify individual cell characters and colors), post effects operate on the rendered pixel output using WebGL shaders.

Think of it like camera filters applied on top of your finished artwork.

### Post Effects vs Standard Effects

| | Standard Effects | Post Effects |
|--|-----------------|--------------|
| **What they modify** | Cell characters and colors | Rendered pixels |
| **Where in pipeline** | Before canvas rendering | After canvas rendering |
| **Technology** | TypeScript/CPU | WebGL shaders/GPU |
| **Examples** | Remap Colors, Scatter, Levels | Blur, Glow, Chromatic Aberration |
| **Export support** | All formats | Image, Video, React, HTML only |

## 🚀 Getting Started

### Adding a Post Effect

1. Open the **right sidebar panel**
2. Find the **"Post Effects"** collapsible section
3. Click on an effect to add it (e.g., "Blur", "Glow")
4. The effect is added to the timeline spanning the full duration

### Viewing Post Effects in the Timeline

Post effects appear at the **top** of the timeline, above global effects and layers. They are shown with a distinctive **purple/magenta** color to distinguish them from standard effects.

## 📋 Available Post Effects

### Chromatic Aberration
Splits the red, green, and blue color channels, simulating lens color fringing.

| Property | Range | Default | Description |
|----------|-------|---------|-------------|
| Intensity | 0–50 | 5 | Pixel offset amount |
| Angle | 0–360° | 0 | Direction of aberration |
| Falloff | 0–1 | 0.5 | Radial falloff from center |

### Screen Distortion
Applies barrel, pincushion, or wave distortion to the image.

| Property | Range | Default | Description |
|----------|-------|---------|-------------|
| Amount | 0–1 | 0.3 | Distortion strength |
| Type | Barrel/Pincushion/Wave | Barrel | Distortion shape |
| Frequency | 0.1–10 | 1 | Wave frequency (wave type only) |
| Animate | On/Off | Off | Animate distortion over time |

### Glow
Adds a bloom/glow effect to bright areas of the image.

| Property | Range | Default | Description |
|----------|-------|---------|-------------|
| Intensity | 0–2 | 0.5 | Glow brightness |
| Radius | 1–50 | 10 | Glow spread in pixels |
| Threshold | 0–1 | 0.5 | Brightness threshold for glow |
| Color | Any color | #ffffff | Tint color for glow |

### Blur
Applies a Gaussian blur to soften the image.

| Property | Range | Default | Description |
|----------|-------|---------|-------------|
| Radius | 0–50 | 5 | Blur radius in pixels |

## ⏱️ Timeline Controls

### Adjusting Timing

Post effect blocks default to span the **entire timeline**. You can adjust their timing:

- **Drag** the block to move it to a different position
- **Drag the edges** to adjust start and end points
- **Click** to select and see properties in the panel

### Render Order (Stacking)

Post effects are applied in the order they appear in the timeline (top to bottom). Drag tracks to reorder them and change the processing order.

Example: Blur → Chromatic Aberration produces a different result than Chromatic Aberration → Blur.

### Enable/Disable

Each post effect has an **enable toggle** in its timeline row. Disabled effects are skipped during rendering without removing them.

## 🎹 Keyframing

Post effect properties can be keyframed to animate over time, following the same keyframe system as standard effects.

### Adding Keyframes

1. Select a post effect block in the timeline
2. Navigate to the desired frame
3. Click the **diamond icon** (◆) next to any property to toggle a keyframe
4. Change the property value — a keyframe is set at the current frame
5. Move to another frame and set a different value

### Interpolation

Properties interpolate linearly between keyframes. Numeric values smoothly transition, while select/boolean values snap at keyframe boundaries.

## 📤 Export Behavior

### Supported Formats

Post effects are applied during export for these formats:
- ✅ **Image** (PNG, JPEG) — applied to the exported frame
- ✅ **Video** (WebM, MP4) — applied to each frame during encoding
- ✅ **React Component** — included in the exported component
- ✅ **HTML** — included in the exported animation

### Unsupported Formats

These formats cannot render GPU shaders:
- ❌ **Text/Plaintext** — character-only output
- ❌ **JSON** — data format
- ❌ **Ink (React CLI)** — terminal rendering
- ❌ **OpenTUI** — terminal rendering
- ❌ **Bubbletea** — terminal rendering
- ❌ **Session** — project save format

For supported formats, you'll see an **"Include Post Effects"** toggle in the export dialog (enabled by default). For unsupported formats, a note indicates post effects will be excluded.

## 💡 Tips

- **Performance**: Post effects use GPU shaders, so they're very fast. However, stacking many effects with large radii may impact real-time preview performance.
- **Preview**: The canvas shows a real-time preview of all active post effects.
- **Combining effects**: Stack multiple post effects for complex looks (e.g., Glow + Chromatic Aberration for a retro CRT look).
- **Subtle is better**: Small values often produce the best results. Start with low intensity and adjust upward.
