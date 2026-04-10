/**
 * Common GLSL Shaders
 *
 * Shared vertex shader and GLSL utility functions used by all post effects.
 */

// ============================================
// VERTEX SHADER (fullscreen quad)
// ============================================

/**
 * Standard vertex shader for fullscreen post-processing quad.
 * Renders a full-screen triangle pair and passes UV coordinates.
 */
export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// ============================================
// PASSTHROUGH FRAGMENT SHADER
// ============================================

/**
 * Simple passthrough — renders the input texture unchanged.
 * Used when no post effects are active.
 */
export const PASSTHROUGH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_texCoord);
}
`;

// ============================================
// GLSL UTILITY FUNCTIONS
// ============================================

/**
 * Common GLSL utility functions injected into all post effect shaders.
 * Provides noise, hash, color space conversions, etc.
 */
export const GLSL_UTILITIES = `
// --- Common utilities (auto-injected) ---

// Simple hash function
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 2D hash returning vec2
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Simple value noise
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Luminance (rec.709)
float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// RGB to HSL
vec3 rgb2hsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float l = (maxC + minC) * 0.5;
  if (maxC == minC) return vec3(0.0, 0.0, l);
  float d = maxC - minC;
  float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
  float h;
  if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  h /= 6.0;
  return vec3(h, s, l);
}

// Hex color to vec3 (for uniform binding from JS hex strings)
// Not used in GLSL directly — conversion happens on the JS side

// --- End common utilities ---
`;

// ============================================
// SHADER TEMPLATE HELPER
// ============================================

/**
 * Wraps a fragment shader body with the standard #version, precision,
 * uniform declarations, and common utilities.
 *
 * @param uniformDeclarations - Additional uniform declarations (e.g., "uniform float u_intensity;")
 * @param mainBody - The fragment shader main() body (without the function wrapper)
 * @returns Complete GLSL fragment shader source
 */
export function buildFragmentShader(
  uniformDeclarations: string,
  mainBody: string,
): string {
  return `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_frame;

${uniformDeclarations}

in vec2 v_texCoord;
out vec4 fragColor;

${GLSL_UTILITIES}

void main() {
${mainBody}
}
`;
}
