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

Create a new file in `src/registry/postEffects/`:

```typescript
// src/registry/postEffects/myEffect.ts

import { Sparkles } from 'lucide-react';  // Choose an appropriate icon
import { registerPostEffect } from '../postEffectRegistry';
import { buildFragmentShader } from '../../utils/webgl/commonShaders';

// GLSL fragment shader
const FRAGMENT_SHADER = buildFragmentShader(
  // Uniform declarations (your effect's properties)
  `
    uniform float u_intensity;
    uniform float u_threshold;
  `,
  // Main shader body
  `
    vec4 color = texture(u_texture, v_texCoord);
    
    // Your effect logic here
    float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    if (brightness > u_threshold) {
      color.rgb *= 1.0 + u_intensity;
    }
    
    fragColor = color;
  `
);

// Register the effect
registerPostEffect({
  type: 'my-effect',
  name: 'My Effect',
  icon: Sparkles,
  category: 'color',  // 'distortion' | 'blur' | 'glow' | 'color'
  description: 'Description of what this effect does.',
  
  // Default settings (must match property definitions)
  defaultSettings: {
    intensity: 0.5,
    threshold: 0.5,
  },
  
  // Property definitions (drive the UI and keyframe system)
  propertyDefinitions: [
    {
      path: 'intensity',
      displayName: 'Intensity',
      category: 'main',
      valueType: 'number',
      defaultValue: 0.5,
      interpolation: 'linear',
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      path: 'threshold',
      displayName: 'Threshold',
      category: 'main',
      valueType: 'number',
      defaultValue: 0.5,
      interpolation: 'linear',
      min: 0,
      max: 1,
      step: 0.01,
    },
  ],
  
  // The compiled fragment shader
  fragmentShader: FRAGMENT_SHADER,
});
```

## Step 2: Register the Effect

Add your effect to the registration entry point:

```typescript
// src/registry/postEffects/index.ts

import './myEffect';  // Add this import

export function registerAllPostEffects(): void {
  // Effects are registered via side-effect imports
  import('./chromaticAberration');
  import('./screenDistortion');
  import('./glow');
  import('./blur');
  import('./myEffect');  // Add your effect
}
```

## Step 3: Add Default Settings

Add your effect's default settings interface and constants:

```typescript
// src/constants/postEffectDefaults.ts

export interface MyEffectSettings {
  intensity: number;
  threshold: number;
}

export const DEFAULT_MY_EFFECT_SETTINGS: MyEffectSettings = {
  intensity: 0.5,
  threshold: 0.5,
};
```

## 🎨 GLSL Shader Reference

### Standard Uniforms (Available in All Shaders)

| Uniform | Type | Description |
|---------|------|-------------|
| `u_texture` | `sampler2D` | Input texture (previous pass output or Canvas2D) |
| `u_resolution` | `vec2` | Canvas dimensions in pixels |
| `u_time` | `float` | Current time in seconds |
| `u_frame` | `float` | Current frame number |

### Per-Effect Uniforms

Property definitions are automatically mapped to uniforms with a `u_` prefix:
- Property path `intensity` → uniform `u_intensity`
- Property path `threshold` → uniform `u_threshold`

### Common GLSL Utilities

The `buildFragmentShader()` helper injects these utilities:

```glsl
// Random number generation
float random(vec2 st);

// 2D noise
float noise(vec2 st);

// Color space conversions
vec3 rgb2hsv(vec3 c);
vec3 hsv2rgb(vec3 c);
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

// Your uniforms here
uniform float u_intensity;

void main() {
    vec4 color = texture(u_texture, v_texCoord);
    
    // Your effect logic
    
    fragColor = color;
}
```

## 🔄 Multi-Pass Effects

For effects requiring multiple passes (like separable blur), use the `passes`, `passShaders`, and `passUniforms` fields:

```typescript
registerPostEffect({
  type: 'my-multipass-effect',
  // ...
  
  passes: 2,  // Number of passes
  
  // Shader for each pass (falls back to fragmentShader if not specified)
  passShaders: [
    HORIZONTAL_PASS_SHADER,  // Pass 0
    VERTICAL_PASS_SHADER,    // Pass 1
  ],
  
  // Override uniforms per pass
  passUniforms: [
    { direction: 0 },  // Pass 0: horizontal
    { direction: 1 },  // Pass 1: vertical
  ],
});
```

The WebGL processor uses ping-pong framebuffers: pass N reads from the output of pass N-1. The last pass of the last effect renders directly to the display canvas.

## 🎹 Property Types

| valueType | GLSL Type | Description |
|-----------|-----------|-------------|
| `'number'` | `float` | Numeric slider/input |
| `'boolean'` | `int` (0/1) | Toggle switch |
| `'color'` | `vec3` (normalized RGB) | Color picker |
| `'select'` | `float` | Dropdown (needs `options` array) |

### Select Properties with Shader Branching

```typescript
{
  path: 'type',
  displayName: 'Type',
  valueType: 'select',
  defaultValue: 'barrel',
  options: [
    { value: 'barrel', label: 'Barrel' },
    { value: 'pincushion', label: 'Pincushion' },
    { value: 'wave', label: 'Wave' },
  ],
}
```

In the shader, use conditional branching:
```glsl
uniform float u_type;  // 0.0 = barrel, 1.0 = pincushion, 2.0 = wave

if (u_type < 0.5) {
    // barrel distortion
} else if (u_type < 1.5) {
    // pincushion distortion
} else {
    // wave distortion
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

## 📁 File Structure

```
src/
├── registry/
│   ├── postEffectRegistry.ts          # Registry (register/get/getAll)
│   └── postEffects/
│       ├── index.ts                   # Registration entry point
│       ├── chromaticAberration.ts     # Chromatic Aberration effect
│       ├── screenDistortion.ts        # Screen Distortion effect
│       ├── glow.ts                    # Glow (bloom) effect
│       ├── blur.ts                    # Gaussian Blur effect
│       └── myEffect.ts               # Your new effect
├── utils/
│   ├── webgl/
│   │   ├── WebGLPostProcessor.ts      # WebGL2 rendering engine
│   │   ├── shaderCompiler.ts          # Shader compilation/caching
│   │   └── commonShaders.ts           # Shared GLSL code
│   └── postEffectsPipeline.ts         # Keyframe evaluation & pipeline
├── types/
│   └── postEffect.ts                  # Type definitions
└── constants/
    └── postEffectDefaults.ts          # Default settings
```
