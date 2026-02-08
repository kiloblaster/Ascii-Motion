/**
 * Timeline & Layer System Types
 * 
 * Part of the Layer Timeline Refactor (v2.0.0)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md
 */

import type { Cell } from './index';

// ============================================
// BRANDED ID TYPES
// ============================================

declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

export type LayerId = Brand<string, 'LayerId'>;
export type LayerGroupId = Brand<string, 'LayerGroupId'>;
export type ContentFrameId = Brand<string, 'ContentFrameId'>;
export type KeyframeId = Brand<string, 'KeyframeId'>;
export type PropertyTrackId = Brand<string, 'PropertyTrackId'>;

// ============================================
// ID GENERATION HELPERS
// ============================================

let layerCounter = 0;
let contentFrameCounter = 0;
let keyframeCounter = 0;
let propertyTrackCounter = 0;
let layerGroupCounter = 0;

export function generateLayerId(): LayerId {
  return `layer-${++layerCounter}-${Date.now().toString(36)}` as LayerId;
}

export function generateLayerGroupId(): LayerGroupId {
  return `group-${++layerGroupCounter}-${Date.now().toString(36)}` as LayerGroupId;
}

export function generateContentFrameId(): ContentFrameId {
  return `cf-${++contentFrameCounter}-${Date.now().toString(36)}` as ContentFrameId;
}

export function generateKeyframeId(): KeyframeId {
  return `kf-${++keyframeCounter}-${Date.now().toString(36)}` as KeyframeId;
}

export function generatePropertyTrackId(): PropertyTrackId {
  return `pt-${++propertyTrackCounter}-${Date.now().toString(36)}` as PropertyTrackId;
}

/**
 * Reset ID counters — used in tests and when creating new projects.
 */
export function resetIdCounters(): void {
  layerCounter = 0;
  contentFrameCounter = 0;
  keyframeCounter = 0;
  propertyTrackCounter = 0;
  layerGroupCounter = 0;
}

// ============================================
// LAYER SYSTEM
// ============================================

/**
 * A layer in the composition. Contains content frames (ASCII data)
 * and transform property tracks with keyframes.
 */
export interface Layer {
  id: LayerId;
  name: string;

  // Visibility & interaction
  visible: boolean;        // Eyeball icon — affects render and export
  solo: boolean;           // Solo mode — only render this layer
  locked: boolean;         // Prevent editing

  // Content frames (ASCII canvas data with duration)
  contentFrames: ContentFrame[];

  // Transform property tracks (keyframeable)
  propertyTracks: PropertyTrack[];

  // Static property values (non-keyframed)
  // Used when a property has no track — provides layer-specific defaults
  // instead of the global PROPERTY_DEFINITIONS default.
  staticProperties: Record<string, number>;

  // Layer-level settings
  opacity: number;         // 0-100, default 100

  // Group membership (optional)
  parentGroupId?: LayerGroupId;
}

/**
 * A layer group for organizational and transform purposes.
 * Groups have their own transform properties that apply to all child layers.
 * Single nesting level only — groups cannot contain other groups.
 */
export interface LayerGroup {
  id: LayerGroupId;
  name: string;
  childLayerIds: LayerId[];

  // Visibility & interaction (cascades to children)
  visible: boolean;
  solo: boolean;
  locked: boolean;
  collapsed: boolean;      // UI collapsed state in timeline

  // Group-level transform tracks
  propertyTracks: PropertyTrack[];
}

/**
 * A content frame represents a segment of ASCII canvas data
 * with a start time and duration. Users can drag edges to
 * adjust duration in the timeline.
 */
export interface ContentFrame {
  id: ContentFrameId;
  name: string;

  // Timing (in frames, not milliseconds)
  startFrame: number;      // When this content starts
  durationFrames: number;  // How long it lasts (draggable edges)

  // Canvas data for this frame
  data: Map<string, Cell>; // Key: "x,y" coordinate string

  // Optional thumbnail for timeline display
  thumbnail?: string;      // Base64 data URL
}

/**
 * A property track contains keyframes for a single animatable property.
 * Examples: position.x, position.y, scale, rotation, opacity, anchorPoint.x
 */
export interface PropertyTrack {
  id: PropertyTrackId;
  propertyPath: PropertyPath;
  keyframes: Keyframe[];

  // Loop behavior
  loopKeyframes: boolean;  // Loop keyframe pattern until end of timeline
}

/**
 * Known property paths that can be keyframed.
 */
export type PropertyPath =
  // Transform properties
  | 'transform.position.x'
  | 'transform.position.y'
  | 'transform.scale'        // Uniform scale (1.0 = 100%)
  | 'transform.rotation'     // Degrees (1° increments)
  | 'transform.anchorPoint.x'
  | 'transform.anchorPoint.y'
  // Future: effect properties
  | `effect.${string}.${string}`;

/**
 * Property metadata for UI display and validation.
 */
export interface PropertyDefinition {
  path: PropertyPath;
  displayName: string;
  category: 'transform' | 'effect' | 'style';
  valueType: 'number' | 'boolean' | 'string' | 'color';
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;  // 'px', '%', '°', etc.
}

/**
 * Registry of all keyframeable properties.
 */
export const PROPERTY_DEFINITIONS: Partial<Record<PropertyPath, PropertyDefinition>> = {
  'transform.position.x': {
    path: 'transform.position.x',
    displayName: 'Position X',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    step: 1,
    unit: 'cells',
  },
  'transform.position.y': {
    path: 'transform.position.y',
    displayName: 'Position Y',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    step: 1,
    unit: 'cells',
  },
  'transform.scale': {
    path: 'transform.scale',
    displayName: 'Scale',
    category: 'transform',
    valueType: 'number',
    defaultValue: 1,
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: 'x',
  },
  'transform.rotation': {
    path: 'transform.rotation',
    displayName: 'Rotation',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    min: -3600,   // Allow multiple rotations
    max: 3600,
    step: 1,      // 1° increments
    unit: '°',
  },
  'transform.anchorPoint.x': {
    path: 'transform.anchorPoint.x',
    displayName: 'Anchor X',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    step: 1,
    unit: 'cells',
  },
  'transform.anchorPoint.y': {
    path: 'transform.anchorPoint.y',
    displayName: 'Anchor Y',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    step: 1,
    unit: 'cells',
  },
};

// ============================================
// KEYFRAME SYSTEM
// ============================================

/**
 * A single keyframe on a property track.
 */
export interface Keyframe {
  id: KeyframeId;
  frame: number;           // Frame number (not milliseconds)
  value: number | boolean | string;
  easing: EasingCurve;
}

/**
 * Cubic bezier easing curve definition.
 * Control points: (0,0) -> (x1,y1) -> (x2,y2) -> (1,1)
 */
export interface EasingCurve {
  type: EasingPreset | 'custom';
  // For custom curves:
  x1?: number;  // 0-1
  y1?: number;  // Can be < 0 or > 1 for overshoot
  x2?: number;  // 0-1
  y2?: number;  // Can be < 0 or > 1 for overshoot
}

/**
 * Preset easing types.
 */
export type EasingPreset =
  | 'linear'
  | 'hold'           // No interpolation, jump to next value
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'ease-out-back'  // Slight overshoot
  | 'ease-in-back'
  | 'bounce';

/**
 * Preset easing curve values (cubic bezier control points: [x1, y1, x2, y2]).
 */
export const EASING_PRESETS: Record<EasingPreset, [number, number, number, number]> = {
  'linear': [0, 0, 1, 1],
  'hold': [0, 0, 0, 0],  // Special case: no interpolation
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  'ease-out-back': [0.34, 1.56, 0.64, 1],
  'ease-in-back': [0.36, 0, 0.66, -0.56],
  'bounce': [0.34, 1.4, 0.64, 1],
};

// ============================================
// TIMELINE STATE
// ============================================

/**
 * Global timeline configuration.
 */
export interface TimelineConfig {
  frameRate: number;       // FPS (e.g., 12, 24, 30, 60)
  durationFrames: number;  // Total timeline length in frames

  // Derived (computed)
  durationMs: number;      // Total duration in milliseconds
}

/**
 * Timeline view state (UI).
 */
export interface TimelineViewState {
  activeView: 'frames' | 'layers';  // Tab selection

  // Playhead position
  currentFrame: number;
  isPlaying: boolean;
  looping: boolean;

  // Selection
  activeLayerId: LayerId | null;
  selectedLayerIds: Set<LayerId>;
  selectedKeyframeIds: Set<KeyframeId>;
  selectedContentFrameIds: Set<ContentFrameId>;

  // UI state
  zoom: number;            // Timeline zoom level
  scrollX: number;         // Horizontal scroll position
  panelHeight: number;     // Resizable panel height in pixels

  // Property editing
  editingKeyframeId: KeyframeId | null;

  // Layer expand/collapse state
  expandedLayerIds: Set<LayerId>;

  // Layer properties panel visibility
  showLayerProperties: boolean;

  // Transient drag preview for content frame reordering
  contentFrameDragPreview: {
    /** Layer the frame is being dragged FROM */
    sourceLayerId: LayerId;
    /** Layer the frame would drop INTO */
    targetLayerId: LayerId;
    frameId: ContentFrameId;
    /** Pixel left of the ghost block (absolute within track) */
    ghostLeftPx: number;
    /** Width of the dragged frame in px */
    ghostWidthPx: number;
    /** Frame position of the slot boundary (for the indicator line) */
    slotFrame: number;
  } | null;
}

/**
 * Timecode display format.
 */
export type TimecodeFormat =
  | 'frames'           // "Frame 24"
  | 'seconds'          // "1.5s"
  | 'timecode'         // "00:01:12" (MM:SS:FF)
  | 'milliseconds';    // "1500ms"

// ============================================
// EFFECTS SYSTEM EXTENSION
// ============================================

/**
 * Effect application scope.
 */
export type EffectScope = 'layer' | 'global';

/**
 * Effect instance with keyframeable properties.
 */
export interface EffectInstance {
  id: string;
  effectType: string;      // e.g., 'wave', 'colorShift', 'blur'
  scope: EffectScope;
  layerId?: LayerId;       // Required when scope is 'layer'
  enabled: boolean;
  propertyTracks: PropertyTrack[];  // Keyframeable effect properties
  order: number;           // Render order (lower = applied first)
}

// ============================================
// SESSION FORMAT V2
// ============================================

/**
 * Session data format version 2.0.0 with layer support.
 */
export interface SessionDataV2 {
  version: '2.0.0';

  // Project metadata
  name?: string;
  description?: string;
  metadata?: {
    exportedAt: string;
    exportVersion: string;
    userAgent?: string;
  };

  // Canvas settings (shared across all layers)
  canvas: {
    width: number;
    height: number;
    canvasBackgroundColor: string;
    showGrid: boolean;
  };

  // Timeline configuration
  timeline: {
    frameRate: number;
    durationFrames: number;
    looping: boolean;
  };

  // Layer data (NEW — replaces animation.frames)
  layers: SessionLayerV2[];

  // Layer groups (NEW)
  layerGroups?: SessionLayerGroupV2[];

  // Global effects (NEW)
  globalEffects?: SessionEffectV2[];

  // Preserved from v1
  tools?: Record<string, unknown>;
  ui?: Record<string, unknown>;
  typography?: Record<string, unknown>;
  palettes?: Record<string, unknown>;
  characterPalettes?: Record<string, unknown>;
}

/**
 * Serialized layer for session files.
 */
export interface SessionLayerV2 {
  id: string;
  name: string;
  visible: boolean;
  solo: boolean;
  locked: boolean;
  opacity: number;

  // Group membership (if layer is in a group)
  parentGroupId?: string;

  // Content frames (serialized — Map converted to Record)
  contentFrames: SessionContentFrameV2[];

  // Property tracks (serialized)
  propertyTracks: SessionPropertyTrackV2[];
}

/**
 * Serialized content frame.
 */
export interface SessionContentFrameV2 {
  id: string;
  name: string;
  startFrame: number;
  durationFrames: number;
  data: Record<string, Cell>;  // Object form for JSON serialization
}

/**
 * Serialized property track.
 */
export interface SessionPropertyTrackV2 {
  id: string;
  propertyPath: string;
  loopKeyframes: boolean;
  keyframes: SessionKeyframeV2[];
}

/**
 * Serialized keyframe.
 */
export interface SessionKeyframeV2 {
  id: string;
  frame: number;
  value: number | boolean | string;
  easing: EasingCurve;
}

/**
 * Serialized layer group.
 */
export interface SessionLayerGroupV2 {
  id: string;
  name: string;
  childLayerIds: string[];
  visible: boolean;
  solo: boolean;
  locked: boolean;
  collapsed: boolean;
  propertyTracks: SessionPropertyTrackV2[];
}

/**
 * Serialized effect.
 */
export interface SessionEffectV2 {
  id: string;
  effectType: string;
  scope: EffectScope;
  layerId?: string;
  enabled: boolean;
  order: number;
  propertyTracks: SessionPropertyTrackV2[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a default layer for new projects.
 */
export function createDefaultLayer(id?: LayerId, name?: string): Layer {
  const layerId = id ?? ('layer-1' as LayerId);
  return {
    id: layerId,
    name: name ?? 'Layer 1',
    visible: true,
    solo: false,
    locked: false,
    opacity: 100,
    contentFrames: [{
      id: 'cf-1' as ContentFrameId,
      name: 'Frame 1',
      startFrame: 0,
      durationFrames: 1,
      data: new Map(),
    }],
    propertyTracks: [],
    staticProperties: {},
  };
}

/**
 * Check if two content frames overlap in time.
 */
export function contentFramesOverlap(a: ContentFrame, b: ContentFrame): boolean {
  const aEnd = a.startFrame + a.durationFrames;
  const bEnd = b.startFrame + b.durationFrames;
  return a.startFrame < bEnd && b.startFrame < aEnd;
}

/**
 * Validate that no content frames overlap on a layer.
 * Returns true if all frames are valid (no overlaps).
 */
export function validateContentFrames(frames: ContentFrame[]): boolean {
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      if (contentFramesOverlap(frames[i], frames[j])) {
        return false;
      }
    }
  }
  return true;
}
