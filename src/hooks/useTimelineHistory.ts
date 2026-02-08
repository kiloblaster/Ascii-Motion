/**
 * useTimelineHistory Hook
 * 
 * Wraps all layer/timeline mutation operations with undo/redo history recording.
 * This is the layer-timeline equivalent of useAnimationHistory.ts.
 * 
 * All component code should use this hook instead of calling timelineStore
 * actions directly, to ensure operations are recorded for undo/redo.
 * 
 * Part of the Layer Timeline Refactor (v2.0.0)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §1.6a
 */

import { useCallback } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import { useToolStore } from '../stores/toolStore';
import type { Cell } from '../types';
import type {
  LayerAddHistoryAction,
  LayerRemoveHistoryAction,
  LayerReorderHistoryAction,
  LayerRenameHistoryAction,
  LayerVisibilityHistoryAction,
  LayerOpacityHistoryAction,
  ContentFrameAddHistoryAction,
  ContentFrameRemoveHistoryAction,
  ContentFrameTimingHistoryAction,
  ContentFrameDataHistoryAction,
  KeyframeAddHistoryAction,
  KeyframeRemoveHistoryAction,
  KeyframeUpdateHistoryAction,
  PropertyTrackAddHistoryAction,
  PropertyTrackRemoveHistoryAction,
  FrameRateChangeHistoryAction,
  StaticPropertyChangeHistoryAction,
} from '../types';
import type {
  LayerId,
  ContentFrameId,
  PropertyTrackId,
  KeyframeId,
  PropertyPath,
  Keyframe,
} from '../types/timeline';

export function useTimelineHistory() {
  const {
    layers,
    config,
    view,
    addLayer: addLayerStore,
    removeLayer: removeLayerStore,
    duplicateLayer: duplicateLayerStore,
    reorderLayers: reorderLayersStore,
    renameLayer: renameLayerStore,
    setLayerVisible: setLayerVisibleStore,
    setLayerOpacity: setLayerOpacityStore,
    addContentFrame: addContentFrameStore,
    removeContentFrame: removeContentFrameStore,
    updateContentFrameTiming: updateContentFrameTimingStore,
    updateContentFrameData: updateContentFrameDataStore,
    addPropertyTrack: addPropertyTrackStore,
    removePropertyTrack: removePropertyTrackStore,
    addKeyframe: addKeyframeStore,
    removeKeyframe: removeKeyframeStore,
    updateKeyframe: updateKeyframeStore,
    setFrameRate: setFrameRateStore,
    getLayer,
  } = useTimelineStore();

  const { pushToHistory } = useToolStore();

  // ============================================
  // LAYER OPERATIONS
  // ============================================

  const addLayer = useCallback((name?: string) => {
    const insertIndex = view.activeLayerId
      ? layers.findIndex((l) => l.id === view.activeLayerId) + 1
      : layers.length;

    const layerId = addLayerStore(name);
    const layer = useTimelineStore.getState().getLayer(layerId);

    if (layer) {
      const historyAction: LayerAddHistoryAction = {
        type: 'layer_add',
        timestamp: Date.now(),
        description: `Add layer "${layer.name}"`,
        data: {
          layerId: layer.id,
          layerData: structuredClone(layer),
          insertIndex,
        },
      };
      pushToHistory(historyAction);
    }

    return layerId;
  }, [layers, view.activeLayerId, addLayerStore, pushToHistory]);

  const removeLayer = useCallback((layerId: LayerId) => {
    const layer = getLayer(layerId);
    if (!layer) return;

    const index = layers.findIndex((l) => l.id === layerId);

    const historyAction: LayerRemoveHistoryAction = {
      type: 'layer_remove',
      timestamp: Date.now(),
      description: `Remove layer "${layer.name}"`,
      data: {
        layerId: layer.id,
        layerData: structuredClone(layer),
        index,
      },
    };

    removeLayerStore(layerId);
    pushToHistory(historyAction);
  }, [layers, getLayer, removeLayerStore, pushToHistory]);

  const duplicateLayer = useCallback((layerId: LayerId) => {
    const source = getLayer(layerId);
    if (!source) return layerId;

    const newId = duplicateLayerStore(layerId);
    const duplicated = useTimelineStore.getState().getLayer(newId);
    const insertIndex = layers.findIndex((l) => l.id === layerId) + 1;

    if (duplicated) {
      const historyAction: LayerAddHistoryAction = {
        type: 'layer_add',
        timestamp: Date.now(),
        description: `Duplicate layer "${source.name}"`,
        data: {
          layerId: duplicated.id,
          layerData: structuredClone(duplicated),
          insertIndex,
        },
      };
      pushToHistory(historyAction);
    }

    return newId;
  }, [layers, getLayer, duplicateLayerStore, pushToHistory]);

  const reorderLayers = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const historyAction: LayerReorderHistoryAction = {
      type: 'layer_reorder',
      timestamp: Date.now(),
      description: `Reorder layer from position ${fromIndex + 1} to ${toIndex + 1}`,
      data: { fromIndex, toIndex },
    };

    reorderLayersStore(fromIndex, toIndex);
    pushToHistory(historyAction);
  }, [reorderLayersStore, pushToHistory]);

  const renameLayer = useCallback((layerId: LayerId, name: string) => {
    const layer = getLayer(layerId);
    if (!layer) return;

    const historyAction: LayerRenameHistoryAction = {
      type: 'layer_rename',
      timestamp: Date.now(),
      description: `Rename layer "${layer.name}" → "${name}"`,
      data: {
        layerId: layer.id,
        oldName: layer.name,
        newName: name,
      },
    };

    renameLayerStore(layerId, name);
    pushToHistory(historyAction);
  }, [getLayer, renameLayerStore, pushToHistory]);

  const setLayerVisible = useCallback((layerId: LayerId, visible: boolean) => {
    const layer = getLayer(layerId);
    if (!layer) return;

    const historyAction: LayerVisibilityHistoryAction = {
      type: 'layer_visibility',
      timestamp: Date.now(),
      description: `${visible ? 'Show' : 'Hide'} layer "${layer.name}"`,
      data: {
        layerId: layer.id,
        oldVisible: layer.visible,
        newVisible: visible,
      },
    };

    setLayerVisibleStore(layerId, visible);
    pushToHistory(historyAction);
  }, [getLayer, setLayerVisibleStore, pushToHistory]);

  const setLayerOpacity = useCallback((layerId: LayerId, opacity: number) => {
    const layer = getLayer(layerId);
    if (!layer) return;

    const historyAction: LayerOpacityHistoryAction = {
      type: 'layer_opacity',
      timestamp: Date.now(),
      description: `Set layer "${layer.name}" opacity to ${opacity}%`,
      data: {
        layerId: layer.id,
        oldOpacity: layer.opacity,
        newOpacity: opacity,
      },
    };

    setLayerOpacityStore(layerId, opacity);
    pushToHistory(historyAction);
  }, [getLayer, setLayerOpacityStore, pushToHistory]);

  // ============================================
  // CONTENT FRAME OPERATIONS
  // ============================================

  const addContentFrame = useCallback((
    layerId: LayerId,
    startFrame: number,
    durationFrames: number,
    data?: Map<string, Cell>,
  ) => {
    const frameId = addContentFrameStore(layerId, startFrame, durationFrames, data);
    if (!frameId) return null; // Overlap rejection

    // Get the frame that was just created
    const layer = useTimelineStore.getState().getLayer(layerId);
    const frame = layer?.contentFrames.find((cf) => cf.id === frameId);

    if (frame) {
      const historyAction: ContentFrameAddHistoryAction = {
        type: 'content_frame_add',
        timestamp: Date.now(),
        description: `Add content frame to layer`,
        data: {
          layerId,
          frameId,
          frameData: structuredClone(frame),
        },
      };
      pushToHistory(historyAction);
    }

    return frameId;
  }, [addContentFrameStore, pushToHistory]);

  /**
   * Split a content frame at the playhead into two frames.
   * Records both the timing change and the new frame as history.
   */
  const splitContentFrame = useCallback((
    layerId: LayerId,
    frameId: ContentFrameId,
    atFrame: number,
  ) => {
    const layer = getLayer(layerId);
    const cf = layer?.contentFrames.find((c) => c.id === frameId);
    if (!cf) return null;

    const oldTiming = { startFrame: cf.startFrame, durationFrames: cf.durationFrames };
    const newTimingForOriginal = { startFrame: cf.startFrame, durationFrames: atFrame - cf.startFrame };

    const splitStore = useTimelineStore.getState().splitContentFrame;
    const newFrameId = splitStore(layerId, frameId, atFrame);
    if (!newFrameId) return null;

    // Record timing change for the original (shrunk) frame
    const timingAction: ContentFrameTimingHistoryAction = {
      type: 'content_frame_timing',
      timestamp: Date.now(),
      description: `Split content frame`,
      data: {
        layerId,
        frameId,
        oldTiming,
        newTiming: newTimingForOriginal,
      },
    };
    pushToHistory(timingAction);

    // Record the new (right) frame addition
    const updatedLayer = useTimelineStore.getState().getLayer(layerId);
    const newFrame = updatedLayer?.contentFrames.find((c) => c.id === newFrameId);
    if (newFrame) {
      const addAction: ContentFrameAddHistoryAction = {
        type: 'content_frame_add',
        timestamp: Date.now(),
        description: `Add split content frame`,
        data: {
          layerId,
          frameId: newFrameId,
          frameData: structuredClone(newFrame),
        },
      };
      pushToHistory(addAction);
    }

    return newFrameId;
  }, [getLayer, pushToHistory]);

  /**
   * Duplicate a content frame, placing the copy immediately after the original.
   */
  const duplicateContentFrame = useCallback((
    layerId: LayerId,
    frameId: ContentFrameId,
  ) => {
    const dupStore = useTimelineStore.getState().duplicateContentFrame;
    const newFrameId = dupStore(layerId, frameId);
    if (!newFrameId) return null;

    const layer = useTimelineStore.getState().getLayer(layerId);
    const newFrame = layer?.contentFrames.find((c) => c.id === newFrameId);
    if (newFrame) {
      const historyAction: ContentFrameAddHistoryAction = {
        type: 'content_frame_add',
        timestamp: Date.now(),
        description: `Duplicate content frame`,
        data: {
          layerId,
          frameId: newFrameId,
          frameData: structuredClone(newFrame),
        },
      };
      pushToHistory(historyAction);
    }

    return newFrameId;
  }, [pushToHistory]);

  const removeContentFrame = useCallback((layerId: LayerId, frameId: ContentFrameId) => {
    const layer = getLayer(layerId);
    const frame = layer?.contentFrames.find((cf) => cf.id === frameId);
    if (!frame) return;

    const historyAction: ContentFrameRemoveHistoryAction = {
      type: 'content_frame_remove',
      timestamp: Date.now(),
      description: `Remove content frame "${frame.name}"`,
      data: {
        layerId,
        frameId,
        frameData: structuredClone(frame),
      },
    };

    removeContentFrameStore(layerId, frameId);
    pushToHistory(historyAction);
  }, [getLayer, removeContentFrameStore, pushToHistory]);

  const updateContentFrameTiming = useCallback((
    layerId: LayerId,
    frameId: ContentFrameId,
    startFrame: number,
    durationFrames: number,
  ) => {
    const layer = getLayer(layerId);
    const frame = layer?.contentFrames.find((cf) => cf.id === frameId);
    if (!frame) return false;

    const oldTiming = {
      startFrame: frame.startFrame,
      durationFrames: frame.durationFrames,
    };

    const success = updateContentFrameTimingStore(layerId, frameId, startFrame, durationFrames);
    if (!success) return false;

    const historyAction: ContentFrameTimingHistoryAction = {
      type: 'content_frame_timing',
      timestamp: Date.now(),
      description: `Update content frame timing`,
      data: {
        layerId,
        frameId,
        oldTiming,
        newTiming: { startFrame, durationFrames },
      },
    };
    pushToHistory(historyAction);

    return true;
  }, [getLayer, updateContentFrameTimingStore, pushToHistory]);

  const updateContentFrameData = useCallback((
    layerId: LayerId,
    frameId: ContentFrameId,
    data: Map<string, Cell>,
  ) => {
    const layer = getLayer(layerId);
    const frame = layer?.contentFrames.find((cf) => cf.id === frameId);
    if (!frame) return;

    const historyAction: ContentFrameDataHistoryAction = {
      type: 'content_frame_data',
      timestamp: Date.now(),
      description: `Update content frame data`,
      data: {
        layerId,
        frameId,
        previousData: new Map(frame.data),
        newData: new Map(data),
      },
    };

    updateContentFrameDataStore(layerId, frameId, data);
    pushToHistory(historyAction);
  }, [getLayer, updateContentFrameDataStore, pushToHistory]);

  // ============================================
  // PROPERTY TRACK & KEYFRAME OPERATIONS
  // ============================================

  const addPropertyTrack = useCallback((layerId: LayerId, propertyPath: PropertyPath) => {
    const trackId = addPropertyTrackStore(layerId, propertyPath);

    const historyAction: PropertyTrackAddHistoryAction = {
      type: 'property_track_add',
      timestamp: Date.now(),
      description: `Add property track "${propertyPath}"`,
      data: {
        layerId,
        trackId,
        propertyPath,
      },
    };
    pushToHistory(historyAction);

    return trackId;
  }, [addPropertyTrackStore, pushToHistory]);

  const removePropertyTrack = useCallback((layerId: LayerId, trackId: PropertyTrackId) => {
    const layer = getLayer(layerId);
    const track = layer?.propertyTracks.find((pt) => pt.id === trackId);
    if (!track) return;

    const historyAction: PropertyTrackRemoveHistoryAction = {
      type: 'property_track_remove',
      timestamp: Date.now(),
      description: `Remove property track "${track.propertyPath}"`,
      data: {
        layerId,
        trackId,
        trackData: structuredClone(track),
      },
    };

    removePropertyTrackStore(layerId, trackId);
    pushToHistory(historyAction);
  }, [getLayer, removePropertyTrackStore, pushToHistory]);

  const addKeyframe = useCallback((
    layerId: LayerId,
    trackId: PropertyTrackId,
    frame: number,
    value: number,
  ) => {
    const keyframeId = addKeyframeStore(layerId, trackId, frame, value);

    // Get the keyframe that was just created
    const layer = useTimelineStore.getState().getLayer(layerId);
    const track = layer?.propertyTracks.find((pt) => pt.id === trackId);
    const keyframe = track?.keyframes.find((kf) => kf.id === keyframeId);

    if (keyframe) {
      const historyAction: KeyframeAddHistoryAction = {
        type: 'keyframe_add',
        timestamp: Date.now(),
        description: `Add keyframe at frame ${frame}`,
        data: {
          layerId,
          trackId,
          keyframeId,
          keyframe: structuredClone(keyframe),
        },
      };
      pushToHistory(historyAction);
    }

    return keyframeId;
  }, [addKeyframeStore, pushToHistory]);

  const removeKeyframe = useCallback((
    layerId: LayerId,
    trackId: PropertyTrackId,
    keyframeId: KeyframeId,
  ) => {
    const layer = getLayer(layerId);
    const track = layer?.propertyTracks.find((pt) => pt.id === trackId);
    const keyframe = track?.keyframes.find((kf) => kf.id === keyframeId);
    if (!keyframe) return;

    const historyAction: KeyframeRemoveHistoryAction = {
      type: 'keyframe_remove',
      timestamp: Date.now(),
      description: `Remove keyframe at frame ${keyframe.frame}`,
      data: {
        layerId,
        trackId,
        keyframeId,
        keyframe: structuredClone(keyframe),
      },
    };

    removeKeyframeStore(layerId, trackId, keyframeId);
    pushToHistory(historyAction);
  }, [getLayer, removeKeyframeStore, pushToHistory]);

  const updateKeyframe = useCallback((
    layerId: LayerId,
    trackId: PropertyTrackId,
    keyframeId: KeyframeId,
    updates: Partial<Pick<Keyframe, 'frame' | 'value' | 'easing'>>,
  ) => {
    const layer = getLayer(layerId);
    const track = layer?.propertyTracks.find((pt) => pt.id === trackId);
    const keyframe = track?.keyframes.find((kf) => kf.id === keyframeId);
    if (!keyframe) return;

    const historyAction: KeyframeUpdateHistoryAction = {
      type: 'keyframe_update',
      timestamp: Date.now(),
      description: `Update keyframe at frame ${keyframe.frame}`,
      data: {
        layerId,
        trackId,
        keyframeId,
        oldValue: structuredClone(keyframe),
        newValue: structuredClone({ ...keyframe, ...updates }),
      },
    };

    updateKeyframeStore(layerId, trackId, keyframeId, updates);
    pushToHistory(historyAction);
  }, [getLayer, updateKeyframeStore, pushToHistory]);

  // ============================================
  // FRAME RATE CHANGE
  // ============================================

  const setFrameRate = useCallback((newFps: number, maintainDuration: boolean = true) => {
    const oldFps = config.frameRate;
    const oldLayers = structuredClone(layers);
    const oldDuration = config.durationFrames;

    setFrameRateStore(newFps, maintainDuration);

    const newState = useTimelineStore.getState();

    const historyAction: FrameRateChangeHistoryAction = {
      type: 'frame_rate_change',
      timestamp: Date.now(),
      description: `Change frame rate from ${oldFps} to ${newFps} FPS`,
      data: {
        oldFps,
        newFps,
        oldLayers,
        newLayers: structuredClone(newState.layers),
        oldDuration,
        newDuration: newState.config.durationFrames,
      },
    };
    pushToHistory(historyAction);
  }, [config, layers, setFrameRateStore, pushToHistory]);

  // ============================================
  // STATIC PROPERTY CHANGE (with history)
  // ============================================

  const setStaticProperty = useCallback((layerId: LayerId, propertyPath: string, newValue: number) => {
    const layer = getLayer(layerId);
    if (!layer) return;

    const oldValue = layer.staticProperties?.[propertyPath];

    useTimelineStore.getState().setStaticProperty(layerId, propertyPath, newValue);

    const historyAction: StaticPropertyChangeHistoryAction = {
      type: 'static_property_change',
      timestamp: Date.now(),
      description: `Set ${propertyPath} to ${newValue}`,
      data: {
        layerId,
        propertyPath,
        oldValue,
        newValue,
      },
    };
    pushToHistory(historyAction);
  }, [getLayer, pushToHistory]);

  // ============================================
  // PASS-THROUGH (no history needed)
  // ============================================

  // These actions don't need undo/redo recording:
  // - setLayerSolo (visual-only toggle, no data change)
  // - setLayerLocked (UI state)
  // - goToFrame, nextFrame, previousFrame (navigation)
  // - setLooping (playback state)
  // - View actions (zoom, scroll, panel height)

  return {
    // Layer operations (with history)
    addLayer,
    removeLayer,
    duplicateLayer,
    reorderLayers,
    renameLayer,
    setLayerVisible,
    setLayerOpacity,

    // Content frame operations (with history)
    addContentFrame,
    removeContentFrame,
    splitContentFrame,
    duplicateContentFrame,
    updateContentFrameTiming,
    updateContentFrameData,

    // Property track & keyframe operations (with history)
    addPropertyTrack,
    removePropertyTrack,
    addKeyframe,
    removeKeyframe,
    updateKeyframe,

    // Frame rate (with history)
    setFrameRate,

    // Static property (with history)
    setStaticProperty,

    // Pass-through without history (from store directly)
    setLayerSolo: useTimelineStore.getState().setLayerSolo,
    setLayerLocked: useTimelineStore.getState().setLayerLocked,
  };
}
