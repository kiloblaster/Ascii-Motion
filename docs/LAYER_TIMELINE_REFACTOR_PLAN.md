# Layer Timeline System Refactor Plan

> **Version:** 1.0.0  
> **Created:** February 1, 2026  
> **Status:** Planning  
> **Target Completion:** TBD

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Vision & Goals](#vision--goals)
3. [Branching Strategy](#branching-strategy)
4. [New Data Model](#new-data-model)
5. [Phase 1: Foundation](#phase-1-foundation)
6. [Phase 2: Layer Data Model](#phase-2-layer-data-model)
7. [Phase 3: Timeline UI](#phase-3-timeline-ui)
8. [Phase 4: Keyframe System](#phase-4-keyframe-system)
9. [Phase 5: Export & Migration](#phase-5-export--migration)
10. [Phase 6: Integration](#phase-6-integration)
11. [File Change Matrix](#file-change-matrix)
12. [Testing Strategy](#testing-strategy)
13. [Performance Considerations](#performance-considerations)
14. [Backward Compatibility](#backward-compatibility)
15. [Risks & Mitigations](#risks--mitigations)

---

## Executive Summary

This document outlines a major architectural refactor to introduce an After Effects-style layer and keyframe timeline system to ASCII Motion. The refactor replaces the current frame-based animation model with a layer-based composition system where:

- **Layers** contain content frames (ASCII canvas data) with draggable duration
- **Transform properties** (position, scale, rotation, opacity, anchor point) are keyframeable per layer
- **Any property** in the app can eventually be added to the timeline and keyframed
- **Two timeline views** exist: simplified Frame View and advanced Layer/Timeline View
- **Effects** can be applied per-layer or globally, with keyframeable properties

### Key Deliverables

- Layer-based composition system with Z-order rendering
- Keyframe animation with cubic bezier easing
- Resizable timeline panel with layer tracks and property editors
- Live canvas preview during keyframe editing
- Session format v2.0.0 with backward-compatible loading
- MCP protocol v2.0.0 with layer support
- Subscription tier integration (5 layers free, unlimited Pro)

---

## Vision & Goals

### User Experience Goals

1. **Professional Animation Workflow**: Layer-based timeline matching industry tools like After Effects
2. **Non-Destructive Editing**: Layers preserve original content while transforms are applied
3. **Visual Feedback**: Live canvas updates during all property edits, anchor point overlay
4. **Flexible Organization**: Rename, reorder, show/hide, solo, and lock layers
5. **Intuitive Keyframing**: Click to add keyframes, drag to adjust timing, visual easing editor

### Technical Goals

1. **Incremental Implementation**: Each phase is testable and deployable independently
2. **Performance**: Maintain 60fps with layer compositing via render caching
3. **Undo/Redo**: All layer and keyframe operations are undoable from day one
4. **Backward Compatibility**: Load v1.0.0 projects as single-layer compositions
5. **Forward Compatibility**: Extensible property system for future keyframeable properties

---

## Branching Strategy

### Repository Overview

This refactor spans multiple repositories in the workspace:

| Repository | Purpose | Branch Name |
|------------|---------|-------------|
| **Ascii-Motion** (main) | Core application | `feature/layer-timeline` |
| **ascii-motion-mcp** | MCP server package | `feature/layer-timeline` |
| **premium submodule** | Cloud storage, auth, subscriptions | `feature/layer-timeline` |

### Branch Creation Order

```bash
# 1. Main repository (create first)
cd Ascii-Motion
git checkout -b feature/layer-timeline
git push -u origin feature/layer-timeline

# 2. MCP repository
cd ascii-motion-mcp
git checkout -b feature/layer-timeline
git push -u origin feature/layer-timeline

# 3. Premium submodule (from within main repo)
cd packages/premium
git checkout -b feature/layer-timeline
git push -u origin feature/layer-timeline

# 4. Update main repo's submodule reference
cd ../..
git add packages/premium
git commit -m "chore: update premium submodule to feature/layer-timeline branch"
```

### Merge Strategy

1. **Phase completion**: Merge feature branches to `develop` (if exists) or `main`
2. **Cross-repo coordination**: Premium submodule merges first, then main repo updates reference
3. **MCP**: Can merge independently after protocol stabilizes (Phase 6)

### Branch Protection Rules

- Require PR reviews before merge
- Require passing CI checks
- No direct pushes to `main`

---

## New Data Model

### Core Type Definitions

```typescript
// src/types/timeline.ts - NEW FILE

// ============================================
// BRANDED ID TYPES
// ============================================

declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

export type LayerId = Brand<string, 'LayerId'>;
export type ContentFrameId = Brand<string, 'ContentFrameId'>;
export type KeyframeId = Brand<string, 'KeyframeId'>;
export type PropertyTrackId = Brand<string, 'PropertyTrackId'>;

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
  visible: boolean;        // Eyeball icon - affects render and export
  solo: boolean;           // Solo mode - only render this layer
  locked: boolean;         // Prevent editing
  
  // Content frames (ASCII canvas data with duration)
  contentFrames: ContentFrame[];
  
  // Transform property tracks (keyframeable)
  propertyTracks: PropertyTrack[];
  
  // Layer-level settings
  opacity: number;         // 0-100, default 100
  blendMode: BlendMode;    // Future: 'normal' | 'multiply' | etc.
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
  propertyPath: PropertyPath;  // e.g., 'transform.position.x'
  keyframes: Keyframe[];
  
  // Loop behavior
  loopKeyframes: boolean;  // Loop keyframe pattern until end of timeline
}

/**
 * Known property paths that can be keyframed.
 * This is extensible - any property can be added here.
 */
export type PropertyPath =
  // Transform properties
  | 'transform.position.x'
  | 'transform.position.y'
  | 'transform.scale'        // Uniform scale (1.0 = 100%)
  | 'transform.rotation'     // Degrees
  | 'transform.opacity'      // 0-100
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
export const PROPERTY_DEFINITIONS: Record<PropertyPath, PropertyDefinition> = {
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
  'transform.opacity': {
    path: 'transform.opacity',
    displayName: 'Opacity',
    category: 'transform',
    valueType: 'number',
    defaultValue: 100,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
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
 * Preset easing curve values.
 */
export const EASING_PRESETS: Record<EasingPreset, [number, number, number, number]> = {
  'linear': [0, 0, 1, 1],
  'hold': [0, 0, 0, 0],  // Special case: no interpolation
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  'ease-out-back': [0.34, 1.56, 0.64, 1],
  'ease-in-back': [0.36, 0, 0.66, -0.56],
  'bounce': [0.34, 1.4, 0.64, 1],  // Simplified bounce
};

// ============================================
// TIMELINE STATE
// ============================================

/**
 * Global timeline configuration.
 */
export interface TimelineConfig {
  frameRate: number;       // FPS (e.g., 24, 30, 60)
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
  
  // UI state
  zoom: number;            // Timeline zoom level
  scrollX: number;         // Horizontal scroll position
  panelHeight: number;     // Resizable panel height in pixels
  
  // Property editing
  editingKeyframeId: KeyframeId | null;
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
// BLEND MODES (FUTURE)
// ============================================

export type BlendMode = 'normal';  // Only 'normal' for Phase 1
// Future: 'multiply' | 'screen' | 'overlay' | 'difference'

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
  
  // Layer data (NEW - replaces animation.frames)
  layers: SessionLayerV2[];
  
  // Layer groups (NEW)
  layerGroups?: SessionLayerGroupV2[];
  
  // Global effects (NEW)
  globalEffects?: SessionEffectV2[];
  
  // Preserved from v1
  tools?: SessionToolState;
  ui?: SessionUIState;
  typography?: TypographySettings;
  palettes?: PaletteState;
  characterPalettes?: CharacterPaletteState;
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
  
  // Content frames (serialized)
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
  data: Record<string, Cell>;  // Object form for JSON
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
```

### Type Migration Utilities

```typescript
// src/utils/sessionMigration.ts - NEW FILE

import { SessionData } from '../types/export';  // v1 format
import { SessionDataV2, SessionLayerV2 } from '../types/timeline';

/**
 * Detect session format version.
 */
export function detectSessionVersion(data: unknown): '1.0.0' | '2.0.0' | 'unknown' {
  if (typeof data !== 'object' || data === null) return 'unknown';
  
  const session = data as Record<string, unknown>;
  
  if (session.version === '2.0.0' && 'layers' in session) {
    return '2.0.0';
  }
  
  if ('animation' in session && 'frames' in (session.animation as object)) {
    return '1.0.0';
  }
  
  return 'unknown';
}

/**
 * Migrate v1.0.0 session to v2.0.0 format.
 * Converts frame-based animation to single-layer composition.
 */
export function migrateV1ToV2(v1: SessionData): SessionDataV2 {
  const frameRate = v1.animation?.frameRate ?? 24;
  
  // Convert v1 frames to content frames
  const contentFrames: SessionContentFrameV2[] = [];
  let currentFrame = 0;
  
  for (const frame of v1.animation?.frames ?? []) {
    // Convert duration from ms to frames
    const durationFrames = Math.max(1, Math.round(frame.duration / (1000 / frameRate)));
    
    contentFrames.push({
      id: frame.id,
      name: frame.name,
      startFrame: currentFrame,
      durationFrames,
      data: frame.data instanceof Map 
        ? Object.fromEntries(frame.data) 
        : frame.data,
    });
    
    currentFrame += durationFrames;
  }
  
  // Calculate total duration
  const durationFrames = currentFrame || frameRate; // Default 1 second
  
  // Create single layer from v1 animation
  const defaultLayer: SessionLayerV2 = {
    id: 'layer-1',
    name: 'Layer 1',
    visible: true,
    solo: false,
    locked: false,
    opacity: 100,
    contentFrames,
    propertyTracks: [],  // No keyframes in migrated projects
  };
  
  return {
    version: '2.0.0',
    name: v1.name,
    description: v1.description,
    metadata: v1.metadata,
    canvas: v1.canvas ?? {
      width: 80,
      height: 24,
      canvasBackgroundColor: '#1a1a2e',
      showGrid: true,
    },
    timeline: {
      frameRate,
      durationFrames,
      looping: v1.animation?.looping ?? true,
    },
    layers: [defaultLayer],
    tools: v1.tools,
    ui: v1.ui,
    typography: v1.typography,
    palettes: v1.palettes,
    characterPalettes: v1.characterPalettes,
  };
}
```

---

## Phase 1: Foundation

**Duration:** 1-2 weeks  
**Goal:** Establish type system, feature branches, and store architecture

### 1.1 Create Feature Branches

**All Repositories:**

```bash
# Main repo
git checkout -b feature/layer-timeline

# MCP repo
git checkout -b feature/layer-timeline

# Premium submodule
git checkout -b feature/layer-timeline
```

### 1.2 Create New Type Files

**New Files:**
- `src/types/timeline.ts` - All interfaces from [New Data Model](#new-data-model)
- `src/types/easing.ts` - Easing curve utilities and presets
- `src/utils/sessionMigration.ts` - v1→v2 migration logic

### 1.3 Create Timeline Store

**New File:** `src/stores/timelineStore.ts`

```typescript
// src/stores/timelineStore.ts

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  Layer, LayerId, ContentFrame, ContentFrameId,
  PropertyTrack, Keyframe, KeyframeId,
  TimelineConfig, TimelineViewState, PropertyPath,
  EffectInstance,
} from '../types/timeline';

interface TimelineState {
  // Configuration
  config: TimelineConfig;
  
  // Layers (ordered by z-index, first = bottom)
  layers: Layer[];
  
  // Global effects
  globalEffects: EffectInstance[];
  
  // View state
  view: TimelineViewState;
  
  // ============================================
  // LAYER ACTIONS
  // ============================================
  
  addLayer: (name?: string) => LayerId;
  removeLayer: (layerId: LayerId) => void;
  duplicateLayer: (layerId: LayerId) => LayerId;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  renameLayer: (layerId: LayerId, name: string) => void;
  
  setLayerVisible: (layerId: LayerId, visible: boolean) => void;
  setLayerSolo: (layerId: LayerId, solo: boolean) => void;
  setLayerLocked: (layerId: LayerId, locked: boolean) => void;
  setLayerOpacity: (layerId: LayerId, opacity: number) => void;
  
  getActiveLayer: () => Layer | null;
  setActiveLayer: (layerId: LayerId | null) => void;
  
  // ============================================
  // CONTENT FRAME ACTIONS
  // ============================================
  
  addContentFrame: (layerId: LayerId, startFrame: number, durationFrames: number) => ContentFrameId;
  removeContentFrame: (layerId: LayerId, frameId: ContentFrameId) => void;
  updateContentFrameTiming: (layerId: LayerId, frameId: ContentFrameId, startFrame: number, durationFrames: number) => void;
  updateContentFrameData: (layerId: LayerId, frameId: ContentFrameId, data: Map<string, Cell>) => void;
  
  getContentFrameAtTime: (layerId: LayerId, frame: number) => ContentFrame | null;
  
  // ============================================
  // KEYFRAME ACTIONS
  // ============================================
  
  addPropertyTrack: (layerId: LayerId, propertyPath: PropertyPath) => PropertyTrackId;
  removePropertyTrack: (layerId: LayerId, trackId: PropertyTrackId) => void;
  
  addKeyframe: (layerId: LayerId, trackId: PropertyTrackId, frame: number, value: number) => KeyframeId;
  removeKeyframe: (layerId: LayerId, trackId: PropertyTrackId, keyframeId: KeyframeId) => void;
  updateKeyframe: (layerId: LayerId, trackId: PropertyTrackId, keyframeId: KeyframeId, updates: Partial<Keyframe>) => void;
  moveKeyframe: (layerId: LayerId, trackId: PropertyTrackId, keyframeId: KeyframeId, newFrame: number) => void;
  
  getPropertyValueAtFrame: (layerId: LayerId, propertyPath: PropertyPath, frame: number) => number;
  
  setKeyframeLooping: (layerId: LayerId, trackId: PropertyTrackId, loop: boolean) => void;
  
  // ============================================
  // PLAYBACK ACTIONS
  // ============================================
  
  play: () => void;
  pause: () => void;
  stop: () => void;
  goToFrame: (frame: number) => void;
  nextFrame: () => void;
  previousFrame: () => void;
  
  setLooping: (looping: boolean) => void;
  setFrameRate: (fps: number) => void;
  setDuration: (frames: number) => void;
  
  // ============================================
  // VIEW ACTIONS
  // ============================================
  
  setActiveView: (view: 'frames' | 'layers') => void;
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  setPanelHeight: (height: number) => void;
  
  selectKeyframes: (keyframeIds: KeyframeId[]) => void;
  setEditingKeyframe: (keyframeId: KeyframeId | null) => void;
  
  // ============================================
  // EFFECTS ACTIONS
  // ============================================
  
  addEffect: (effectType: string, scope: 'layer' | 'global', layerId?: LayerId) => void;
  removeEffect: (effectId: string) => void;
  reorderEffects: (fromIndex: number, toIndex: number, scope: 'layer' | 'global', layerId?: LayerId) => void;
  toggleEffectScope: (effectId: string) => void;
  
  // ============================================
  // SERIALIZATION
  // ============================================
  
  getSessionData: () => SessionDataV2;
  loadSessionData: (data: SessionDataV2) => void;
}

export const useTimelineStore = create<TimelineState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    config: {
      frameRate: 24,
      durationFrames: 72,  // 3 seconds at 24fps
      durationMs: 3000,
    },
    
    layers: [],
    globalEffects: [],
    
    view: {
      activeView: 'layers',  // Default to layer view (not frames)
      currentFrame: 0,
      isPlaying: false,
      looping: true,
      activeLayerId: null,
      selectedLayerIds: new Set(),
      selectedKeyframeIds: new Set(),
      zoom: 1,
      scrollX: 0,
      panelHeight: 200,
      editingKeyframeId: null,
    },
    
    // ... action implementations (see Phase 2)
  }))
);
```

### 1.4 Integrate Undo/Redo

**Modify:** `src/stores/historyStore.ts`

Add new action types for layer operations:

```typescript
// New history action types
type HistoryAction =
  // Existing canvas actions...
  | { type: 'LAYER_ADD'; layerId: LayerId; layerData: Layer }
  | { type: 'LAYER_REMOVE'; layerId: LayerId; layerData: Layer; index: number }
  | { type: 'LAYER_REORDER'; fromIndex: number; toIndex: number }
  | { type: 'LAYER_RENAME'; layerId: LayerId; oldName: string; newName: string }
  | { type: 'LAYER_VISIBILITY'; layerId: LayerId; oldVisible: boolean; newVisible: boolean }
  | { type: 'CONTENT_FRAME_ADD'; layerId: LayerId; frameId: ContentFrameId; frameData: ContentFrame }
  | { type: 'CONTENT_FRAME_REMOVE'; layerId: LayerId; frameId: ContentFrameId; frameData: ContentFrame }
  | { type: 'CONTENT_FRAME_TIMING'; layerId: LayerId; frameId: ContentFrameId; oldTiming: { start: number; duration: number }; newTiming: { start: number; duration: number } }
  | { type: 'KEYFRAME_ADD'; layerId: LayerId; trackId: PropertyTrackId; keyframeId: KeyframeId; keyframe: Keyframe }
  | { type: 'KEYFRAME_REMOVE'; layerId: LayerId; trackId: PropertyTrackId; keyframeId: KeyframeId; keyframe: Keyframe }
  | { type: 'KEYFRAME_UPDATE'; layerId: LayerId; trackId: PropertyTrackId; keyframeId: KeyframeId; oldValue: Keyframe; newValue: Keyframe }
  | { type: 'PROPERTY_TRACK_ADD'; layerId: LayerId; trackId: PropertyTrackId; propertyPath: PropertyPath }
  | { type: 'PROPERTY_TRACK_REMOVE'; layerId: LayerId; trackId: PropertyTrackId; trackData: PropertyTrack };
```

### 1.5 Testing Checkpoint

- [ ] All new type files compile without errors
- [ ] Timeline store creates with initial state
- [ ] Basic layer add/remove works (no UI yet)
- [ ] Undo/redo framework integrated
- [ ] Session migration function converts v1 to v2 format

---

## Phase 2: Layer Data Model

**Duration:** 2-3 weeks  
**Goal:** Implement full layer management with content frames

### 2.1 Layer Management Implementation

**File:** `src/stores/timelineStore.ts`

Implement all layer action methods:

```typescript
addLayer: (name?: string) => {
  const id = generateLayerId();
  const layer: Layer = {
    id,
    name: name ?? `Layer ${get().layers.length + 1}`,
    visible: true,
    solo: false,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    contentFrames: [],
    propertyTracks: [],
  };
  
  // Check subscription tier limit
  const layerLimit = getSubscriptionLayerLimit();
  if (layerLimit !== -1 && get().layers.length >= layerLimit) {
    showUpgradePrompt('layer_limit');
    return null;
  }
  
  // Record for undo
  recordHistoryAction({ type: 'LAYER_ADD', layerId: id, layerData: layer });
  
  set((state) => ({
    layers: [...state.layers, layer],
    view: { ...state.view, activeLayerId: id },
  }));
  
  return id;
},
```

### 2.2 Subscription Tier Integration

**Modify:** `packages/premium/src/stores/subscriptionStore.ts`

```typescript
// Add layer limit to tier configuration
interface SubscriptionTier {
  // ...existing fields
  maxLayers: number;  // -1 = unlimited, 5 = free tier
}

// Free tier: 5 layers max
// Pro tier: unlimited layers (-1)
```

**Create:** `src/hooks/useLayerLimit.ts`

```typescript
export function useLayerLimit() {
  const tier = useSubscriptionStore((s) => s.tier);
  const layerCount = useTimelineStore((s) => s.layers.length);
  
  const maxLayers = tier?.maxLayers ?? 5;  // Default to free tier
  const canAddLayer = maxLayers === -1 || layerCount < maxLayers;
  const remainingLayers = maxLayers === -1 ? Infinity : maxLayers - layerCount;
  
  return { maxLayers, canAddLayer, remainingLayers, layerCount };
}
```

### 2.3 Canvas Store Integration

**Modify:** `src/stores/canvasStore.ts`

The canvas store now represents the **active layer's working canvas**:

```typescript
interface CanvasState {
  // ... existing fields
  
  // NEW: Active layer reference
  activeLayerId: LayerId | null;
  
  // NEW: Sync canvas to/from active layer's content frame
  syncToContentFrame: () => void;
  syncFromContentFrame: () => void;
}
```

### 2.4 Layer Compositing for Rendering

**New File:** `src/utils/layerCompositing.ts`

```typescript
import { Layer, ContentFrame } from '../types/timeline';
import { Cell } from '../types/canvas';

/**
 * Composite all visible layers at a given frame.
 * Returns a Map of cells for rendering.
 * 
 * Rendering order: First layer in array = bottom (rendered first)
 * Cell priority: Top layer's cell wins if non-empty
 */
export function compositeLayersAtFrame(
  layers: Layer[],
  frame: number,
  canvasWidth: number,
  canvasHeight: number
): Map<string, Cell> {
  const result = new Map<string, Cell>();
  
  // Check if any layer is solo'd
  const hasSoloLayer = layers.some((l) => l.solo);
  
  // Iterate layers from bottom to top
  for (const layer of layers) {
    // Skip invisible layers
    if (!layer.visible) continue;
    
    // If any layer is solo'd, only render solo'd layers
    if (hasSoloLayer && !layer.solo) continue;
    
    // Get content frame at this time
    const contentFrame = getContentFrameAtTime(layer, frame);
    if (!contentFrame) continue;
    
    // Get transform values at this frame
    const posX = getPropertyValueAtFrame(layer, 'transform.position.x', frame);
    const posY = getPropertyValueAtFrame(layer, 'transform.position.y', frame);
    const scale = getPropertyValueAtFrame(layer, 'transform.scale', frame);
    const rotation = getPropertyValueAtFrame(layer, 'transform.rotation', frame);
    const opacity = getPropertyValueAtFrame(layer, 'transform.opacity', frame);
    const anchorX = getPropertyValueAtFrame(layer, 'transform.anchorPoint.x', frame);
    const anchorY = getPropertyValueAtFrame(layer, 'transform.anchorPoint.y', frame);
    
    // Skip fully transparent layers
    if (opacity === 0) continue;
    
    // Apply transforms and composite cells
    for (const [coordKey, cell] of contentFrame.data) {
      const [x, y] = coordKey.split(',').map(Number);
      
      // Apply anchor point offset
      const localX = x - anchorX;
      const localY = y - anchorY;
      
      // Apply scale (snap to whole cells)
      const scaledX = Math.round(localX * scale);
      const scaledY = Math.round(localY * scale);
      
      // Apply rotation (in 90° increments for ASCII)
      const { rotatedX, rotatedY } = applyRotation(scaledX, scaledY, rotation);
      
      // Apply position offset
      const finalX = rotatedX + anchorX + posX;
      const finalY = rotatedY + anchorY + posY;
      
      // Bounds check
      if (finalX < 0 || finalX >= canvasWidth || finalY < 0 || finalY >= canvasHeight) {
        continue;
      }
      
      const finalKey = `${finalX},${finalY}`;
      
      // Only overwrite if cell has content
      if (cell.char && cell.char !== ' ') {
        result.set(finalKey, {
          ...cell,
          // Apply layer opacity (future: blend with existing cell)
          // For now, just overwrite
        });
      }
    }
  }
  
  return result;
}

/**
 * Get content frame active at a given frame number.
 */
function getContentFrameAtTime(layer: Layer, frame: number): ContentFrame | null {
  for (const cf of layer.contentFrames) {
    if (frame >= cf.startFrame && frame < cf.startFrame + cf.durationFrames) {
      return cf;
    }
  }
  return null;
}

/**
 * Apply rotation at 1° increments around anchor point.
 * Uses same approach as ellipse tool - accounts for cell aspect ratio.
 * Cells are preserved in layer data even when rotated off-canvas;
 * they simply won't render until they're back in view.
 */
function applyRotation(
  x: number, 
  y: number, 
  degrees: number,
  cellAspectRatio: number = 0.6  // Typical monospace ~0.6 (width/height)
): { rotatedX: number; rotatedY: number } {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  
  // Account for cell aspect ratio (cells are taller than wide)
  // Scale x to make rotation visually correct, then scale back
  const scaledX = x * cellAspectRatio;
  
  // Apply rotation
  const rotatedScaledX = scaledX * cos - y * sin;
  const rotatedY = scaledX * sin + y * cos;
  
  // Scale x back and snap to whole cells
  const rotatedX = Math.round(rotatedScaledX / cellAspectRatio);
  
  return { rotatedX, rotatedY: Math.round(rotatedY) };
}

/**
 * Note: Rotation preserves all cell data in the layer.
 * Cells that rotate outside canvas bounds are NOT clipped or deleted.
 * They simply won't render until they rotate back into view.
 * This prevents data loss when animating rotation.
 */
```

### 2.5 Renderer Integration

**Modify:** `src/hooks/useCanvasRenderer.ts`

Update the main render loop to use layer compositing:

```typescript
// Before: Render from canvasStore cells
const cells = useCanvasStore((s) => s.cells);

// After: Composite all layers at current frame
const layers = useTimelineStore((s) => s.layers);
const currentFrame = useTimelineStore((s) => s.view.currentFrame);
const compositedCells = useMemo(
  () => compositeLayersAtFrame(layers, currentFrame, canvasWidth, canvasHeight),
  [layers, currentFrame, canvasWidth, canvasHeight]
);
```

### 2.6 Active Layer Header Display

**Modify:** `src/components/features/Header.tsx`

Add active layer indicator to project title:

```typescript
export function Header() {
  const projectName = useProjectStore((s) => s.name) ?? 'Untitled Project';
  const activeLayer = useTimelineStore((s) => {
    const id = s.view.activeLayerId;
    return s.layers.find((l) => l.id === id);
  });
  
  return (
    <header>
      <h1>
        {projectName}
        {activeLayer && (
          <span className="text-muted-foreground ml-2">
            ({activeLayer.name})
          </span>
        )}
      </h1>
    </header>
  );
}
```

### 2.7 Drawing Tool Layer Targeting

**Modify:** `src/stores/toolStore.ts`

Add layer targeting toggle for drawing tools:

```typescript
interface ToolState {
  // ... existing fields
  
  // Layer targeting
  applyToAllLayers: boolean;  // false = current layer only
}
```

**Modify:** All drawing tool hooks to respect `applyToAllLayers`:

- `src/hooks/useDrawingTool.ts`
- `src/hooks/useCanvasDragAndDrop.ts`
- `src/hooks/usePaintBucket.ts`

### 2.8 Layer Groups

**Purpose:** Allow grouping layers for organizational and transform purposes. Groups have their own transform properties that apply to all child layers.

**New Types:**

```typescript
// Add to src/types/timeline.ts

export type LayerGroupId = Brand<string, 'LayerGroupId'>;

/**
 * A layer group contains multiple layers and has its own transform.
 * Group transforms are applied BEFORE individual layer transforms.
 * Only one level of nesting is supported (groups cannot contain groups).
 */
export interface LayerGroup {
  id: LayerGroupId;
  name: string;
  
  // Child layer IDs (in z-order, first = bottom)
  childLayerIds: LayerId[];
  
  // Group visibility/state
  visible: boolean;
  solo: boolean;
  locked: boolean;
  collapsed: boolean;  // Collapse in timeline UI
  
  // Group-level transform (applied before child transforms)
  propertyTracks: PropertyTrack[];
}

// Update Layer interface
export interface Layer {
  // ... existing fields
  parentGroupId?: LayerGroupId;  // If layer is in a group
}
```

**Store Actions:**

```typescript
// Add to timelineStore.ts

// Group management
createGroup: (name?: string, layerIds?: LayerId[]) => LayerGroupId;
ungroupLayers: (groupId: LayerGroupId) => void;
addLayerToGroup: (layerId: LayerId, groupId: LayerGroupId) => void;
removeLayerFromGroup: (layerId: LayerId) => void;

// Group state
setGroupCollapsed: (groupId: LayerGroupId, collapsed: boolean) => void;
setGroupVisible: (groupId: LayerGroupId, visible: boolean) => void;
setGroupSolo: (groupId: LayerGroupId, solo: boolean) => void;
setGroupLocked: (groupId: LayerGroupId, locked: boolean) => void;
```

**Transform Application Order:**

```typescript
function getEffectiveTransform(layer: Layer, frame: number): TransformValues {
  // Get layer's own transform
  const layerTransform = getLayerTransform(layer, frame);
  
  // If layer is in a group, apply group transform first
  if (layer.parentGroupId) {
    const group = getGroup(layer.parentGroupId);
    const groupTransform = getGroupTransform(group, frame);
    
    // Compose transforms: group first, then layer
    return composeTransforms(groupTransform, layerTransform);
  }
  
  return layerTransform;
}

function composeTransforms(parent: TransformValues, child: TransformValues): TransformValues {
  return {
    // Position: parent position + child position (rotated by parent rotation)
    positionX: parent.positionX + rotatePoint(child.positionX, child.positionY, parent.rotation).x,
    positionY: parent.positionY + rotatePoint(child.positionX, child.positionY, parent.rotation).y,
    // Scale: multiply
    scale: parent.scale * child.scale,
    // Rotation: add
    rotation: parent.rotation + child.rotation,
    // Opacity: multiply (normalized)
    opacity: (parent.opacity / 100) * child.opacity,
    // Anchor: child's anchor (group anchor is for group rotation center)
    anchorX: child.anchorX,
    anchorY: child.anchorY,
  };
}
```

**Effects on Groups:**

When an effect is set to "apply to current selection" and a group is selected:
- The effect is applied to each layer in the group individually
- Layers are NOT composited first (no flattening)
- Each layer gets its own effect instance in the effect list

```typescript
function applyEffectToSelection(effectType: string) {
  const selection = getSelection();
  
  if (selection.type === 'group') {
    const group = getGroup(selection.groupId);
    // Apply effect to each layer in group individually
    for (const layerId of group.childLayerIds) {
      addEffect(effectType, 'layer', layerId);
    }
  } else if (selection.type === 'layer') {
    addEffect(effectType, 'layer', selection.layerId);
  }
}
```

**Timeline UI for Groups:**

```typescript
// Group header row (collapsible)
export function GroupListItem({ group }) {
  return (
    <div className="border-b bg-muted/30">
      <div className="flex items-center gap-2 p-2">
        {/* Collapse toggle */}
        <button onClick={() => setGroupCollapsed(group.id, !group.collapsed)}>
          <ChevronRight className={cn("w-4 h-4", !group.collapsed && "rotate-90")} />
        </button>
        
        {/* Group icon */}
        <Folder className="w-4 h-4" />
        
        {/* Visibility/Solo/Lock */}
        <LayerControls target={group} />
        
        {/* Group name */}
        <EditableName value={group.name} onChange={(name) => renameGroup(group.id, name)} />
      </div>
      
      {/* Child layers (when expanded) */}
      {!group.collapsed && (
        <div className="ml-4 border-l">
          {group.childLayerIds.map((layerId) => (
            <LayerListItem key={layerId} layerId={layerId} isInGroup />
          ))}
        </div>
      )}
      
      {/* Group property tracks (when expanded) */}
      {!group.collapsed && group.propertyTracks.length > 0 && (
        <div className="ml-6">
          {group.propertyTracks.map((track) => (
            <PropertyTrackRow key={track.id} targetId={group.id} track={track} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 2.9 Merge Layers

**Purpose:** Combine multiple layers into one, flattening their content.

**Commands (accessible from Animation panel hamburger menu):**

1. **Merge Down**: Merge selected layer with the layer directly below it
2. **Merge Visible**: Merge all visible layers into one layer

```typescript
// Add to timelineStore.ts

/**
 * Merge the selected layer with the layer below it.
 * The result replaces both layers with a single merged layer.
 */
mergeDown: (layerId: LayerId) => {
  const layers = get().layers;
  const layerIndex = layers.findIndex((l) => l.id === layerId);
  
  if (layerIndex <= 0) return; // Can't merge bottom layer down
  
  const topLayer = layers[layerIndex];
  const bottomLayer = layers[layerIndex - 1];
  
  // Composite content frames at each frame
  const mergedContentFrames = mergeLayerContent(topLayer, bottomLayer, get().config);
  
  // Create merged layer (inherits bottom layer's properties)
  const mergedLayer: Layer = {
    id: generateLayerId(),
    name: `${bottomLayer.name} + ${topLayer.name}`,
    visible: true,
    solo: false,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    contentFrames: mergedContentFrames,
    propertyTracks: [],  // Transforms are baked in
  };
  
  // Record for undo
  recordHistoryAction({
    type: 'LAYER_MERGE',
    removedLayers: [topLayer, bottomLayer],
    newLayer: mergedLayer,
    insertIndex: layerIndex - 1,
  });
  
  // Update layers array
  const newLayers = [
    ...layers.slice(0, layerIndex - 1),
    mergedLayer,
    ...layers.slice(layerIndex + 1),
  ];
  
  set({ layers: newLayers });
},

/**
 * Merge all visible layers into one layer.
 */
mergeVisible: () => {
  const layers = get().layers.filter((l) => l.visible);
  if (layers.length < 2) return;
  
  // Composite all visible layers
  const mergedContentFrames = mergeMultipleLayerContent(layers, get().config);
  
  const mergedLayer: Layer = {
    id: generateLayerId(),
    name: 'Merged Visible',
    visible: true,
    solo: false,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    contentFrames: mergedContentFrames,
    propertyTracks: [],
  };
  
  // Record for undo and update
  // ... similar to mergeDown
},
```

**Menu Integration:**

```typescript
// In AnimationPanelMenu.tsx (hamburger menu)
<DropdownMenuItem 
  onClick={() => mergeDown(activeLayerId)}
  disabled={!canMergeDown}
>
  Merge Down
</DropdownMenuItem>
<DropdownMenuItem 
  onClick={() => mergeVisible()}
  disabled={visibleLayerCount < 2}
>
  Merge Visible
</DropdownMenuItem>
```

### 2.10 Testing Checkpoint

- [ ] Can add layers (up to 5 on free tier)
- [ ] Can rename, reorder, show/hide, solo, lock layers
- [ ] Active layer indicator shows in header
- [ ] Drawing tools target active layer
- [ ] Layer compositing renders correctly
- [ ] Undo/redo works for all layer operations
- [ ] Solo mode isolates layer rendering
- [ ] Hidden layers excluded from render
- [ ] Can create layer groups
- [ ] Can add/remove layers from groups
- [ ] Groups can be collapsed in timeline
- [ ] Group transforms apply to all child layers
- [ ] Merge Down combines two layers correctly
- [ ] Merge Visible combines all visible layers

---

## Phase 3: Timeline UI

**Duration:** 3-4 weeks  
**Goal:** Build complete timeline interface with layers and property tracks

### 3.1 Resizable Bottom Panel

**Modify:** `src/components/layout/MainLayout.tsx`

Replace toggle button with drag handle:

```typescript
// New component for resizable panel
export function ResizableTimelinePanel() {
  const panelHeight = useTimelineStore((s) => s.view.panelHeight);
  const setPanelHeight = useTimelineStore((s) => s.setPanelHeight);
  
  const handleDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = panelHeight;
    
    const onMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(100, Math.min(600, startHeight + delta));
      setPanelHeight(newHeight);
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelHeight, setPanelHeight]);
  
  return (
    <div 
      className="h-2 cursor-ns-resize bg-border hover:bg-primary/50"
      onMouseDown={handleDrag}
    >
      <div className="w-12 h-1 mx-auto mt-0.5 rounded bg-muted-foreground/50" />
    </div>
  );
}
```

### 3.2 Timeline View Tabs

**New File:** `src/components/features/TimelineTabs.tsx`

```typescript
export function TimelineTabs() {
  const activeView = useTimelineStore((s) => s.view.activeView);
  const setActiveView = useTimelineStore((s) => s.setActiveView);
  
  return (
    <div className="flex border-b">
      <button
        className={cn(
          "px-4 py-2 text-sm font-medium",
          activeView === 'layers' && "border-b-2 border-primary"
        )}
        onClick={() => setActiveView('layers')}
      >
        Timeline
      </button>
      <button
        className={cn(
          "px-4 py-2 text-sm font-medium",
          activeView === 'frames' && "border-b-2 border-primary"
        )}
        onClick={() => setActiveView('frames')}
      >
        Frames (Simple)
      </button>
    </div>
  );
}
```

### 3.3 Layer List Panel

**New File:** `src/components/features/LayerList.tsx`

```typescript
export function LayerList() {
  const layers = useTimelineStore((s) => s.layers);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const setActiveLayer = useTimelineStore((s) => s.setActiveLayer);
  const { canAddLayer } = useLayerLimit();
  
  return (
    <div className="w-64 border-r overflow-y-auto">
      {/* Add layer button */}
      <div className="p-2 border-b">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={addLayer}
              disabled={!canAddLayer}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Layer
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {canAddLayer ? 'Add new layer' : 'Upgrade to Pro for more layers'}
          </TooltipContent>
        </Tooltip>
      </div>
      
      {/* Layer list (reversed for visual z-order: top = top of list) */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="layers">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {[...layers].reverse().map((layer, index) => (
                <Draggable key={layer.id} draggableId={layer.id} index={index}>
                  {(provided) => (
                    <LayerListItem
                      layer={layer}
                      isActive={layer.id === activeLayerId}
                      onSelect={() => setActiveLayer(layer.id)}
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                    />
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
```

### 3.4 Layer List Item

**New File:** `src/components/features/LayerListItem.tsx`

```typescript
export function LayerListItem({ layer, isActive, onSelect }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(layer.name);
  
  const setLayerVisible = useTimelineStore((s) => s.setLayerVisible);
  const setLayerSolo = useTimelineStore((s) => s.setLayerSolo);
  const setLayerLocked = useTimelineStore((s) => s.setLayerLocked);
  
  // Expand/collapse for property tracks
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div 
      className={cn(
        "border-b p-2",
        isActive && "bg-accent"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        {/* Expand arrow */}
        <button onClick={() => setIsExpanded(!isExpanded)}>
          <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
        </button>
        
        {/* Visibility toggle (eyeball) */}
        <button onClick={() => setLayerVisible(layer.id, !layer.visible)}>
          {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 opacity-50" />}
        </button>
        
        {/* Solo toggle */}
        <button onClick={() => setLayerSolo(layer.id, !layer.solo)}>
          <span className={cn("text-xs font-bold", layer.solo && "text-yellow-500")}>S</span>
        </button>
        
        {/* Lock toggle */}
        <button onClick={() => setLayerLocked(layer.id, !layer.locked)}>
          {layer.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4 opacity-50" />}
        </button>
        
        {/* Layer name (editable on double-click) */}
        {isEditing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { renameLayer(layer.id, name); setIsEditing(false); }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            autoFocus
          />
        ) : (
          <span onDoubleClick={() => setIsEditing(true)}>{layer.name}</span>
        )}
        
        {/* Keyframe indicator (shows if layer has keyframes) */}
        {layer.propertyTracks.some((t) => t.keyframes.length > 0) && (
          <Diamond className="w-3 h-3 text-yellow-500" />
        )}
      </div>
      
      {/* Expanded: Property tracks */}
      {isExpanded && (
        <div className="ml-6 mt-2">
          {layer.propertyTracks.map((track) => (
            <PropertyTrackRow key={track.id} layerId={layer.id} track={track} />
          ))}
          <AddPropertyButton layerId={layer.id} />
        </div>
      )}
    </div>
  );
}
```

### 3.5 Property Track Row

**New File:** `src/components/features/PropertyTrackRow.tsx`

```typescript
export function PropertyTrackRow({ layerId, track }) {
  const definition = PROPERTY_DEFINITIONS[track.propertyPath];
  
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-muted-foreground w-24">{definition.displayName}</span>
      
      {/* Keyframe diamonds will be rendered in the timeline area */}
      <div className="flex-1">
        {/* Timeline ruler synced with main timeline */}
      </div>
      
      {/* Loop toggle */}
      <button onClick={() => setKeyframeLooping(layerId, track.id, !track.loopKeyframes)}>
        <Repeat className={cn("w-3 h-3", track.loopKeyframes && "text-primary")} />
      </button>
    </div>
  );
}
```

### 3.6 Add Property Menu

**New File:** `src/components/features/AddPropertyButton.tsx`

```typescript
export function AddPropertyButton({ layerId }) {
  const layer = useTimelineStore((s) => s.layers.find((l) => l.id === layerId));
  const addPropertyTrack = useTimelineStore((s) => s.addPropertyTrack);
  
  // Get properties not yet added
  const existingPaths = new Set(layer?.propertyTracks.map((t) => t.propertyPath) ?? []);
  const availableProperties = Object.values(PROPERTY_DEFINITIONS)
    .filter((def) => !existingPaths.has(def.path));
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Plus className="w-3 h-3 mr-1" />
          Add Property
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {availableProperties.map((def) => (
          <DropdownMenuItem 
            key={def.path}
            onClick={() => addPropertyTrack(layerId, def.path)}
          >
            {def.displayName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 3.7 Timeline Ruler & Playhead

**New File:** `src/components/features/TimelineRuler.tsx`

```typescript
export function TimelineRuler() {
  const { frameRate, durationFrames } = useTimelineStore((s) => s.config);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const zoom = useTimelineStore((s) => s.view.zoom);
  const goToFrame = useTimelineStore((s) => s.goToFrame);
  
  const pixelsPerFrame = 10 * zoom;
  const totalWidth = durationFrames * pixelsPerFrame;
  
  // Click to seek
  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = Math.floor(x / pixelsPerFrame);
    goToFrame(Math.max(0, Math.min(durationFrames - 1, frame)));
  };
  
  return (
    <div className="relative h-6 bg-muted" onClick={handleClick}>
      {/* Frame markers */}
      {Array.from({ length: durationFrames }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 h-2 border-l border-border"
          style={{ left: i * pixelsPerFrame }}
        >
          {i % frameRate === 0 && (
            <span className="absolute top-2 text-xs text-muted-foreground">
              {Math.floor(i / frameRate)}s
            </span>
          )}
        </div>
      ))}
      
      {/* Playhead */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-red-500"
        style={{ left: currentFrame * pixelsPerFrame }}
      >
        <div className="absolute -top-1 -left-1.5 w-4 h-4 bg-red-500 rounded-full" />
      </div>
    </div>
  );
}
```

### 3.8 Content Frame Blocks

**New File:** `src/components/features/ContentFrameBlock.tsx`

Draggable, resizable content frame blocks in timeline:

```typescript
export function ContentFrameBlock({ layerId, frame }) {
  const pixelsPerFrame = useTimelineStore((s) => 10 * s.view.zoom);
  const updateContentFrameTiming = useTimelineStore((s) => s.updateContentFrameTiming);
  
  const left = frame.startFrame * pixelsPerFrame;
  const width = frame.durationFrames * pixelsPerFrame;
  
  // Drag to move
  const handleDrag = (e: React.MouseEvent) => {
    // ... drag implementation
  };
  
  // Drag edges to resize
  const handleResizeLeft = (e: React.MouseEvent) => {
    // ... resize left edge
  };
  
  const handleResizeRight = (e: React.MouseEvent) => {
    // ... resize right edge
  };
  
  return (
    <div
      className="absolute h-8 bg-primary/30 border border-primary rounded"
      style={{ left, width }}
    >
      {/* Left resize handle */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize"
        onMouseDown={handleResizeLeft}
      />
      
      {/* Content */}
      <div className="px-2 truncate" onMouseDown={handleDrag}>
        {frame.name}
      </div>
      
      {/* Right resize handle */}
      <div 
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize"
        onMouseDown={handleResizeRight}
      />
    </div>
  );
}
```

### 3.9 Keyframe Diamonds

**New File:** `src/components/features/KeyframeDiamond.tsx`

```typescript
export function KeyframeDiamond({ layerId, trackId, keyframe, isSelected }) {
  const pixelsPerFrame = useTimelineStore((s) => 10 * s.view.zoom);
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const moveKeyframe = useTimelineStore((s) => s.moveKeyframe);
  
  const left = keyframe.frame * pixelsPerFrame;
  
  // Click to select and open editor
  const handleClick = () => {
    setEditingKeyframe(keyframe.id);
  };
  
  // Drag to move in time
  const handleDrag = (e: React.MouseEvent) => {
    // ... drag implementation
  };
  
  return (
    <div
      className={cn(
        "absolute w-3 h-3 rotate-45 cursor-pointer",
        isSelected ? "bg-yellow-400" : "bg-yellow-600"
      )}
      style={{ left: left - 6, top: 4 }}
      onClick={handleClick}
      onMouseDown={handleDrag}
    />
  );
}
```

### 3.10 Keyframe Editor Panel

**New File:** `src/components/features/KeyframeEditorPanel.tsx`

Right-side panel for editing keyframe properties:

```typescript
export function KeyframeEditorPanel() {
  const editingKeyframeId = useTimelineStore((s) => s.view.editingKeyframeId);
  const keyframeData = useTimelineStore((s) => {
    // Find the keyframe being edited
    for (const layer of s.layers) {
      for (const track of layer.propertyTracks) {
        const kf = track.keyframes.find((k) => k.id === editingKeyframeId);
        if (kf) return { layerId: layer.id, trackId: track.id, keyframe: kf, track };
      }
    }
    return null;
  });
  
  if (!keyframeData) {
    return <div className="w-64 p-4 text-muted-foreground">Select a keyframe to edit</div>;
  }
  
  const { layerId, trackId, keyframe, track } = keyframeData;
  const definition = PROPERTY_DEFINITIONS[track.propertyPath];
  
  return (
    <div className="w-64 border-l p-4 space-y-4">
      <h3 className="font-semibold">{definition.displayName}</h3>
      
      {/* Frame number */}
      <div>
        <label className="text-sm text-muted-foreground">Frame</label>
        <Input
          type="number"
          value={keyframe.frame}
          onChange={(e) => moveKeyframe(layerId, trackId, keyframe.id, parseInt(e.target.value))}
        />
      </div>
      
      {/* Value */}
      <div>
        <label className="text-sm text-muted-foreground">Value</label>
        <Input
          type="number"
          value={keyframe.value as number}
          min={definition.min}
          max={definition.max}
          step={definition.step}
          onChange={(e) => updateKeyframeValue(layerId, trackId, keyframe.id, parseFloat(e.target.value))}
        />
        {definition.unit && <span className="text-xs text-muted-foreground">{definition.unit}</span>}
      </div>
      
      {/* Easing curve editor */}
      <div>
        <label className="text-sm text-muted-foreground">Easing</label>
        <EasingCurveEditor
          value={keyframe.easing}
          onChange={(easing) => updateKeyframeEasing(layerId, trackId, keyframe.id, easing)}
        />
      </div>
      
      {/* Loop toggle */}
      <div className="flex items-center gap-2">
        <Switch
          checked={track.loopKeyframes}
          onCheckedChange={(loop) => setKeyframeLooping(layerId, trackId, loop)}
        />
        <label className="text-sm">Loop keyframes</label>
      </div>
    </div>
  );
}
```

### 3.11 Easing Curve Editor

**New File:** `src/components/features/EasingCurveEditor.tsx`

Visual cubic bezier editor with presets:

```typescript
export function EasingCurveEditor({ value, onChange }) {
  const [customCurve, setCustomCurve] = useState({
    x1: value.x1 ?? 0.42,
    y1: value.y1 ?? 0,
    x2: value.x2 ?? 0.58,
    y2: value.y2 ?? 1,
  });
  
  return (
    <div className="space-y-2">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1">
        {Object.keys(EASING_PRESETS).map((preset) => (
          <Button
            key={preset}
            variant={value.type === preset ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange({ type: preset })}
          >
            {preset}
          </Button>
        ))}
      </div>
      
      {/* Visual curve editor (for custom) */}
      {value.type === 'custom' && (
        <div className="relative w-full h-32 bg-muted rounded border">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Grid */}
            <line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" strokeOpacity="0.1" />
            
            {/* Bezier curve */}
            <path
              d={`M 0,100 C ${customCurve.x1 * 100},${100 - customCurve.y1 * 100} ${customCurve.x2 * 100},${100 - customCurve.y2 * 100} 100,0`}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
            />
            
            {/* Control point handles (draggable) */}
            <circle cx={customCurve.x1 * 100} cy={100 - customCurve.y1 * 100} r="4" fill="hsl(var(--primary))" />
            <circle cx={customCurve.x2 * 100} cy={100 - customCurve.y2 * 100} r="4" fill="hsl(var(--primary))" />
          </svg>
        </div>
      )}
    </div>
  );
}
```

### 3.12 Timecode Display

**New File:** `src/components/features/TimecodeDisplay.tsx`

```typescript
export function TimecodeDisplay() {
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const frameRate = useTimelineStore((s) => s.config.frameRate);
  const [format, setFormat] = useState<TimecodeFormat>('timecode');
  
  const formatTimecode = (frame: number): string => {
    switch (format) {
      case 'frames':
        return `Frame ${frame}`;
      case 'seconds':
        return `${(frame / frameRate).toFixed(2)}s`;
      case 'milliseconds':
        return `${Math.round(frame / frameRate * 1000)}ms`;
      case 'timecode':
      default:
        const totalSeconds = Math.floor(frame / frameRate);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const frames = frame % frameRate;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-lg">{formatTimecode(currentFrame)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setFormat('timecode')}>Timecode (MM:SS:FF)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFormat('frames')}>Frames</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFormat('seconds')}>Seconds</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFormat('milliseconds')}>Milliseconds</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

### 3.13 Testing Checkpoint

- [ ] Bottom panel is resizable via drag handle
- [ ] Tabs switch between Frames and Timeline views
- [ ] Layer list shows all layers with correct z-order
- [ ] Layer visibility, solo, lock toggles work
- [ ] Layer names are editable on double-click
- [ ] Layers are reorderable via drag-and-drop
- [ ] Property tracks expand/collapse under layers
- [ ] "+ Add Property" menu shows available properties
- [ ] Content frame blocks display correctly in timeline
- [ ] Content frame edges are draggable to resize duration
- [ ] Keyframe diamonds display on property tracks
- [ ] Clicking keyframe opens editor panel
- [ ] Easing presets apply correctly
- [ ] Custom easing curve is draggable
- [ ] Timecode display shows correct format
- [ ] Playhead is draggable to seek

---

## Phase 4: Keyframe System

**Duration:** 2-3 weeks  
**Goal:** Implement keyframe interpolation, live preview, and anchor point overlay

### 4.1 Keyframe Interpolation

**New File:** `src/utils/keyframeInterpolation.ts`

```typescript
import { Keyframe, EasingCurve, EASING_PRESETS } from '../types/timeline';

/**
 * Interpolate a value between two keyframes at a given frame.
 */
export function interpolateKeyframes(
  keyframes: Keyframe[],
  frame: number,
  loopKeyframes: boolean = false
): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0].value as number;
  
  // Sort keyframes by frame
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  
  // Handle looping
  if (loopKeyframes) {
    const loopDuration = sorted[sorted.length - 1].frame - sorted[0].frame;
    if (loopDuration > 0) {
      frame = sorted[0].frame + ((frame - sorted[0].frame) % loopDuration);
    }
  }
  
  // Find surrounding keyframes
  const prevKeyframe = sorted.filter((k) => k.frame <= frame).pop();
  const nextKeyframe = sorted.find((k) => k.frame > frame);
  
  // Before first keyframe
  if (!prevKeyframe) return sorted[0].value as number;
  
  // After last keyframe
  if (!nextKeyframe) return sorted[sorted.length - 1].value as number;
  
  // Interpolate
  const t = (frame - prevKeyframe.frame) / (nextKeyframe.frame - prevKeyframe.frame);
  const easedT = applyEasing(t, prevKeyframe.easing);
  
  const prevValue = prevKeyframe.value as number;
  const nextValue = nextKeyframe.value as number;
  
  // For ASCII, snap to whole cells
  return Math.round(prevValue + (nextValue - prevValue) * easedT);
}

/**
 * Apply easing curve to a linear t value (0-1).
 */
function applyEasing(t: number, easing: EasingCurve): number {
  if (easing.type === 'hold') return 0;  // Jump at end
  if (easing.type === 'linear') return t;
  
  // Get bezier control points
  let x1: number, y1: number, x2: number, y2: number;
  
  if (easing.type === 'custom') {
    x1 = easing.x1 ?? 0;
    y1 = easing.y1 ?? 0;
    x2 = easing.x2 ?? 1;
    y2 = easing.y2 ?? 1;
  } else {
    [x1, y1, x2, y2] = EASING_PRESETS[easing.type];
  }
  
  // Solve cubic bezier
  return solveCubicBezier(t, x1, y1, x2, y2);
}

/**
 * Solve cubic bezier curve for y given x.
 * Uses Newton-Raphson method.
 */
function solveCubicBezier(x: number, x1: number, y1: number, x2: number, y2: number): number {
  // ... numerical solver implementation
  // Standard cubic bezier implementation
}
```

### 4.2 Property Value Provider

**New File:** `src/hooks/usePropertyValues.ts`

```typescript
/**
 * Hook to get all transform property values for a layer at current frame.
 */
export function useLayerTransformValues(layerId: LayerId) {
  const layer = useTimelineStore((s) => s.layers.find((l) => l.id === layerId));
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  
  return useMemo(() => {
    if (!layer) return null;
    
    return {
      positionX: getPropertyValue(layer, 'transform.position.x', currentFrame),
      positionY: getPropertyValue(layer, 'transform.position.y', currentFrame),
      scale: getPropertyValue(layer, 'transform.scale', currentFrame),
      rotation: getPropertyValue(layer, 'transform.rotation', currentFrame),
      opacity: getPropertyValue(layer, 'transform.opacity', currentFrame),
      anchorX: getPropertyValue(layer, 'transform.anchorPoint.x', currentFrame),
      anchorY: getPropertyValue(layer, 'transform.anchorPoint.y', currentFrame),
    };
  }, [layer, currentFrame]);
}

function getPropertyValue(layer: Layer, path: PropertyPath, frame: number): number {
  const track = layer.propertyTracks.find((t) => t.propertyPath === path);
  if (!track || track.keyframes.length === 0) {
    return PROPERTY_DEFINITIONS[path].defaultValue as number;
  }
  return interpolateKeyframes(track.keyframes, frame, track.loopKeyframes);
}
```

### 4.3 Live Preview Updates

**Modify:** `src/components/features/KeyframeEditorPanel.tsx`

Ensure value changes update canvas immediately:

```typescript
// When value changes in editor, it updates store
// Store change triggers re-render of canvas via compositing
const handleValueChange = useCallback((value: number) => {
  updateKeyframe(layerId, trackId, keyframe.id, { value });
  // Canvas will re-composite automatically due to store subscription
}, [layerId, trackId, keyframe.id]);
```

### 4.4 Anchor Point Overlay

**New File:** `src/components/features/AnchorPointOverlay.tsx`

Visual overlay showing anchor point position and motion path:

**Features:**
- Crosshair at current anchor point position
- Motion path dots showing anchor position at each frame over time
- Motion path visualizes easing curves (dots cluster where motion is slow, spread where fast)
- Only visible when editing transform keyframes (position, anchor point)
- Purely visual - not interactive (future: bezier handles for path editing)

```typescript
export function AnchorPointOverlay() {
  const activeLayer = useTimelineStore((s) => {
    const id = s.view.activeLayerId;
    return s.layers.find((l) => l.id === id);
  });
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const editingKeyframeId = useTimelineStore((s) => s.view.editingKeyframeId);
  
  // Check if we're editing a transform property
  const isEditingTransform = useMemo(() => {
    if (!editingKeyframeId || !activeLayer) return false;
    for (const track of activeLayer.propertyTracks) {
      if (track.keyframes.some((k) => k.id === editingKeyframeId)) {
        return track.propertyPath.startsWith('transform.');
      }
    }
    return false;
  }, [editingKeyframeId, activeLayer]);
  
  // Calculate motion path points (one per frame)
  const motionPath = useMemo(() => {
    if (!activeLayer || !isEditingTransform) return [];
    
    const points: { x: number; y: number; frame: number }[] = [];
    for (let f = 0; f < durationFrames; f++) {
      const posX = getPropertyValue(activeLayer, 'transform.position.x', f);
      const posY = getPropertyValue(activeLayer, 'transform.position.y', f);
      const anchorX = getPropertyValue(activeLayer, 'transform.anchorPoint.x', f);
      const anchorY = getPropertyValue(activeLayer, 'transform.anchorPoint.y', f);
      points.push({ x: posX + anchorX, y: posY + anchorY, frame: f });
    }
    return points;
  }, [activeLayer, isEditingTransform, durationFrames]);
  
  if (!activeLayer || !isEditingTransform) return null;
  
  const anchorX = getPropertyValue(activeLayer, 'transform.anchorPoint.x', currentFrame);
  const anchorY = getPropertyValue(activeLayer, 'transform.anchorPoint.y', currentFrame);
  const posX = getPropertyValue(activeLayer, 'transform.position.x', currentFrame);
  const posY = getPropertyValue(activeLayer, 'transform.position.y', currentFrame);
  
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Motion path dots - shows easing via dot density */}
      {motionPath.map((point, idx) => (
        <div
          key={idx}
          className={cn(
            "absolute w-1.5 h-1.5 rounded-full -translate-x-1/2 -translate-y-1/2",
            point.frame === currentFrame ? "bg-yellow-400 w-2 h-2" : "bg-yellow-600/60"
          )}
          style={{
            left: point.x * cellWidth,
            top: point.y * cellHeight,
          }}
        />
      ))}
      
      {/* Crosshair at current anchor point */}
      <div
        className="absolute"
        style={{
          left: (anchorX + posX) * cellWidth,
          top: (anchorY + posY) * cellHeight,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Vertical line */}
        <div className="absolute w-0.5 h-8 bg-yellow-500 -translate-x-1/2 -translate-y-1/2" />
        {/* Horizontal line */}
        <div className="absolute w-8 h-0.5 bg-yellow-500 -translate-x-1/2 -translate-y-1/2" />
        {/* Center dot */}
        <div className="absolute w-3 h-3 rounded-full bg-yellow-400 border-2 border-yellow-600 -translate-x-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
}
```

**Integrate into CanvasOverlay:**

```typescript
// src/components/features/CanvasOverlay.tsx
export function CanvasOverlay() {
  return (
    <>
      {/* ... existing overlays */}
      <AnchorPointOverlay />
    </>
  );
}
```

### 4.5 Keyframe from Side Panel

When users adjust property values in side panels (e.g., transform controls), keyframes should be added automatically if the property is tracked:

**New File:** `src/hooks/useKeyframeableProperty.ts`

```typescript
/**
 * Hook for properties that can be keyframed.
 * Returns the current value and a setter that optionally creates keyframes.
 */
export function useKeyframeableProperty(
  layerId: LayerId,
  propertyPath: PropertyPath
) {
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const layer = useTimelineStore((s) => s.layers.find((l) => l.id === layerId));
  const addKeyframe = useTimelineStore((s) => s.addKeyframe);
  const updateKeyframe = useTimelineStore((s) => s.updateKeyframe);
  
  const track = layer?.propertyTracks.find((t) => t.propertyPath === propertyPath);
  
  const value = useMemo(() => {
    if (!layer) return PROPERTY_DEFINITIONS[propertyPath].defaultValue as number;
    return getPropertyValue(layer, propertyPath, currentFrame);
  }, [layer, propertyPath, currentFrame]);
  
  const setValue = useCallback((newValue: number) => {
    if (!layer) return;
    
    if (track) {
      // Property is tracked - update or create keyframe
      const existingKeyframe = track.keyframes.find((k) => k.frame === currentFrame);
      if (existingKeyframe) {
        updateKeyframe(layerId, track.id, existingKeyframe.id, { value: newValue });
      } else {
        addKeyframe(layerId, track.id, currentFrame, newValue);
      }
    }
    // If property not tracked, could show a prompt to add track
  }, [layer, track, currentFrame, layerId, addKeyframe, updateKeyframe]);
  
  const isKeyframed = track !== undefined;
  const hasKeyframeAtCurrentFrame = track?.keyframes.some((k) => k.frame === currentFrame);
  
  return { value, setValue, isKeyframed, hasKeyframeAtCurrentFrame };
}
```

### 4.6 Keyframe Icon in Side Panels

Add stopwatch/keyframe icon next to keyframeable properties:

```typescript
// Example: Transform controls in side panel
export function TransformControls() {
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  
  const posX = useKeyframeableProperty(activeLayerId, 'transform.position.x');
  const posY = useKeyframeableProperty(activeLayerId, 'transform.position.y');
  // ... other properties
  
  return (
    <div className="space-y-2">
      <PropertyRow
        label="Position X"
        value={posX.value}
        onChange={posX.setValue}
        isKeyframed={posX.isKeyframed}
        hasKeyframe={posX.hasKeyframeAtCurrentFrame}
        onToggleKeyframe={() => togglePropertyTrack(activeLayerId, 'transform.position.x')}
      />
      {/* ... other properties */}
    </div>
  );
}

function PropertyRow({ label, value, onChange, isKeyframed, hasKeyframe, onToggleKeyframe }) {
  return (
    <div className="flex items-center gap-2">
      {/* Keyframe stopwatch icon */}
      <button onClick={onToggleKeyframe}>
        <Clock className={cn(
          "w-4 h-4",
          isKeyframed ? "text-yellow-500" : "text-muted-foreground"
        )} />
      </button>
      
      <label className="text-sm w-24">{label}</label>
      
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-20"
      />
      
      {/* Diamond indicator if keyframe exists at current frame */}
      {hasKeyframe && <Diamond className="w-3 h-3 text-yellow-500" />}
    </div>
  );
}
```

### 4.7 Testing Checkpoint

- [ ] Keyframe interpolation calculates correct values
- [ ] All easing presets produce expected curves
- [ ] Custom bezier curves are draggable and apply correctly
- [ ] Loop keyframes repeat pattern correctly
- [ ] Live preview updates canvas when editing keyframe values
- [ ] Anchor point overlay shows at correct position
- [ ] Anchor point overlay visible when editing ANY transform keyframe
- [ ] Motion path dots show position at each frame
- [ ] Motion path dots density reflects easing (clustered = slow, spread = fast)
- [ ] Rotation works at 1° increments
- [ ] Rotation accounts for cell aspect ratio (looks correct)
- [ ] Cells rotated off-canvas are preserved (not deleted)
- [ ] Cells rotated back into canvas re-appear
- [ ] Keyframe icons appear in side panels for tracked properties
- [ ] Clicking keyframe icon adds property track to timeline
- [ ] Editing value in side panel creates/updates keyframe at current frame

---

## Phase 5: Export & Migration

**Duration:** 2-3 weeks  
**Goal:** Update all export formats, session format v2, and backward compatibility

### 5.1 Export Data Collector Updates

**Modify:** `src/utils/exportDataCollector.ts`

```typescript
export function collectExportData(): ExportDataBundle {
  const timelineState = useTimelineStore.getState();
  const canvasState = useCanvasStore.getState();
  
  return {
    // ... existing metadata fields
    
    // NEW: Timeline configuration
    timeline: {
      frameRate: timelineState.config.frameRate,
      durationFrames: timelineState.config.durationFrames,
      looping: timelineState.view.looping,
    },
    
    // NEW: Layers data
    layers: timelineState.layers,
    
    // NEW: Global effects
    globalEffects: timelineState.globalEffects,
    
    // COMPUTED: Frames for backward compatibility with export formats
    frames: computeFramesFromLayers(
      timelineState.layers,
      timelineState.config.frameRate,
      timelineState.config.durationFrames,
      canvasState.width,
      canvasState.height
    ),
    
    // ... other existing fields
  };
}

/**
 * Compute flattened frames from layer composition.
 * Used for video/image exports that need per-frame data.
 */
function computeFramesFromLayers(
  layers: Layer[],
  frameRate: number,
  durationFrames: number,
  canvasWidth: number,
  canvasHeight: number
): Frame[] {
  const frames: Frame[] = [];
  
  for (let f = 0; f < durationFrames; f++) {
    const compositedCells = compositeLayersAtFrame(layers, f, canvasWidth, canvasHeight);
    
    frames.push({
      id: `frame-${f}` as FrameId,
      name: `Frame ${f}`,
      duration: 1000 / frameRate,  // Convert frame to ms
      data: compositedCells,
    });
  }
  
  // Optimize: merge consecutive identical frames
  return mergeIdenticalFrames(frames);
}
```

### 5.2 Video Export Updates

**Modify:** `src/utils/videoExporter.ts`

Video export now uses composited frames:

```typescript
export async function exportVideo(settings: VideoExportSettings): Promise<Blob> {
  const { layers, config, canvasWidth, canvasHeight } = collectExportData();
  
  // Render each frame by compositing layers
  const frameCanvases: HTMLCanvasElement[] = [];
  
  for (let f = 0; f < config.durationFrames; f++) {
    const compositedCells = compositeLayersAtFrame(layers, f, canvasWidth, canvasHeight);
    const canvas = renderCellsToCanvas(compositedCells, settings);
    frameCanvases.push(canvas);
  }
  
  // Encode frames to video
  // ... existing FFmpeg or WebCodecs logic
}
```

### 5.3 Image Export Updates

**Modify:** `src/utils/exportRenderer.ts`

Image export composites all visible layers:

```typescript
export function exportImage(format: 'png' | 'jpeg', settings: ImageExportSettings): string {
  const { layers, config, canvasWidth, canvasHeight } = collectExportData();
  const currentFrame = useTimelineStore.getState().view.currentFrame;
  
  // Composite layers at current frame
  const compositedCells = compositeLayersAtFrame(layers, currentFrame, canvasWidth, canvasHeight);
  
  // Render to canvas
  const canvas = renderCellsToCanvas(compositedCells, settings);
  
  return canvas.toDataURL(`image/${format}`, settings.quality);
}
```

### 5.4 Session Export (Save)

**Modify:** `src/utils/sessionExporter.ts`

Always save in v2.0.0 format:

```typescript
export function exportSession(): SessionDataV2 {
  const timelineState = useTimelineStore.getState();
  const canvasState = useCanvasStore.getState();
  const toolState = useToolStore.getState();
  // ... other stores
  
  const sessionData: SessionDataV2 = {
    version: '2.0.0',
    
    name: useProjectStore.getState().name,
    description: useProjectStore.getState().description,
    
    metadata: {
      exportedAt: new Date().toISOString(),
      exportVersion: VERSION,
      userAgent: navigator.userAgent,
    },
    
    canvas: {
      width: canvasState.width,
      height: canvasState.height,
      canvasBackgroundColor: canvasState.canvasBackgroundColor,
      showGrid: canvasState.showGrid,
    },
    
    timeline: {
      frameRate: timelineState.config.frameRate,
      durationFrames: timelineState.config.durationFrames,
      looping: timelineState.view.looping,
    },
    
    layers: serializeLayers(timelineState.layers),
    
    globalEffects: serializeEffects(timelineState.globalEffects),
    
    // Preserved fields
    tools: serializeToolState(toolState),
    ui: serializeUIState(),
    typography: serializeTypography(),
    palettes: serializePalettes(),
    characterPalettes: serializeCharacterPalettes(),
  };
  
  return sessionData;
}

function serializeLayers(layers: Layer[]): SessionLayerV2[] {
  return layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    solo: layer.solo,
    locked: layer.locked,
    opacity: layer.opacity,
    contentFrames: layer.contentFrames.map((cf) => ({
      id: cf.id,
      name: cf.name,
      startFrame: cf.startFrame,
      durationFrames: cf.durationFrames,
      data: Object.fromEntries(cf.data),  // Map → Object for JSON
    })),
    propertyTracks: layer.propertyTracks.map((track) => ({
      id: track.id,
      propertyPath: track.propertyPath,
      loopKeyframes: track.loopKeyframes,
      keyframes: track.keyframes.map((kf) => ({
        id: kf.id,
        frame: kf.frame,
        value: kf.value,
        easing: kf.easing,
      })),
    })),
  }));
}
```

### 5.5 Session Import (Load)

**Modify:** `src/utils/sessionImporter.ts`

Handle both v1 and v2 formats:

```typescript
export async function importSession(fileOrData: File | string | object): Promise<void> {
  let rawData: unknown;
  
  if (fileOrData instanceof File) {
    rawData = JSON.parse(await fileOrData.text());
  } else if (typeof fileOrData === 'string') {
    rawData = JSON.parse(fileOrData);
  } else {
    rawData = fileOrData;
  }
  
  // Detect version
  const version = detectSessionVersion(rawData);
  
  let sessionV2: SessionDataV2;
  
  if (version === '1.0.0') {
    // Migrate v1 to v2
    sessionV2 = migrateV1ToV2(rawData as SessionData);
    console.log('Migrated v1.0.0 session to v2.0.0 format');
  } else if (version === '2.0.0') {
    sessionV2 = rawData as SessionDataV2;
  } else {
    throw new Error('Unknown session format version');
  }
  
  // Load into stores
  loadSessionIntoStores(sessionV2);
}

function loadSessionIntoStores(session: SessionDataV2): void {
  // Load canvas settings
  useCanvasStore.getState().setDimensions(session.canvas.width, session.canvas.height);
  useCanvasStore.getState().setBackgroundColor(session.canvas.canvasBackgroundColor);
  useCanvasStore.getState().setShowGrid(session.canvas.showGrid);
  
  // Load timeline configuration
  useTimelineStore.getState().setFrameRate(session.timeline.frameRate);
  useTimelineStore.getState().setDuration(session.timeline.durationFrames);
  useTimelineStore.getState().setLooping(session.timeline.looping);
  
  // Load layers
  const layers = deserializeLayers(session.layers);
  useTimelineStore.setState({ layers });
  
  // Load global effects
  if (session.globalEffects) {
    const effects = deserializeEffects(session.globalEffects);
    useTimelineStore.setState({ globalEffects: effects });
  }
  
  // Load preserved state
  if (session.tools) loadToolState(session.tools);
  if (session.ui) loadUIState(session.ui);
  if (session.typography) loadTypography(session.typography);
  if (session.palettes) loadPalettes(session.palettes);
  if (session.characterPalettes) loadCharacterPalettes(session.characterPalettes);
  
  // Set first layer as active
  if (layers.length > 0) {
    useTimelineStore.getState().setActiveLayer(layers[0].id);
  }
  
  // Load first layer's content into canvas
  useCanvasStore.getState().syncFromContentFrame();
}
```

### 5.6 Cloud Storage Updates

**Modify:** `packages/premium/src/services/projectService.ts`

Cloud storage continues to use `canvas_data` column with SessionDataV2:

```typescript
export async function saveProject(project: CloudProject): Promise<void> {
  const sessionData = exportSession();  // Returns SessionDataV2
  
  // Compress if large
  const jsonString = JSON.stringify(sessionData);
  const data = jsonString.length > 100 * 1024
    ? await compressData(jsonString)
    : jsonString;
  
  const { error } = await supabase
    .from('projects')
    .update({
      name: sessionData.name,
      canvas_data: data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', project.id);
  
  if (error) throw error;
}

export async function loadProject(projectId: string): Promise<void> {
  const { data, error } = await supabase
    .from('projects')
    .select('canvas_data')
    .eq('id', projectId)
    .single();
  
  if (error) throw error;
  
  // Decompress if needed
  let sessionData = data.canvas_data;
  if (typeof sessionData === 'string' && sessionData.startsWith('H4sI')) {
    sessionData = JSON.parse(await decompressData(sessionData));
  }
  
  // Import handles version detection and migration
  await importSession(sessionData);
}
```

### 5.7 Community Preview Updates

**Modify:** `packages/premium/src/utils/previewGenerator.ts`

Generate composited preview for community gallery:

```typescript
export async function generateProjectPreview(projectId: string): Promise<string> {
  const { layers, config, canvasWidth, canvasHeight } = collectExportData();
  
  // Composite first frame
  const compositedCells = compositeLayersAtFrame(layers, 0, canvasWidth, canvasHeight);
  
  // Render to canvas at preview size
  const canvas = renderCellsToCanvas(compositedCells, {
    width: 1000,
    height: 1000,
    quality: 0.9,
  });
  
  // Convert to WebP
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
  
  // Upload to storage
  const path = `project-previews/${projectId}/preview.webp`;
  await uploadToStorage(path, blob);
  
  return getPublicUrl(path);
}
```

### 5.8 HTML Export Updates

**Modify:** HTML export to handle layer data:

```typescript
export function exportHTML(settings: HTMLExportSettings): string {
  const { layers, config, canvasWidth, canvasHeight } = collectExportData();
  
  // Pre-compute all frames
  const frames: { data: string; duration: number }[] = [];
  
  for (let f = 0; f < config.durationFrames; f++) {
    const compositedCells = compositeLayersAtFrame(layers, f, canvasWidth, canvasHeight);
    frames.push({
      data: serializeCellsForHTML(compositedCells),
      duration: 1000 / config.frameRate,
    });
  }
  
  // Generate HTML with embedded player
  return generateHTMLTemplate(frames, settings);
}
```

### 5.9 Testing Checkpoint

- [ ] Session exports save in v2.0.0 format
- [ ] Session imports detect v1.0.0 and migrate correctly
- [ ] Session imports load v2.0.0 format correctly
- [ ] Cloud save works with new format (compression if needed)
- [ ] Cloud load works with both old and new projects
- [ ] Image export composites all layers
- [ ] Video export renders all frames from layers
- [ ] HTML export plays back correctly
- [ ] Community preview shows composited first frame
- [ ] All 10+ export formats work correctly

---

## Phase 6: Integration

**Duration:** 2-3 weeks  
**Goal:** Effects system, MCP protocol v2, and polish

### 6.1 Effects System Layer Integration

**Modify:** `src/stores/effectsStore.ts`

Add layer targeting and effect ordering:

```typescript
interface EffectsState {
  // Layer-specific effects (keyed by layerId)
  layerEffects: Map<LayerId, EffectInstance[]>;
  
  // Global effects (apply to composited result)
  globalEffects: EffectInstance[];
  
  // Actions
  addEffect: (effectType: string, scope: EffectScope, layerId?: LayerId) => void;
  removeEffect: (effectId: string) => void;
  reorderEffects: (effectId: string, newIndex: number) => void;
  toggleEffectScope: (effectId: string) => void;  // Switch between layer/global
}
```

**Effect Application Order:**

1. Per-layer effects (in order) for each layer
2. Layer compositing
3. Global effects (in order) on composited result

### 6.2 Effects Timeline Track

When an effect is layer-scoped, its keyframeable properties appear in the layer's property tracks:

```typescript
// In LayerListItem.tsx, show effect properties when expanded
{layer.propertyTracks
  .filter((t) => t.propertyPath.startsWith('effect.'))
  .map((track) => (
    <PropertyTrackRow key={track.id} layerId={layer.id} track={track} />
  ))
}
```

Global effects appear in a separate "Effects" section at the bottom of the timeline:

```typescript
// In TimelinePanel.tsx
{globalEffects.length > 0 && (
  <div className="border-t">
    <h3 className="text-sm font-semibold p-2">Global Effects</h3>
    {globalEffects.map((effect) => (
      <EffectTrackRow key={effect.id} effect={effect} />
    ))}
  </div>
)}
```

### 6.3 Generator Integration

**Purpose:** Generators always create new layers with their output. Each generator run produces a new layer named after the generator type.

**Current Generator Types:**
- Radio Waves
- Turbulent Noise
- Particle Physics
- Rain Drops
- Digital Rain (Matrix)

**Behavioral Changes:**

1. **Always Creates New Layer**: Generators no longer have "overwrite" or "append" modes. Each run creates a fresh layer.

2. **Layer Naming**: Auto-incrementing names like "Radio Waves 1", "Digital Rain 2"

3. **Insert Position**: New generator layer is inserted **above the currently selected layer** (or at top if nothing selected)

**Store Updates:**

```typescript
// Modify src/stores/generatorStore.ts

interface GeneratorState {
  // ... existing fields
  
  // REMOVED: importMode (no longer needed - always creates new layer)
  
  // Track generator instance counts for naming
  generatorCounts: Record<GeneratorId, number>;
}

applyGenerator: async () => {
  const { activeGeneratorId, convertedFrames, generatorCounts } = get();
  const timelineStore = useTimelineStore.getState();
  
  if (!activeGeneratorId || convertedFrames.length === 0) return false;
  
  // Increment count for naming
  const count = (generatorCounts[activeGeneratorId] ?? 0) + 1;
  set((s) => ({
    generatorCounts: { ...s.generatorCounts, [activeGeneratorId]: count },
  }));
  
  // Generate layer name
  const generatorNames: Record<GeneratorId, string> = {
    'radio-waves': 'Radio Waves',
    'turbulent-noise': 'Turbulent Noise',
    'particle-physics': 'Particle Physics',
    'rain-drops': 'Rain Drops',
    'digital-rain': 'Digital Rain',
  };
  const layerName = `${generatorNames[activeGeneratorId]} ${count}`;
  
  // Convert frames to content frames
  const { frameRate } = timelineStore.config;
  const contentFrames: ContentFrame[] = convertedFrames.map((frame, idx) => ({
    id: generateContentFrameId(),
    name: `${layerName} - Frame ${idx + 1}`,
    startFrame: idx,
    durationFrames: 1,
    data: frame.data,
  }));
  
  // Create new layer
  const newLayer: Layer = {
    id: generateLayerId(),
    name: layerName,
    visible: true,
    solo: false,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    contentFrames,
    propertyTracks: [],
  };
  
  // Find insert position (above currently selected layer)
  const activeLayerId = timelineStore.view.activeLayerId;
  const layers = timelineStore.layers;
  let insertIndex = layers.length; // Default: top
  
  if (activeLayerId) {
    const activeIndex = layers.findIndex((l) => l.id === activeLayerId);
    if (activeIndex !== -1) {
      insertIndex = activeIndex + 1; // Above active layer
    }
  }
  
  // Record for undo
  recordHistoryAction({
    type: 'GENERATOR_APPLY',
    generatorId: activeGeneratorId,
    newLayer,
    insertIndex,
  });
  
  // Insert layer
  const newLayers = [
    ...layers.slice(0, insertIndex),
    newLayer,
    ...layers.slice(insertIndex),
  ];
  
  timelineStore.setState({
    layers: newLayers,
    view: { ...timelineStore.view, activeLayerId: newLayer.id },
  });
  
  return true;
},
```

**UI Updates:**

```typescript
// Modify GeneratorPanel.tsx

// Remove import mode toggle (overwrite/append)
// Replace with informational text
<div className="text-sm text-muted-foreground">
  Generator output will create a new layer above the current selection.
</div>

// Update apply button
<Button onClick={applyGenerator}>
  Create Layer
</Button>
```

**History Action:**

```typescript
// Add to history types
interface GeneratorApplyAction {
  type: 'GENERATOR_APPLY';
  generatorId: string;
  newLayer: Layer;
  insertIndex: number;
}

// Undo: remove the created layer
// Redo: re-insert the layer at insertIndex
```

### 6.4 Effect Scope Toggle

Add toggle to all effect UIs:

```typescript
export function EffectPanel({ effectId }) {
  const effect = useEffectsStore((s) => findEffect(s, effectId));
  const toggleScope = useEffectsStore((s) => s.toggleEffectScope);
  
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">Apply to:</span>
        <Switch
          checked={effect.scope === 'layer'}
          onCheckedChange={() => toggleScope(effectId)}
        />
        <span className="text-sm">
          {effect.scope === 'layer' ? 'Active Layer' : 'All Layers (Global)'}
        </span>
      </div>
      {/* Effect-specific controls */}
    </div>
  );
}
```

### 6.4 MCP Protocol v2.0.0

**Modify:** `ascii-motion-mcp/src/types.ts`

Add layer types to MCP:

```typescript
// ascii-motion-mcp/src/types.ts

export interface MCPLayer {
  id: string;
  name: string;
  visible: boolean;
  solo: boolean;
  locked: boolean;
  opacity: number;
  contentFrameCount: number;
  propertyTrackCount: number;
}

export interface MCPKeyframe {
  frame: number;
  value: number;
  easing: string;
}

export interface MCPProjectV2 {
  version: '2.0.0';
  canvas: {
    width: number;
    height: number;
  };
  timeline: {
    frameRate: number;
    durationFrames: number;
  };
  layers: MCPLayer[];
}
```

**Modify:** `ascii-motion-mcp/src/tools/animation.ts`

Add layer management tools:

```typescript
// New MCP tools for layer management

export const layerTools = {
  'add_layer': {
    description: 'Add a new layer to the project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Layer name' },
      },
    },
    handler: async ({ name }) => {
      return await sendCommand('addLayer', { name });
    },
  },
  
  'remove_layer': {
    description: 'Remove a layer by ID',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string', description: 'Layer ID' },
      },
      required: ['layerId'],
    },
    handler: async ({ layerId }) => {
      return await sendCommand('removeLayer', { layerId });
    },
  },
  
  'set_active_layer': {
    description: 'Set the active layer for drawing operations',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string', description: 'Layer ID' },
      },
      required: ['layerId'],
    },
    handler: async ({ layerId }) => {
      return await sendCommand('setActiveLayer', { layerId });
    },
  },
  
  'add_keyframe': {
    description: 'Add a keyframe to a layer property',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        propertyPath: { type: 'string' },
        frame: { type: 'number' },
        value: { type: 'number' },
        easing: { type: 'string', default: 'linear' },
      },
      required: ['layerId', 'propertyPath', 'frame', 'value'],
    },
    handler: async (params) => {
      return await sendCommand('addKeyframe', params);
    },
  },
  
  'get_layers': {
    description: 'Get list of all layers in the project',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      return await sendCommand('getLayers');
    },
  },
  
  'go_to_frame': {
    description: 'Move playhead to a specific frame',
    inputSchema: {
      type: 'object',
      properties: {
        frame: { type: 'number', description: 'Frame number' },
      },
      required: ['frame'],
    },
    handler: async ({ frame }) => {
      return await sendCommand('goToFrame', { frame });
    },
  },
};
```

### 6.5 MCP Resources Update

**Modify:** `ascii-motion-mcp/src/resources/guide.ts`

Update guide with layer system documentation:

```typescript
export const guideResource = {
  uri: 'guide://layer-timeline',
  name: 'Layer Timeline Guide',
  mimeType: 'text/markdown',
  content: `
# ASCII Motion Layer Timeline System

## Overview

ASCII Motion v2.0 introduces a layer-based timeline system similar to After Effects.

## Layers

Each project contains one or more layers. Layers are composited from bottom to top,
with upper layers obscuring lower layers where they overlap.

### Layer Properties
- **visible**: Show/hide layer in render and export
- **solo**: Only render this layer (for isolation)
- **locked**: Prevent editing
- **opacity**: Layer transparency (0-100%)

## Content Frames

Layers contain content frames - segments of ASCII canvas data with duration.
Content frames can be:
- Dragged to reposition in time
- Resized by dragging edges
- Duplicated and deleted

## Transform Keyframes

Each layer has keyframeable transform properties:
- Position X/Y (in cells)
- Scale (1.0 = 100%)
- Rotation (in 90° increments)
- Opacity (0-100%)
- Anchor Point X/Y (rotation/scale center)

### Easing

Keyframes support cubic bezier easing:
- linear, ease-in, ease-out, ease-in-out
- Custom bezier curves
- Hold (no interpolation)

## API Examples

### Add a layer
\`\`\`json
{ "tool": "add_layer", "arguments": { "name": "Background" } }
\`\`\`

### Add position keyframe
\`\`\`json
{
  "tool": "add_keyframe",
  "arguments": {
    "layerId": "layer-1",
    "propertyPath": "transform.position.x",
    "frame": 0,
    "value": 0,
    "easing": "ease-out"
  }
}
\`\`\`
`,
};
```

### 6.6 Version Bump

**Modify:** `ascii-motion-mcp/package.json`

```json
{
  "name": "@asciimotion/mcp",
  "version": "2.0.0",
  ...
}
```

### 6.7 Testing Checkpoint

- [ ] Layer effects apply in correct order
- [ ] Global effects apply after layer compositing
- [ ] Effect scope toggle works (layer ↔ global)
- [ ] Effect property keyframes appear in timeline
- [ ] Effects applied to group affect all layers in group individually
- [ ] Generators always create new layers (no overwrite/append mode)
- [ ] Generator layers are named with increment ("Radio Waves 1", "Radio Waves 2")
- [ ] Generator layers insert above currently selected layer
- [ ] Generator apply is undoable
- [ ] All 5 generator types work with new layer system
- [ ] MCP `add_layer` tool works
- [ ] MCP `add_keyframe` tool works
- [ ] MCP `get_layers` returns correct data
- [ ] MCP guide resource is updated
- [ ] MCP version is 2.0.0

---

## File Change Matrix

### Main Repository (Ascii-Motion)

| File | Phase | Change Type | Description |
|------|-------|-------------|-------------|
| `src/types/timeline.ts` | 1 | NEW | All timeline type definitions |
| `src/types/easing.ts` | 1 | NEW | Easing curve utilities |
| `src/stores/timelineStore.ts` | 1 | NEW | Timeline state management |
| `src/stores/historyStore.ts` | 1 | MODIFY | Add layer action types |
| `src/utils/sessionMigration.ts` | 1 | NEW | v1→v2 migration |
| `src/stores/canvasStore.ts` | 2 | MODIFY | Active layer sync |
| `src/utils/layerCompositing.ts` | 2 | NEW | Layer rendering |
| `src/hooks/useCanvasRenderer.ts` | 2 | MODIFY | Use layer compositing |
| `src/hooks/useLayerLimit.ts` | 2 | NEW | Subscription tier check |
| `src/components/features/Header.tsx` | 2 | MODIFY | Layer indicator |
| `src/stores/toolStore.ts` | 2 | MODIFY | Layer targeting toggle |
| `src/components/layout/MainLayout.tsx` | 3 | MODIFY | Resizable panel |
| `src/components/features/TimelineTabs.tsx` | 3 | NEW | View tabs |
| `src/components/features/LayerList.tsx` | 3 | NEW | Layer panel |
| `src/components/features/LayerListItem.tsx` | 3 | NEW | Layer row |
| `src/components/features/PropertyTrackRow.tsx` | 3 | NEW | Property track |
| `src/components/features/AddPropertyButton.tsx` | 3 | NEW | Add property menu |
| `src/components/features/TimelineRuler.tsx` | 3 | NEW | Ruler & playhead |
| `src/components/features/ContentFrameBlock.tsx` | 3 | NEW | Draggable frames |
| `src/components/features/KeyframeDiamond.tsx` | 3 | NEW | Keyframe UI |
| `src/components/features/KeyframeEditorPanel.tsx` | 3 | NEW | Keyframe editor |
| `src/components/features/EasingCurveEditor.tsx` | 3 | NEW | Bezier editor |
| `src/components/features/TimecodeDisplay.tsx` | 3 | NEW | Timecode formats |
| `src/utils/keyframeInterpolation.ts` | 4 | NEW | Value interpolation |
| `src/hooks/usePropertyValues.ts` | 4 | NEW | Property value hook |
| `src/hooks/useKeyframeableProperty.ts` | 4 | NEW | Side panel hook |
| `src/components/features/AnchorPointOverlay.tsx` | 4 | NEW | Anchor + motion path overlay |
| `src/components/features/CanvasOverlay.tsx` | 4 | MODIFY | Add anchor overlay |
| `src/components/features/GroupListItem.tsx` | 2 | NEW | Group UI in timeline |
| `src/utils/transformComposition.ts` | 2 | NEW | Group + layer transform composition |
| `src/utils/exportDataCollector.ts` | 5 | MODIFY | Layer data collection |
| `src/utils/videoExporter.ts` | 5 | MODIFY | Layer compositing |
| `src/utils/exportRenderer.ts` | 5 | MODIFY | Layer compositing |
| `src/utils/sessionExporter.ts` | 5 | MODIFY | v2 format |
| `src/utils/sessionImporter.ts` | 5 | MODIFY | v1/v2 loading |
| `src/stores/effectsStore.ts` | 6 | MODIFY | Layer effects |

### Premium Submodule

| File | Phase | Change Type | Description |
|------|-------|-------------|-------------|
| `src/stores/subscriptionStore.ts` | 2 | MODIFY | Max layers per tier |
| `src/services/projectService.ts` | 5 | MODIFY | v2 format handling |
| `src/utils/previewGenerator.ts` | 5 | MODIFY | Composited preview |

### MCP Package (ascii-motion-mcp)

| File | Phase | Change Type | Description |
|------|-------|-------------|-------------|
| `src/types.ts` | 6 | MODIFY | Add layer types |
| `src/tools/animation.ts` | 6 | MODIFY | Layer tools |
| `src/tools/index.ts` | 6 | MODIFY | Export layer tools |
| `src/resources/guide.ts` | 6 | MODIFY | Layer documentation |
| `package.json` | 6 | MODIFY | Version bump to 2.0.0 |

---

## Testing Strategy

### Unit Tests

- Keyframe interpolation with all easing types
- Layer compositing with visibility/solo/lock
- Session migration v1→v2
- Property value calculation at any frame

### Integration Tests

- Full save/load cycle with layers
- Export all formats with multi-layer projects
- Cloud storage with compression
- MCP tool round-trips

### Manual Testing Checklist

#### Phase 1
- [ ] Create project, verify timeline store initializes
- [ ] Add/remove layers via console
- [ ] Verify undo/redo for layer operations

#### Phase 2
- [ ] Add 5 layers (free tier limit)
- [ ] Attempt 6th layer, see upgrade prompt
- [ ] Toggle visibility, solo, lock
- [ ] Rename layers
- [ ] Reorder layers
- [ ] Draw on different layers
- [ ] Verify compositing renders correctly

#### Phase 3
- [ ] Resize bottom panel via drag
- [ ] Switch between Frames and Timeline views
- [ ] Expand/collapse layers
- [ ] Add properties via menu
- [ ] Drag content frame edges to resize
- [ ] Drag keyframe diamonds
- [ ] Edit keyframe in side panel
- [ ] Use easing presets
- [ ] Create custom easing curve

#### Phase 4
- [ ] Keyframe position animation plays correctly
- [ ] Keyframe scale snaps to whole cells
- [ ] Keyframe rotation snaps to 90°
- [ ] Anchor point overlay shows when editing
- [ ] Live preview updates on value change
- [ ] Loop keyframes repeat correctly

#### Phase 5
- [ ] Save project, verify v2.0.0 format
- [ ] Load old v1.0.0 project, verify migration
- [ ] Load v2.0.0 project
- [ ] Export PNG with layers
- [ ] Export video with layers
- [ ] Cloud save with layers
- [ ] Community preview shows composited frame

#### Phase 6
- [ ] Add effect to layer
- [ ] Toggle effect scope
- [ ] Verify effect render order
- [ ] MCP add_layer works
- [ ] MCP add_keyframe works
- [ ] MCP get_layers returns data

---

## Performance Considerations

### Layer Compositing

**Challenge**: Compositing multiple layers on every frame could impact 60fps rendering.

**Mitigations**:

1. **Per-Layer Render Cache**: Cache each layer's transformed cells until layer content or keyframes change
2. **Dirty Tracking**: Only re-composite when layers actually change
3. **Top-Down Early Exit**: Since only the topmost non-empty cell matters, iterate layers from top to bottom and skip covered cells
4. **Frame Caching**: Cache composited frames during playback (memory permitting)

```typescript
// Example: Cached layer compositing
const layerCaches = new Map<LayerId, {
  frame: number;
  transforms: TransformValues;
  cells: Map<string, Cell>;
}>();

function getLayerCells(layer: Layer, frame: number): Map<string, Cell> {
  const cache = layerCaches.get(layer.id);
  const currentTransforms = getTransformValues(layer, frame);
  
  if (cache && cache.frame === frame && deepEqual(cache.transforms, currentTransforms)) {
    return cache.cells;
  }
  
  const cells = computeLayerCells(layer, frame);
  layerCaches.set(layer.id, { frame, transforms: currentTransforms, cells });
  return cells;
}
```

### Timeline UI

**Challenge**: Many keyframe diamonds and property tracks could cause render lag.

**Mitigations**:

1. **Virtualization**: Only render visible timeline region
2. **Canvas Rendering**: Use canvas instead of DOM for keyframe diamonds
3. **Debounced Updates**: Batch timeline scroll/zoom updates

### Session File Size

**Challenge**: Layer data increases file size.

**Mitigations**:

1. **Compression**: Already implemented (gzip for files >100KB)
2. **Layer Limits**: 5 layers for free tier
3. **Shared Content Frames**: If same content appears in multiple places, reference instead of duplicate

---

## Backward Compatibility

### Loading Old Projects

1. **Version Detection**: Check `version` field in session data
2. **Automatic Migration**: Convert v1.0.0 to v2.0.0 on load
3. **Single Layer Conversion**: Old frames become content frames in one layer
4. **Duration Conversion**: Frame duration (ms) → content frame duration (frames)

### API Compatibility

| Old API | New API | Migration |
|---------|---------|-----------|
| `animationStore.frames` | `timelineStore.layers[].contentFrames` | Access via compositing |
| `animationStore.currentFrameIndex` | `timelineStore.view.currentFrame` | Direct mapping |
| `animationStore.frameRate` | `timelineStore.config.frameRate` | Direct mapping |
| `canvasStore.cells` | Active layer's content frame | Sync via `syncFromContentFrame` |

### Export Compatibility

All export formats continue to work by using `computeFramesFromLayers()` to generate flattened frames for export.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance degradation with many layers | Medium | High | Aggressive caching, layer limits |
| Breaking existing projects | Low | Critical | Thorough migration testing, v1 format preserved |
| UI complexity overwhelming users | Medium | Medium | Frame view as simpler alternative |
| MCP protocol breaking changes | Low | Medium | Version bump, clear migration docs |
| Cloud storage size increase | Medium | Low | Compression, tier limits |
| Undo/redo state explosion | Medium | Medium | Batch related actions, limit history depth |

---

## Resolved Design Decisions

1. **Layer Blend Modes**: 
   - **Decision**: No blend modes. Always "top wins" layering based on z-order in the timeline layer list.
   - **Rationale**: ASCII characters cannot blend - only one character can occupy a cell.

2. **Layer Groups**: 
   - **Decision**: Support one level of layer grouping.
   - Groups have their own transform properties (applied before child layer transforms)
   - Effects applied to a group are applied to each layer individually (no flattening)
   - Groups can be collapsed in the timeline UI
   - Groups cannot contain other groups (single nesting level)

3. **Audio Track**: 
   - **Decision**: No audio support in this refactor.
   - May be considered for a future version.

4. **Keyboard Shortcuts**: 
   - **Decision**: Keyboard shortcuts for layer operations will be added during the polish phase.
   - Will follow existing shortcut patterns in the application.

---

## Appendix: Migration Examples

### Example v1.0.0 Session

```json
{
  "version": "1.0.0",
  "animation": {
    "frames": [
      { "id": "f1", "name": "Frame 1", "duration": 100, "data": { "0,0": { "char": "H", "color": "#fff", "bgColor": "#000" } } },
      { "id": "f2", "name": "Frame 2", "duration": 100, "data": { "1,0": { "char": "i", "color": "#fff", "bgColor": "#000" } } }
    ],
    "frameRate": 24,
    "looping": true
  }
}
```

### Migrated to v2.0.0

```json
{
  "version": "2.0.0",
  "timeline": {
    "frameRate": 24,
    "durationFrames": 5,
    "looping": true
  },
  "layers": [
    {
      "id": "layer-1",
      "name": "Layer 1",
      "visible": true,
      "solo": false,
      "locked": false,
      "opacity": 100,
      "contentFrames": [
        { "id": "f1", "name": "Frame 1", "startFrame": 0, "durationFrames": 2, "data": { "0,0": { "char": "H", "color": "#fff", "bgColor": "#000" } } },
        { "id": "f2", "name": "Frame 2", "startFrame": 2, "durationFrames": 3, "data": { "1,0": { "char": "i", "color": "#fff", "bgColor": "#000" } } }
      ],
      "propertyTracks": []
    }
  ]
}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-01 | Copilot | Initial plan |
