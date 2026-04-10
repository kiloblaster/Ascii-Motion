# Post Effects Developer Guide

## 🎯 Adding New Post Effects to ASCII Motion

This guide explains how to create new GPU-accelerated post effects using WebGL shaders. Post effects operate on **pixels** (not cells) and are applied as the final render pass after Canvas2D rendering.

## 📋 Prerequisites

Before adding a new post effect, you should understand:
- GLSL (OpenGL Shading Language) for fragment shaders
- Basic WebGL2 concepts (textures, uniforms, framebuffers)
- The existing post effects registry pattern
- TypeScript and the project's module structure

## 🏗️ Architecture Overview

```
Cell Data → Layer Compositing → Global Effects (cells)
  → Render to Canvas 2D
  → Upload as WebGL texture
  → Post Effect Pass 1 (e.g., Blur)
  → Post Effect Pass 2 (e.g., Chromatic Aberration)
  → ... (stacked in timeline order)
  → Final WebGL output → Display canvas
```

Post effects are fundamentally different from standard (cell-based) effects:

| Aspect | Standard Effects | Post Effects |
|--------|-----------------|--------------|
| Operates on | Cell data (Map<string, Cell>) | Pixel data (WebGL textures) |
| Written in | TypeScript | GLSL shaders |
| Pipeline position | Before Canvas2D render | After Canvas2D render |
| Rendering | CPU | GPU (WebGL2) |
| Multi-pass | N/A | Supported (ping-pong framebuffers) |

## Step 1: Create the Effect File

Create a new file in `src/registry/postEffects/`. Export a `PostEffectRegistryEntry` object:

```typescript
// src/registry/postEffects/pixelate.ts

import { Grid3X3 } from 'lucide-react';
import type { PostEffectRegistryEntry } from '../postEffectRegistry';
import type { PostEffectPropertyDefinition } from '../../types/postEffect';
import { DEFAULT_PIXELATE_SETTINGS } from '../../constants/postEffectDefaults';
import { buildFragmentShader } from '../../utils/webgl/commonShaders';

const propertyDefinitions: PostEffectPropertyDefinition[] = [
  {
    path: 'pixelSize',
    displayName: 'Pixel Size',
    category: 'Pixelate',
    valueType: 'number',
    defaultValue: DEFAULT_PIXELATE_SETTINGS.pixelSize,
    interpolation: 'numeric',
    min: 1,
    max: 100,
    step: 1,
    unit: 'px',
  },
];

const fragmentShader = buildFragmentShader(
  // Uniform declarations (auto-prefixed properties become u_propertyName)
  `uniform float u_pixelSize;`,
  // Main shader body
  `  vec2 cellSize = vec2(u_pixelSize) / u_resolution;
  vec2 snapped = cellSize * floor(v_texCoord / cellSize) + cellSize * 0.5;
  fragColor = texture(u_texture, snapped);`,
);

export const pixelateEffect: PostEffectRegistryEntry = {
  type: 'pixelate',
  name: 'Pixelate',
  icon: Grid3X3,
  category: 'distortion',
  description: 'Crisp nearest-neighbor mosaic effect',
  defaultSettings: { ...DEFAULT_PIXELATE_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  fragmentShader,
};
```

## Step 2: Register the Effect

Import and add your effect to the registration array in `src/registry/postEffects/index.ts`:

```typescript
import { pixelateEffect } from './pixelate';

export function registerAllPostEffects(): void {
  const effects = [
    chromaticAberrationEffect,
    screenDistortionEffect,
    glowEffect,
    blurEffect,
    pixelateEffect,  // Add your effect here
  ];

  for (const effect of effects) {
    try {
      registerPostEffect(effect);
    } catch {
      // Already registered — skip
    }
  }
}
```

## Step 3: Add Default Settings

Add your effect's settings interface, defaults, and UI definition in `src/constants/postEffectDefaults.ts`:

```typescript
// 1. Interface and defaults
export interface PixelateSettings {
  pixelSize: number;
}

export const DEFAULT_PIXELATE_SETTINGS: PixelateSettings = {
  pixelSize: 8,
};

// 2. Add to POST_EFFECT_DEFINITIONS array
{
  id: 'pixelate',
  name: 'Pixelate',
  icon: 'Grid3X3',
  description: 'Crisp nearest-neighbor mosaic effect',
  category: 'distortion',
}
```

That's it — no other files need changing. The UI, timeline, keyframe system, export pipeline, undo/redo, and serialization all pick up the new effect automatically from the registry.

## 🎨 GLSL Shader Reference

### Standard Uniforms (Available in All Shaders)

| Uniform | Type | Description |
|---------|------|-------------|
| `u_texture` | `sampler2D` | Input texture (previous pass output or Canvas2D) |
| `u_resolution` | `vec2` | Canvas dimensions in pixels |
| `u_time` | `float` | Current time in seconds |
| `u_frame` | `float` | Current frame number |
| `u_bgColor` | `vec3` | Canvas background color (normalized 0–1 RGB) |

### Per-Effect Uniforms

Property definitions are automatically mapped to uniforms with a `u_` prefix:
- Property path `intensity` → uniform `u_intensity`
- Property path `pixelSize` → uniform `u_pixelSize`

### Common GLSL Utilities

The `buildFragmentShader()` helper injects these utilities:

```glsl
float random(vec2 st);
float noise(vec2 st);
vec3 rgb2hsv(vec3 c);
vec3 hsv2rgb(vec3 c);
float luminance(vec3 c);
```

### Shader Template

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_frame;
uniform vec3 u_bgColor;

// Your uniforms here
uniform float u_intensity;

void main() {
    vec4 color = texture(u_texture, v_texCoord);
    
    // Your effect logic
    
    fragColor = color;
}
```

## 🔄 Multi-Pass Effects

For effects requiring multiple passes (like separable blur or bloom), use the `passes`, `passShaders`, and `passUniforms` fields:

```typescript
export const myEffect: PostEffectRegistryEntry = {
  type: 'my-multipass-effect',
  // ...
  
  passes: 2,
  
  // Shader for each pass (falls back to fragmentShader if not specified)
  passShaders: [
    HORIZONTAL_PASS_SHADER,  // Pass 0
    VERTICAL_PASS_SHADER,    // Pass 1
  ],
  
  // Override uniforms per pass (optional)
  passUniforms: [
    { direction: 0 },  // Pass 0: horizontal
    { direction: 1 },  // Pass 1: vertical
  ],
};
```

The WebGL processor uses ping-pong framebuffers: pass N reads from the output of pass N-1. The last pass of the last effect renders directly to the display canvas.

**`u_original` texture:** For multi-pass effects, `u_original` (texture unit 1) is automatically bound to the input texture from *before* the effect's passes began. This allows a final composite pass to blend its result with the pre-effect scene (e.g., glow overlays blurred highlights onto the original). The processor uses a dedicated snapshot texture to preserve this input even when ping-pong writes would overwrite the source framebuffer.

## 🎹 Property Types

| valueType | GLSL Type | Description |
|-----------|-----------|-------------|
| `'number'` | `float` | Numeric slider/drag-to-adjust input |
| `'boolean'` | `float` (0.0/1.0) | Toggle switch |
| `'color'` | `vec3` (normalized RGB) | App color picker |
| `'select'` | `float` (option index) | Dropdown (needs `options` array) |

### Conditional Visibility

Properties can be shown/hidden based on another property's value:

```typescript
{
  path: 'frequency',
  displayName: 'Frequency',
  // ...
  visibleWhen: { path: 'type', values: ['wave'] },
}
```

### Select Properties with Shader Branching

```typescript
{
  path: 'type',
  displayName: 'Type',
  valueType: 'select',
  defaultValue: 'barrel',
  options: [
    { value: 'barrel', label: 'Barrel' },      // → u_type = 0.0
    { value: 'pincushion', label: 'Pincushion' }, // → u_type = 1.0
    { value: 'wave', label: 'Wave' },           // → u_type = 2.0
  ],
}
```

In the shader, use conditional branching on the option index:
```glsl
uniform float u_type;

if (u_type < 0.5) {
    // barrel (index 0)
} else if (u_type < 1.5) {
    // pincushion (index 1)
} else {
    // wave (index 2)
}
```

## ⚡ Performance Tips

1. **Minimize texture lookups** — each `texture()` call is expensive
2. **Use separable passes** for blur-like effects (2 passes of 1D blur = much faster than 1 pass of 2D blur)
3. **Avoid branching in inner loops** — GPUs prefer branchless math
4. **Pre-compute constants** — move calculations out of the fragment shader when possible
5. **Keep pass count low** — each pass requires a framebuffer swap and full-screen quad draw

## 🧪 Testing

1. Add the effect, rebuild, and check the browser console for shader compilation errors
2. Test with the WebGL debug tools (Spector.js, Chrome WebGL Inspector)
3. Verify keyframe interpolation by adding keyframes at different frames
4. Test multi-pass effects by checking intermediate framebuffer outputs
5. Verify export integration by exporting an image/video with the effect active
6. Test stacking: ensure the effect works at any position in the shader stack

## 🌐 Gallery Integration

When adding a new shader, you must also update the **gallery shader pipeline** so that the publish dialog preview, gallery cards, and project detail views render the effect correctly.

The gallery uses a **self-contained** WebGL pipeline (no dependency on the main app's registry or stores). This file lives in two locations and must be updated in **both**:

1. `packages/premium/src/community/utils/galleryShaderPipeline.ts`
2. `packages/web/marketing/lib/gallery/galleryShaderPipeline.ts`

These two files are identical copies. Changes must be made to both.

### Steps to Add a Shader to the Gallery Pipeline

**1. Add the GLSL fragment shader source**

Near the top of `galleryShaderPipeline.ts`, find the GLSL shader string constants. Add a new `const` with your shader's fragment source, using the `buildFrag()` helper:

```typescript
const PIXELATE_FRAG = buildFrag(
  `uniform float u_pixelSize;`,
  `  vec2 cellSize = vec2(u_pixelSize) / u_resolution;
  vec2 snapped = cellSize * floor(v_texCoord / cellSize) + cellSize * 0.5;
  fragColor = texture(u_texture, snapped);`
);
```

**2. Add a `SHADER_REGISTRY` entry**

Find the `SHADER_REGISTRY` map and add an entry for your effect type:

```typescript
SHADER_REGISTRY.set('pixelate', {
  fragmentShader: PIXELATE_FRAG,
  passes: 1,
  propertyDefs: [
    { path: 'pixelSize', type: 'number', default: 3 },
  ],
});
```

For multi-pass effects, also add `passShaders` and `passUniforms`:

```typescript
SHADER_REGISTRY.set('myMultiPass', {
  fragmentShader: DEFAULT_FRAG,         // fallback
  passes: 2,
  passShaders: [HORIZONTAL_FRAG, VERTICAL_FRAG],
  passUniforms: [{ direction: 0 }, { direction: 1 }],
  propertyDefs: [
    { path: 'radius', type: 'number', default: 10 },
  ],
});
```

**3. Keep property definitions in sync**

The `propertyDefs` array in the gallery pipeline must match the property definitions in the main app's `src/registry/postEffects/yourEffect.ts`. The property `path`, `type`, and `default` values must be identical so that keyframe data from the timeline serializes and evaluates correctly.

### Why Duplicated?

The `packages/premium` and `packages/web` packages are separate build targets that cannot import from `src/` (the main app). The gallery pipeline embeds all GLSL sources and property metadata directly to remain dependency-free.

## 📁 File Structure

```
src/
├── registry/
│   ├── postEffectRegistry.ts          # Registry (register/get/getAll)
│   └── postEffects/
│       ├── index.ts                   # Registration entry point
│       ├── chromaticAberration.ts     # Chromatic Aberration
│       ├── screenDistortion.ts        # Screen Distortion
│       ├── glow.ts                    # Glow (bloom, 3-pass)
│       ├── blur.ts                    # Blur (gaussian/box/radial/zoom, 2-pass)
│       └── pixelate.ts               # Pixelate (mosaic)
├── utils/
│   ├── webgl/
│   │   ├── WebGLPostProcessor.ts      # WebGL2 rendering engine
│   │   ├── shaderCompiler.ts          # Shader compilation/caching (per-context)
│   │   └── commonShaders.ts           # Shared GLSL code
│   └── postEffectsPipeline.ts         # Keyframe evaluation & pipeline
├── types/
│   └── postEffect.ts                  # Type definitions
└── constants/
    └── postEffectDefaults.ts          # Default settings & UI definitions

packages/
├── premium/src/community/utils/
│   └── galleryShaderPipeline.ts       # Gallery shader pipeline (premium)
└── web/marketing/lib/gallery/
    └── galleryShaderPipeline.ts       # Gallery shader pipeline (web, identical copy)
```
