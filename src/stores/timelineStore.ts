/**
 * Timeline Store
 * 
 * Central state management for the layer-based timeline system.
 * Replaces animationStore as the source of truth for animation data.
 * 
 * Part of the Layer Timeline Refactor (v2.0.0)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §1.3
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Cell } from '../types';
import { useCanvasStore } from './canvasStore';
import type {
  Layer,
  LayerId,
  LayerGroup,
  LayerGroupId,
  ContentFrame,
  ContentFrameId,
  PropertyTrack,
  PropertyTrackId,
  Keyframe,
  KeyframeId,
  PropertyPath,
  TimelineConfig,
  TimelineViewState,
  EffectInstance,
  SessionDataV2,
} from '../types/timeline';
import {
  generateLayerId,
  generateLayerGroupId,
  generateContentFrameId,
  generateKeyframeId,
  generatePropertyTrackId,
  createDefaultLayer,
  contentFramesOverlap,
} from '../types/timeline';
import { defaultEasing } from '../types/easing';
import { canAddLayer } from '../utils/layerLimits';

// ============================================
// STORE INTERFACE
// ============================================

export interface TimelineState {
  // Configuration
  config: TimelineConfig;

  // Layers (ordered by z-index, first = bottom)
  layers: Layer[];

  // Layer groups
  layerGroups: LayerGroup[];

  // Global effects
  globalEffects: EffectInstance[];

  // View state
  view: TimelineViewState;

  // ============================================
  // LAYER ACTIONS
  // ============================================

  addLayer: (name?: string) => LayerId | null;
  removeLayer: (layerId: LayerId) => void;
  duplicateLayer: (layerId: LayerId) => LayerId | null;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  renameLayer: (layerId: LayerId, name: string) => void;

  setLayerVisible: (layerId: LayerId, visible: boolean) => void;
  setLayerSolo: (layerId: LayerId, solo: boolean) => void;
  setLayerLocked: (layerId: LayerId, locked: boolean) => void;
  setLayerSyncKeyframes: (layerId: LayerId, sync: boolean) => void;
  setLayerOpacity: (layerId: LayerId, opacity: number) => void;
  setStaticProperty: (layerId: LayerId, propertyPath: string, value: number) => void;

  getActiveLayer: () => Layer | null;
  setActiveLayer: (layerId: LayerId | null) => void;

  /** Get a layer by ID */
  getLayer: (layerId: LayerId) => Layer | undefined;

  // ============================================
  // CONTENT FRAME ACTIONS
  // ============================================

  addContentFrame: (
    layerId: LayerId,
    startFrame: number,
    durationFrames: number,
    data?: Map<string, Cell>
  ) => ContentFrameId | null;
  removeContentFrame: (layerId: LayerId, frameId: ContentFrameId) => void;
  updateContentFrameTiming: (
    layerId: LayerId,
    frameId: ContentFrameId,
    startFrame: number,
    durationFrames: number,
  ) => boolean;
  updateContentFrameData: (
    layerId: LayerId,
    frameId: ContentFrameId,
    data: Map<string, Cell>
  ) => void;

  /** Split a content frame at the given frame position into two frames */
  splitContentFrame: (
    layerId: LayerId,
    frameId: ContentFrameId,
    atFrame: number,
  ) => ContentFrameId | null;

  /** Duplicate a content frame, placing the copy immediately after the original */
  duplicateContentFrame: (
    layerId: LayerId,
    frameId: ContentFrameId,
  ) => ContentFrameId | null;

  getContentFrameAt: (layerId: LayerId, frame: number) => ContentFrame | null;

  // ============================================
  // KEYFRAME ACTIONS
  // ============================================

  addPropertyTrack: (layerId: LayerId, propertyPath: PropertyPath) => PropertyTrackId;
  removePropertyTrack: (layerId: LayerId, trackId: PropertyTrackId) => void;

  addKeyframe: (
    layerId: LayerId,
    trackId: PropertyTrackId,
    frame: number,
    value: number,
  ) => KeyframeId;
  removeKeyframe: (
    layerId: LayerId,
    trackId: PropertyTrackId,
    keyframeId: KeyframeId,
  ) => void;
  updateKeyframe: (
    layerId: LayerId,
    trackId: PropertyTrackId,
    keyframeId: KeyframeId,
    updates: Partial<Pick<Keyframe, 'frame' | 'value' | 'easing'>>,
  ) => void;
  moveKeyframe: (
    layerId: LayerId,
    trackId: PropertyTrackId,
    keyframeId: KeyframeId,
    newFrame: number,
  ) => void;
  setKeyframeLooping: (
    layerId: LayerId,
    trackId: PropertyTrackId,
    looping: boolean,
  ) => void;

  // ============================================
  // PLAYBACK ACTIONS
  // ============================================

  goToFrame: (frame: number) => void;
  nextFrame: () => void;
  previousFrame: () => void;

  setPlaying: (playing: boolean) => void;
  setLooping: (looping: boolean) => void;
  setFrameRate: (fps: number, maintainDuration?: boolean) => void;
  setDuration: (frames: number) => void;

  // ============================================
  // TIMELINE AUTO-EXPAND
  // ============================================

  ensureTimelineContains: (frame: number) => void;

  // ============================================
  // VIEW ACTIONS
  // ============================================

  setActiveView: (view: 'frames' | 'layers') => void;
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  setPanelHeight: (height: number) => void;

  selectKeyframes: (keyframeIds: KeyframeId[]) => void;
  addKeyframesToSelection: (keyframeIds: KeyframeId[]) => void;
  toggleKeyframeSelected: (keyframeId: KeyframeId) => void;
  clearKeyframeSelection: () => void;
  selectContentFrames: (frameIds: ContentFrameId[]) => void;
  addContentFramesToSelection: (frameIds: ContentFrameId[]) => void;
  toggleContentFrameSelected: (frameId: ContentFrameId) => void;
  clearContentFrameSelection: () => void;
  toggleContentFrameHidden: (layerId: LayerId, frameIds: ContentFrameId[], hidden: boolean) => void;
  setContentFrameDragPreview: (preview: TimelineViewState['contentFrameDragPreview']) => void;
  setEditingKeyframe: (keyframeId: KeyframeId | null) => void;
  setKeyframeDuplicateGhosts: (ghosts: Map<KeyframeId, number>) => void;
  clearKeyframeDuplicateGhosts: () => void;
  setShowLayerProperties: (show: boolean) => void;
  toggleLayerExpanded: (layerId: LayerId) => void;

  // Work area
  setWorkAreaStart: (frame: number) => void;
  setWorkAreaEnd: (frame: number) => void;
  setWorkAreaEnabled: (enabled: boolean) => void;
  clearWorkArea: () => void;
  trimToWorkArea: () => void;
  setTimecodeFormat: (format: import('../types/timeline').TimecodeFormat) => void;

  // Clipboard (for right-click copy/paste of frames and keyframes)
  copiedFrames: Array<{ durationFrames: number; data: Map<string, import('../types').Cell>; hidden?: boolean }> | null;
  copiedKeyframes: Array<{ value: number; easing: import('../types/timeline').Keyframe['easing']; frameOffset: number }> | null;
  copyContentFrames: (layerId: LayerId, frameIds: ContentFrameId[]) => void;
  pasteContentFrames: (layerId: LayerId, atFrame: number) => void;
  copyKeyframes: (layerId: LayerId, trackId: PropertyTrackId, keyframeIds: KeyframeId[]) => void;
  pasteKeyframes: (layerId: LayerId, trackId: PropertyTrackId, atFrame: number) => void;

  // ============================================
  // PROJECT LIFECYCLE
  // ============================================

  /** Reset to default new-project state */
  createNewProject: () => void;

  /** Load state from session data (used by session importer) */
  loadFromSessionData: (layers: Layer[], config: Partial<TimelineConfig>, viewState?: Partial<TimelineViewState>) => void;
}

// ============================================
// INITIAL STATE
// ============================================

const INITIAL_CONFIG: TimelineConfig = {
  frameRate: 12,
  durationFrames: 1,
  durationMs: 1000 / 12,
};

const INITIAL_VIEW: TimelineViewState = {
  activeView: 'layers',
  currentFrame: 0,
  isPlaying: false,
  looping: true,
  activeLayerId: null,
  selectedLayerIds: new Set(),
  selectedKeyframeIds: new Set(),
  selectedContentFrameIds: new Set(),
  zoom: 8,
  scrollX: 0,
  panelHeight: 364,
  editingKeyframeId: null,
  expandedLayerIds: new Set(),
  showLayerProperties: false,
  keyframeDuplicateGhosts: new Map(),
  contentFrameDragPreview: null,
  workAreaStart: 0,
  workAreaEnd: 1,
  workAreaEnabled: false,
  timecodeFormat: 'timecode' as const,
};

// ============================================
// HELPER: update a single layer in the layers array
// ============================================

function updateLayer(
  layers: Layer[],
  layerId: LayerId,
  updater: (layer: Layer) => Layer,
): Layer[] {
  return layers.map((l) => (l.id === layerId ? updater(l) : l));
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

// Create default layer so the app always starts with one layer + one frame
const DEFAULT_LAYER = createDefaultLayer();

export const useTimelineStore = create<TimelineState>()(
  subscribeWithSelector((set, get) => ({
    // ----- Initial State -----
    config: { ...INITIAL_CONFIG },
    layers: [DEFAULT_LAYER],
    layerGroups: [],
    globalEffects: [],
    view: { ...INITIAL_VIEW, activeLayerId: DEFAULT_LAYER.id },

    // ============================================
    // LAYER ACTIONS
    // ============================================

    addLayer: (name?) => {
      // Check subscription tier layer limit
      if (!canAddLayer()) {
        console.warn('Layer limit reached. Cannot add more layers.');
        return null;
      }

      const { layers, view } = get();
      const id = generateLayerId();
      const layerName = name ?? `Layer ${layers.length + 1}`;

      // Default anchor point to canvas center
      const { width, height } = useCanvasStore.getState();
      const anchorX = Math.floor(width / 2);
      const anchorY = Math.floor(height / 2);

      const newLayer: Layer = {
        id,
        name: layerName,
        visible: true,
        solo: false,
        locked: false,
        opacity: 100,
        contentFrames: [{
          id: generateContentFrameId(),
          name: 'Frame 1',
          startFrame: 0,
          durationFrames: 1,
          data: new Map(),
        }],
        propertyTracks: [],
        staticProperties: {
          'transform.anchorPoint.x': anchorX,
          'transform.anchorPoint.y': anchorY,
        },
      };

      // Insert above active layer (or at top if none active)
      const activeIndex = view.activeLayerId
        ? layers.findIndex((l) => l.id === view.activeLayerId)
        : -1;
      const insertIndex = activeIndex !== -1 ? activeIndex + 1 : layers.length;

      const newLayers = [
        ...layers.slice(0, insertIndex),
        newLayer,
        ...layers.slice(insertIndex),
      ];

      set({
        layers: newLayers,
        view: { ...view, activeLayerId: id },
      });

      return id;
    },

    removeLayer: (layerId) => {
      const { layers, view } = get();
      const index = layers.findIndex((l) => l.id === layerId);
      if (index === -1) return;

      const newLayers = layers.filter((l) => l.id !== layerId);

      // Enforce minimum 1 layer
      if (newLayers.length === 0) {
        const defaultLayer = createDefaultLayer();
        set({
          layers: [defaultLayer],
          view: { ...view, activeLayerId: defaultLayer.id },
        });
        return;
      }

      // Update active layer if we deleted the active one
      let newActiveId = view.activeLayerId;
      if (view.activeLayerId === layerId) {
        // Select adjacent layer
        const newIndex = Math.min(index, newLayers.length - 1);
        newActiveId = newLayers[newIndex].id;
      }

      set({
        layers: newLayers,
        view: { ...view, activeLayerId: newActiveId },
      });
    },

    duplicateLayer: (layerId) => {
      // Check subscription tier layer limit
      if (!canAddLayer()) {
        console.warn('Layer limit reached. Cannot duplicate layer.');
        return null;
      }

      const { layers, view } = get();
      const source = layers.find((l) => l.id === layerId);
      if (!source) return null; // Return null if not found

      const newId = generateLayerId();
      const duplicate: Layer = {
        ...source,
        id: newId,
        name: `${source.name} Copy`,
        contentFrames: source.contentFrames.map((cf) => ({
          ...cf,
          id: generateContentFrameId(),
          data: new Map(cf.data),
        })),
        propertyTracks: source.propertyTracks.map((pt) => ({
          ...pt,
          id: generatePropertyTrackId(),
          keyframes: pt.keyframes.map((kf) => ({
            ...kf,
            id: generateKeyframeId(),
          })),
        })),
      };

      const sourceIndex = layers.findIndex((l) => l.id === layerId);
      const insertIndex = sourceIndex + 1;

      const newLayers = [
        ...layers.slice(0, insertIndex),
        duplicate,
        ...layers.slice(insertIndex),
      ];

      set({
        layers: newLayers,
        view: { ...view, activeLayerId: newId },
      });

      return newId;
    },

    reorderLayers: (fromIndex, toIndex) => {
      const { layers } = get();
      if (fromIndex < 0 || fromIndex >= layers.length) return;
      if (toIndex < 0 || toIndex >= layers.length) return;
      if (fromIndex === toIndex) return;

      const newLayers = [...layers];
      const [moved] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, moved);

      set({ layers: newLayers });
    },

    renameLayer: (layerId, name) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({ ...l, name })),
      }));
    },

    setLayerVisible: (layerId, visible) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({ ...l, visible })),
      }));
    },

    setLayerSolo: (layerId, solo) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({ ...l, solo })),
      }));
    },

    setLayerLocked: (layerId, locked) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({ ...l, locked })),
      }));
    },

    setLayerSyncKeyframes: (layerId, sync) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({ ...l, syncKeyframesToFrames: sync })),
      }));
    },

    setLayerOpacity: (layerId, opacity) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          opacity: Math.max(0, Math.min(100, opacity)),
        })),
      }));
    },

    setStaticProperty: (layerId, propertyPath, value) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          staticProperties: { ...l.staticProperties, [propertyPath]: value },
        })),
      }));
    },

    getActiveLayer: () => {
      const { layers, view } = get();
      if (!view.activeLayerId) return null;
      return layers.find((l) => l.id === view.activeLayerId) ?? null;
    },

    setActiveLayer: (layerId) => {
      set((state) => ({
        view: { ...state.view, activeLayerId: layerId },
      }));
    },

    getLayer: (layerId) => {
      return get().layers.find((l) => l.id === layerId);
    },

    // ============================================
    // CONTENT FRAME ACTIONS
    // ============================================

    addContentFrame: (layerId, startFrame, durationFrames, data) => {
      const { layers } = get();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return null;

      const newFrame: ContentFrame = {
        id: generateContentFrameId(),
        name: `Frame ${layer.contentFrames.length + 1}`,
        startFrame,
        durationFrames: Math.max(1, durationFrames),
        data: data ?? new Map(),
      };

      // Validate no overlap
      for (const existing of layer.contentFrames) {
        if (contentFramesOverlap(newFrame, existing)) {
          console.warn(`Content frame overlap detected on layer "${layer.name}". Rejecting.`);
          return null;
        }
      }

      // Auto-expand timeline if the new content frame extends past the current duration.
      // Only extends — never shrinks.
      const frameEnd = startFrame + durationFrames;
      if (frameEnd > get().config.durationFrames) {
        get().ensureTimelineContains(frameEnd - 1);
      }

      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          contentFrames: [...l.contentFrames, newFrame],
        })),
      }));

      return newFrame.id;
    },

    removeContentFrame: (layerId, frameId) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          contentFrames: l.contentFrames.filter((cf) => cf.id !== frameId),
        })),
      }));
    },

    updateContentFrameTiming: (layerId, frameId, startFrame, durationFrames) => {
      const { layers } = get();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return false;

      const clampedDuration = Math.max(1, durationFrames);
      const clampedStart = Math.max(0, startFrame);

      // Check for overlaps with other frames
      const otherFrames = layer.contentFrames.filter((cf) => cf.id !== frameId);
      const proposed: ContentFrame = {
        id: frameId,
        name: '',
        startFrame: clampedStart,
        durationFrames: clampedDuration,
        data: new Map(),
      };

      for (const existing of otherFrames) {
        if (contentFramesOverlap(proposed, existing)) {
          console.warn(`Content frame timing update would cause overlap. Rejecting.`);
          return false;
        }
      }

      // Note: we do NOT auto-expand the timeline here. This method is called
      // during drag reorder with intermediate "parking" positions that would
      // incorrectly extend the timeline. Callers that need auto-expand (like
      // resize handlers) should call ensureTimelineContains() explicitly.

      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          contentFrames: l.contentFrames.map((cf) =>
            cf.id === frameId
              ? { ...cf, startFrame: clampedStart, durationFrames: clampedDuration }
              : cf,
          ),
        })),
      }));

      return true;
    },

    updateContentFrameData: (layerId, frameId, data) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          contentFrames: l.contentFrames.map((cf) =>
            cf.id === frameId ? { ...cf, data } : cf,
          ),
        })),
      }));
    },

    splitContentFrame: (layerId, frameId, atFrame) => {
      const { layers } = get();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return null;

      const cf = layer.contentFrames.find((c) => c.id === frameId);
      if (!cf) return null;

      // atFrame must be strictly inside the frame (not at start or end)
      if (atFrame <= cf.startFrame || atFrame >= cf.startFrame + cf.durationFrames) {
        return null;
      }

      const leftDuration = atFrame - cf.startFrame;
      const rightDuration = cf.durationFrames - leftDuration;

      const newFrameId = generateContentFrameId();
      const newFrame: ContentFrame = {
        id: newFrameId,
        name: `${cf.name} (split)`,
        startFrame: atFrame,
        durationFrames: rightDuration,
        data: new Map(cf.data), // Clone data
      };

      // Shrink original + insert new frame
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          contentFrames: l.contentFrames.map((c) =>
            c.id === frameId
              ? { ...c, durationFrames: leftDuration }
              : c,
          ).concat(newFrame),
        })),
      }));

      return newFrameId;
    },

    duplicateContentFrame: (layerId, frameId) => {
      const { layers } = get();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return null;

      const cf = layer.contentFrames.find((c) => c.id === frameId);
      if (!cf) return null;

      // Place the duplicate immediately after the original
      const afterEnd = cf.startFrame + cf.durationFrames;

      // Check no overlap at that position
      const newFrameId = generateContentFrameId();
      const newFrame: ContentFrame = {
        id: newFrameId,
        name: `${cf.name} (copy)`,
        startFrame: afterEnd,
        durationFrames: cf.durationFrames,
        data: new Map(cf.data),
      };

      for (const existing of layer.contentFrames) {
        if (contentFramesOverlap(newFrame, existing)) {
          console.warn('Cannot duplicate: would overlap with another content frame.');
          return null;
        }
      }

      // Auto-expand timeline if needed
      get().ensureTimelineContains(afterEnd + cf.durationFrames - 1);

      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          contentFrames: [...l.contentFrames, newFrame],
        })),
      }));

      return newFrameId;
    },

    getContentFrameAt: (layerId, frame) => {
      const layer = get().layers.find((l) => l.id === layerId);
      if (!layer) return null;

      return (
        layer.contentFrames.find(
          (cf) => frame >= cf.startFrame && frame < cf.startFrame + cf.durationFrames,
        ) ?? null
      );
    },

    // ============================================
    // KEYFRAME ACTIONS
    // ============================================

    addPropertyTrack: (layerId, propertyPath) => {
      const id = generatePropertyTrackId();

      const newTrack: PropertyTrack = {
        id,
        propertyPath,
        keyframes: [],
        loopKeyframes: false,
      };

      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          propertyTracks: [...l.propertyTracks, newTrack],
        })),
      }));

      return id;
    },

    removePropertyTrack: (layerId, trackId) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          propertyTracks: l.propertyTracks.filter((pt) => pt.id !== trackId),
        })),
      }));
    },

    addKeyframe: (layerId, trackId, frame, value) => {
      const id = generateKeyframeId();

      const newKeyframe: Keyframe = {
        id,
        frame,
        value,
        easing: defaultEasing(),
      };

      // Auto-expand timeline
      get().ensureTimelineContains(frame);

      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          propertyTracks: l.propertyTracks.map((pt) => {
            if (pt.id !== trackId) return pt;

            // Replace existing keyframe at same frame, or add new one
            const existingIndex = pt.keyframes.findIndex((kf) => kf.frame === frame);
            if (existingIndex !== -1) {
              const updated = [...pt.keyframes];
              updated[existingIndex] = { ...updated[existingIndex], value };
              return { ...pt, keyframes: updated };
            }

            // Insert sorted by frame
            const keyframes = [...pt.keyframes, newKeyframe].sort((a, b) => a.frame - b.frame);
            return { ...pt, keyframes };
          }),
        })),
      }));

      return id;
    },

    removeKeyframe: (layerId, trackId, keyframeId) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          propertyTracks: l.propertyTracks.map((pt) =>
            pt.id === trackId
              ? { ...pt, keyframes: pt.keyframes.filter((kf) => kf.id !== keyframeId) }
              : pt,
          ),
        })),
      }));
    },

    updateKeyframe: (layerId, trackId, keyframeId, updates) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          propertyTracks: l.propertyTracks.map((pt) => {
            if (pt.id !== trackId) return pt;
            const keyframes = pt.keyframes.map((kf) =>
              kf.id === keyframeId ? { ...kf, ...updates } : kf,
            );
            // Re-sort if frame changed
            if (updates.frame !== undefined) {
              keyframes.sort((a, b) => a.frame - b.frame);
            }
            return { ...pt, keyframes };
          }),
        })),
      }));
    },

    moveKeyframe: (layerId, trackId, keyframeId, newFrame) => {
      get().ensureTimelineContains(newFrame);
      get().updateKeyframe(layerId, trackId, keyframeId, { frame: newFrame });
    },

    setKeyframeLooping: (layerId, trackId, looping) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          propertyTracks: l.propertyTracks.map((pt) =>
            pt.id === trackId ? { ...pt, loopKeyframes: looping } : pt,
          ),
        })),
      }));
    },

    // ============================================
    // PLAYBACK ACTIONS
    // ============================================

    goToFrame: (frame) => {
      const { config } = get();
      const clamped = Math.max(0, Math.min(frame, config.durationFrames - 1));
      set((state) => ({
        view: { ...state.view, currentFrame: clamped },
      }));
    },

    nextFrame: () => {
      const { view, config } = get();
      const next = view.currentFrame + 1;
      if (next >= config.durationFrames) {
        if (view.looping) {
          set((state) => ({ view: { ...state.view, currentFrame: 0 } }));
        }
        // else: stay at last frame
      } else {
        set((state) => ({ view: { ...state.view, currentFrame: next } }));
      }
    },

    previousFrame: () => {
      const { view, config } = get();
      const prev = view.currentFrame - 1;
      if (prev < 0) {
        if (view.looping) {
          set((state) => ({
            view: { ...state.view, currentFrame: config.durationFrames - 1 },
          }));
        }
        // else: stay at frame 0
      } else {
        set((state) => ({ view: { ...state.view, currentFrame: prev } }));
      }
    },

    setPlaying: (playing) => {
      set((state) => ({ view: { ...state.view, isPlaying: playing } }));
    },

    setLooping: (looping) => {
      set((state) => ({ view: { ...state.view, looping } }));
    },

    setFrameRate: (newFps, maintainDuration = true) => {
      const { config, layers } = get();
      const oldFps = config.frameRate;
      if (newFps === oldFps || newFps <= 0) return;

      if (maintainDuration) {
        const ratio = newFps / oldFps;

        // Convert all content frame timings
        const convertedLayers = layers.map((layer) => ({
          ...layer,
          contentFrames: layer.contentFrames.map((cf) => ({
            ...cf,
            startFrame: Math.round(cf.startFrame * ratio),
            durationFrames: Math.max(1, Math.round(cf.durationFrames * ratio)),
          })),
          propertyTracks: layer.propertyTracks.map((track) => ({
            ...track,
            keyframes: track.keyframes.map((kf) => ({
              ...kf,
              frame: Math.round(kf.frame * ratio),
            })),
          })),
        }));

        const newDurationFrames = Math.max(1, Math.round(config.durationFrames * ratio));

        set({
          config: {
            frameRate: newFps,
            durationFrames: newDurationFrames,
            durationMs: (newDurationFrames / newFps) * 1000,
          },
          layers: convertedLayers,
        });
      } else {
        set({
          config: {
            ...config,
            frameRate: newFps,
            durationMs: (config.durationFrames / newFps) * 1000,
          },
        });
      }
    },

    setDuration: (frames) => {
      const clamped = Math.max(1, frames);
      set((state) => ({
        config: {
          ...state.config,
          durationFrames: clamped,
          durationMs: (clamped / state.config.frameRate) * 1000,
        },
      }));
    },

    // ============================================
    // TIMELINE AUTO-EXPAND
    // ============================================

    ensureTimelineContains: (frame) => {
      const { config } = get();
      if (frame >= config.durationFrames) {
        const newDuration = frame + 1;
        set({
          config: {
            ...config,
            durationFrames: newDuration,
            durationMs: (newDuration / config.frameRate) * 1000,
          },
        });
      }
    },

    // ============================================
    // VIEW ACTIONS
    // ============================================

    setActiveView: (activeView) => {
      set((state) => ({ view: { ...state.view, activeView } }));
    },

    setZoom: (zoom) => {
      set((state) => ({
        view: { ...state.view, zoom: Math.max(0.1, Math.min(10, zoom)) },
      }));
    },

    setScrollX: (scrollX) => {
      set((state) => ({ view: { ...state.view, scrollX } }));
    },

    setPanelHeight: (height) => {
      set((state) => ({
        view: { ...state.view, panelHeight: Math.max(100, Math.min(600, height)) },
      }));
    },

    selectKeyframes: (keyframeIds) => {
      set((state) => ({
        view: { ...state.view, selectedKeyframeIds: new Set(keyframeIds) },
      }));
    },

    addKeyframesToSelection: (keyframeIds) => {
      set((state) => {
        const next = new Set(state.view.selectedKeyframeIds);
        for (const id of keyframeIds) next.add(id);
        return { view: { ...state.view, selectedKeyframeIds: next } };
      });
    },

    toggleKeyframeSelected: (keyframeId) => {
      set((state) => {
        const next = new Set(state.view.selectedKeyframeIds);
        if (next.has(keyframeId)) {
          next.delete(keyframeId);
        } else {
          next.add(keyframeId);
        }
        return { view: { ...state.view, selectedKeyframeIds: next } };
      });
    },

    clearKeyframeSelection: () => {
      set((state) => ({
        view: {
          ...state.view,
          selectedKeyframeIds: new Set(),
          editingKeyframeId: null,
        },
      }));
    },

    selectContentFrames: (frameIds) => {
      set((state) => ({
        view: { ...state.view, selectedContentFrameIds: new Set(frameIds) },
      }));
    },

    addContentFramesToSelection: (frameIds) => {
      set((state) => {
        const next = new Set(state.view.selectedContentFrameIds);
        for (const id of frameIds) next.add(id);
        return { view: { ...state.view, selectedContentFrameIds: next } };
      });
    },

    toggleContentFrameSelected: (frameId) => {
      set((state) => {
        const next = new Set(state.view.selectedContentFrameIds);
        if (next.has(frameId)) {
          next.delete(frameId);
        } else {
          next.add(frameId);
        }
        return { view: { ...state.view, selectedContentFrameIds: next } };
      });
    },

    clearContentFrameSelection: () => {
      set((state) => ({
        view: { ...state.view, selectedContentFrameIds: new Set() },
      }));
    },

    toggleContentFrameHidden: (layerId, frameIds, hidden) => {
      set((state) => ({
        layers: updateLayer(state.layers, layerId, (l) => ({
          ...l,
          contentFrames: l.contentFrames.map((cf) =>
            frameIds.includes(cf.id) ? { ...cf, hidden } : cf,
          ),
        })),
      }));
    },

    setContentFrameDragPreview: (preview) => {
      set((state) => ({
        view: { ...state.view, contentFrameDragPreview: preview },
      }));
    },

    setEditingKeyframe: (keyframeId) => {
      set((state) => ({
        view: { ...state.view, editingKeyframeId: keyframeId },
      }));
    },

    setKeyframeDuplicateGhosts: (ghosts) => {
      set((state) => ({
        view: { ...state.view, keyframeDuplicateGhosts: ghosts },
      }));
    },

    clearKeyframeDuplicateGhosts: () => {
      set((state) => ({
        view: { ...state.view, keyframeDuplicateGhosts: new Map() },
      }));
    },

    setShowLayerProperties: (show) => {
      set((state) => ({
        view: { ...state.view, showLayerProperties: show },
      }));
    },

    toggleLayerExpanded: (layerId) => {
      set((state) => {
        const next = new Set(state.view.expandedLayerIds);
        if (next.has(layerId)) {
          next.delete(layerId);
        } else {
          next.add(layerId);
        }
        return { view: { ...state.view, expandedLayerIds: next } };
      });
    },

    // ============================================
    // WORK AREA
    // ============================================

    setWorkAreaStart: (frame) => {
      set((state) => ({
        view: {
          ...state.view,
          workAreaStart: Math.max(0, Math.min(frame, state.view.workAreaEnd - 1)),
          workAreaEnabled: true,
        },
      }));
    },

    setWorkAreaEnd: (frame) => {
      set((state) => ({
        view: {
          ...state.view,
          workAreaEnd: Math.max(state.view.workAreaStart + 1, Math.min(frame, state.config.durationFrames)),
          workAreaEnabled: true,
        },
      }));
    },

    setWorkAreaEnabled: (enabled) => {
      set((state) => ({ view: { ...state.view, workAreaEnabled: enabled } }));
    },

    setTimecodeFormat: (format) => {
      set((state) => ({ view: { ...state.view, timecodeFormat: format } }));
    },

    // ── Clipboard ──
    copiedFrames: null,
    copiedKeyframes: null,

    copyContentFrames: (layerId, frameIds) => {
      const layer = get().layers.find((l) => l.id === layerId);
      if (!layer) return;
      const frames = layer.contentFrames
        .filter((cf) => frameIds.includes(cf.id))
        .sort((a, b) => a.startFrame - b.startFrame)
        .map((cf) => ({ durationFrames: cf.durationFrames, data: new Map(cf.data), hidden: cf.hidden }));
      set({ copiedFrames: frames, copiedKeyframes: null });
    },

    pasteContentFrames: (layerId, atFrame) => {
      const { copiedFrames } = get();
      if (!copiedFrames || copiedFrames.length === 0) return;
      let cursor = atFrame;
      for (const cf of copiedFrames) {
        get().addContentFrame(layerId, cursor, cf.durationFrames, new Map(cf.data));
        // Set hidden state if applicable
        if (cf.hidden) {
          const layer = get().layers.find((l) => l.id === layerId);
          const added = layer?.contentFrames.find((c) => c.startFrame === cursor && c.durationFrames === cf.durationFrames);
          if (added) {
            get().toggleContentFrameHidden(layerId, [added.id], true);
          }
        }
        cursor += cf.durationFrames;
      }
    },

    copyKeyframes: (keyframeIds) => {
      // Collect all selected keyframes across all layers/tracks
      type Entry = { layerId: string; trackId: string; propertyPath: string; frame: number; value: number; easing: import('../types/timeline').Keyframe['easing'] };
      const entries: Entry[] = [];
      for (const layer of get().layers) {
        for (const track of layer.propertyTracks) {
          for (const kf of track.keyframes) {
            if (keyframeIds.includes(kf.id)) {
              entries.push({
                layerId: layer.id as string,
                trackId: track.id as string,
                propertyPath: track.propertyPath,
                frame: kf.frame,
                value: kf.value as number,
                easing: kf.easing,
              });
            }
          }
        }
      }
      if (entries.length === 0) return;

      // Sort all entries by frame to find the global first frame
      entries.sort((a, b) => a.frame - b.frame);
      const firstFrame = entries[0].frame;

      // Assign layer indices by unique layerId (in order of first appearance)
      const layerOrder: string[] = [];
      for (const e of entries) {
        if (!layerOrder.includes(e.layerId)) layerOrder.push(e.layerId);
      }

      // Assign track indices by unique trackId (in order of first appearance)
      const trackOrder: string[] = [];
      for (const e of entries) {
        if (!trackOrder.includes(e.trackId)) trackOrder.push(e.trackId);
      }

      const kfs = entries.map((e) => ({
        sourceLayerId: e.layerId,
        layerIndex: layerOrder.indexOf(e.layerId),
        trackIndex: trackOrder.indexOf(e.trackId),
        propertyPath: e.propertyPath,
        value: e.value,
        easing: e.easing,
        frameOffset: e.frame - firstFrame,
      }));
      set({ copiedKeyframes: kfs, copiedFrames: null });
    },

    pasteKeyframes: (layerId, trackId, atFrame) => {
      const { copiedKeyframes, layers } = get();
      if (!copiedKeyframes || copiedKeyframes.length === 0) return;

      const targetLayer = layers.find((l) => l.id === layerId);
      if (!targetLayer) return;
      const targetTrack = targetLayer.propertyTracks.find((t) => t.id === trackId);
      if (!targetTrack) return;
      const targetPath = targetTrack.propertyPath;

      // Determine how many source layers are in the clipboard
      const maxLayerIndex = Math.max(...copiedKeyframes.map((kf) => kf.layerIndex));
      const isMultiLayer = maxLayerIndex > 0;

      // Check if target track matches any copied property path
      const copiedPaths = [...new Set(copiedKeyframes.map((kf) => kf.propertyPath))];
      const targetMatchesCopied = copiedPaths.includes(targetPath);

      if (isMultiLayer && targetMatchesCopied) {
        // Multi-layer paste: try to match original layer IDs first.
        // If original layers still exist, paste back to them.
        // Otherwise fall back to index offset from target layer.
        const sourceLayerIds = [...new Set(copiedKeyframes.map((kf) => kf.sourceLayerId))];
        const allSourceLayersExist = sourceLayerIds.every((id) => layers.some((l) => (l.id as string) === id));

        for (const entry of copiedKeyframes) {
          let destLayer: typeof layers[0] | undefined;

          if (allSourceLayersExist) {
            // Original layers exist — paste back to them
            destLayer = layers.find((l) => (l.id as string) === entry.sourceLayerId);
          } else {
            // Fallback: use index offset from target layer
            const targetLayerIdx = layers.findIndex((l) => l.id === layerId);
            const destLayerIdx = targetLayerIdx + entry.layerIndex;
            if (destLayerIdx >= 0 && destLayerIdx < layers.length) {
              destLayer = layers[destLayerIdx];
            }
          }

          if (!destLayer) continue;

          const destTrack = destLayer.propertyTracks.find((t) => t.propertyPath === entry.propertyPath);
          if (!destTrack) continue;

          const targetFrame = atFrame + entry.frameOffset;
          get().addKeyframe(destLayer.id, destTrack.id, targetFrame, entry.value);
          const updatedLayer = get().layers.find((l) => l.id === destLayer!.id);
          const updatedTrack = updatedLayer?.propertyTracks.find((t) => t.id === destTrack.id);
          const addedKf = updatedTrack?.keyframes.find((kf) => kf.frame === targetFrame);
          if (addedKf) {
            get().updateKeyframe(destLayer.id, destTrack.id, addedKf.id, { easing: entry.easing });
          }
        }
      } else if (targetMatchesCopied) {
        // Single-layer multi-track paste: paste to matching property tracks on target layer
        for (const entry of copiedKeyframes) {
          const destTrack = targetLayer.propertyTracks.find((t) => t.propertyPath === entry.propertyPath);
          if (!destTrack) continue;
          const targetFrame = atFrame + entry.frameOffset;
          get().addKeyframe(layerId, destTrack.id, targetFrame, entry.value);
          const updatedLayer = get().layers.find((l) => l.id === layerId);
          const updatedTrack = updatedLayer?.propertyTracks.find((t) => t.id === destTrack.id);
          const addedKf = updatedTrack?.keyframes.find((kf) => kf.frame === targetFrame);
          if (addedKf) {
            get().updateKeyframe(layerId, destTrack.id, addedKf.id, { easing: entry.easing });
          }
        }
      } else {
        // Unmatched track: paste only trackIndex 0 keyframes from layerIndex 0
        for (const entry of copiedKeyframes) {
          if (entry.trackIndex !== 0 || entry.layerIndex !== 0) continue;
          const targetFrame = atFrame + entry.frameOffset;
          get().addKeyframe(layerId, trackId, targetFrame, entry.value);
          const updatedLayer = get().layers.find((l) => l.id === layerId);
          const updatedTrack = updatedLayer?.propertyTracks.find((t) => t.id === trackId);
          const addedKf = updatedTrack?.keyframes.find((kf) => kf.frame === targetFrame);
          if (addedKf) {
            get().updateKeyframe(layerId, trackId, addedKf.id, { easing: entry.easing });
          }
        }
      }
    },

    clearWorkArea: () => {
      set((state) => ({
        view: {
          ...state.view,
          workAreaStart: 0,
          workAreaEnd: state.config.durationFrames,
          workAreaEnabled: false,
        },
      }));
    },

    trimToWorkArea: () => {
      const { view, layers, config } = get();
      const { workAreaStart, workAreaEnd } = view;
      if (!view.workAreaEnabled || workAreaStart >= workAreaEnd) return;

      const trimDuration = workAreaEnd - workAreaStart;

      // Trim all layers' content frames and keyframes to the work area range
      const trimmedLayers = layers.map((layer) => ({
        ...layer,
        contentFrames: layer.contentFrames
          .map((cf) => {
            const cfEnd = cf.startFrame + cf.durationFrames;
            // Fully outside — remove
            if (cfEnd <= workAreaStart || cf.startFrame >= workAreaEnd) return null;
            // Clip to work area bounds
            const newStart = Math.max(cf.startFrame, workAreaStart) - workAreaStart;
            const newEnd = Math.min(cfEnd, workAreaEnd) - workAreaStart;
            return {
              ...cf,
              startFrame: newStart,
              durationFrames: newEnd - newStart,
              data: new Map(cf.data),
            };
          })
          .filter((cf): cf is NonNullable<typeof cf> => cf !== null),
        propertyTracks: layer.propertyTracks.map((track) => ({
          ...track,
          keyframes: track.keyframes
            .filter((kf) => kf.frame >= workAreaStart && kf.frame < workAreaEnd)
            .map((kf) => ({ ...kf, frame: kf.frame - workAreaStart })),
        })),
      }));

      set({
        config: {
          ...config,
          durationFrames: trimDuration,
          durationMs: (trimDuration / config.frameRate) * 1000,
        },
        layers: trimmedLayers,
        view: {
          ...view,
          currentFrame: Math.min(view.currentFrame - workAreaStart, trimDuration - 1),
          workAreaStart: 0,
          workAreaEnd: trimDuration,
          workAreaEnabled: false,
        },
      });
    },

    // ============================================
    // PROJECT LIFECYCLE
    // ============================================

    createNewProject: () => {
      const defaultLayer = createDefaultLayer();
      set({
        config: { ...INITIAL_CONFIG },
        layers: [defaultLayer],
        layerGroups: [],
        globalEffects: [],
        view: {
          ...INITIAL_VIEW,
          activeLayerId: defaultLayer.id,
        },
      });
    },

    loadFromSessionData: (layers, config, viewState) => {
      const mergedConfig: TimelineConfig = {
        frameRate: config.frameRate ?? INITIAL_CONFIG.frameRate,
        durationFrames: config.durationFrames ?? INITIAL_CONFIG.durationFrames,
        durationMs: 0, // Computed below
      };
      mergedConfig.durationMs = (mergedConfig.durationFrames / mergedConfig.frameRate) * 1000;

      const activeLayerId = layers.length > 0 ? layers[0].id : null;

      set({
        config: mergedConfig,
        layers,
        layerGroups: [],
        globalEffects: [],
        view: {
          ...INITIAL_VIEW,
          activeLayerId,
          ...viewState,
        },
      });
    },
  })),
);
