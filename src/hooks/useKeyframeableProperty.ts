/**
 * useKeyframeableProperty Hook
 *
 * Provides a reactive binding between a layer's property and the keyframe system.
 * Returns the current interpolated value at the playhead frame, a setter that
 * auto-creates/updates keyframes, and metadata about the property's keyframe state.
 *
 * Usage:
 *   const posX = useKeyframeableProperty(layerId, 'transform.position.x');
 *   posX.value       // current interpolated value
 *   posX.setValue(10) // creates or updates keyframe at current frame
 *   posX.isTracked    // whether a property track exists
 *   posX.hasKeyframeAtCurrentFrame // diamond indicator
 *
 * Part of the Layer Timeline Refactor (Phase 4)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §4.5
 */

import { useCallback, useMemo, useRef } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import { useToolStore } from '../stores/toolStore';
import {
  PROPERTY_DEFINITIONS,
  type PropertyPath,
  type LayerId,
} from '../types/timeline';
import { getPropertyValueAtFrame, getGroupPropertyValue } from '../utils/layerCompositing';
import type {
  KeyframeUpdateHistoryAction,
  KeyframeAddHistoryAction,
  StaticPropertyChangeHistoryAction,
  PropertyTrackAddHistoryAction,
  PropertyTrackRemoveHistoryAction,
  KeyframeRemoveHistoryAction,
} from '../types';

// Stable no-op functions for the inactive path — avoids creating new function
// objects on every render when layerId is null
const NOOP = () => {};

/**
 * PERF-CRITICAL: This hook is called 7× inside useLayerTransformTool, which runs
 * on every CanvasGrid render. When layerId is null (transform tool not active),
 * this hook MUST be essentially zero-cost — no store subscriptions, no useMemo
 * recalculations, no useCallback recreations.
 *
 * We achieve this by:
 * 1. Skipping the layers.find() selector entirely when layerId is null
 * 2. NOT importing useTimelineHistory (which creates 20+ useCallbacks)
 * 3. Using direct getState() calls in the action callbacks instead
 */
export function useKeyframeableProperty(
  layerId: LayerId | null,
  propertyPath: PropertyPath,
) {
  // Subscribe to layer OR group data when we have a real layerId
  // (layerId may actually be a group ID passed from the transform tool)
  const layer = useTimelineStore((s) =>
    layerId ? s.layers.find((l) => l.id === layerId) : null,
  );
  const groupEntity = useTimelineStore((s) =>
    layerId && !s.layers.find((l) => l.id === layerId)
      ? s.layerGroups.find((g) => (g.id as unknown as LayerId) === layerId)
      : null,
  );
  const isGroup = !!groupEntity;
  const entity = layer ?? groupEntity;
  // Only subscribe to currentFrame when we have an entity
  const currentFrame = useTimelineStore((s) =>
    layerId ? s.view.currentFrame : 0,
  );

  const definition = PROPERTY_DEFINITIONS[propertyPath];
  const defaultValue = (definition?.defaultValue as number) ?? 0;

  const track = useMemo(
    () => entity?.propertyTracks.find((t) => t.propertyPath === propertyPath) ?? null,
    [entity, propertyPath],
  );

  const value = useMemo(() => {
    if (!entity) return defaultValue;
    if (isGroup) return getGroupPropertyValue(groupEntity!, propertyPath, currentFrame);
    return getPropertyValueAtFrame(layer!, propertyPath, currentFrame);
  }, [entity, isGroup, groupEntity, layer, propertyPath, currentFrame, defaultValue]);

  const keyframeAtCurrentFrame = useMemo(
    () => track?.keyframes.find((kf) => kf.frame === currentFrame) ?? null,
    [track, currentFrame],
  );

  // Use a ref to hold the latest values for action callbacks.
  // This avoids recreating useCallback on every render while keeping
  // the callbacks correct.
  const stateRef = useRef({ layerId, track, keyframeAtCurrentFrame, currentFrame, propertyPath, value, isGroup });
  stateRef.current = { layerId, track, keyframeAtCurrentFrame, currentFrame, propertyPath, value, isGroup };

  // Set value — uses getState() directly instead of useTimelineHistory
  // to avoid creating reactive subscriptions in the CanvasGrid tree
  const setValue = useCallback(
    (newValue: number) => {
      const { layerId: lid, track: t, keyframeAtCurrentFrame: kf, currentFrame: cf, propertyPath: pp, isGroup: ig } = stateRef.current;
      if (!lid) return;
      const tl = useTimelineStore.getState();
      const { pushToHistory } = useToolStore.getState();
      if (t) {
        if (kf) {
          const oldKf = structuredClone(kf);
          tl.updateKeyframe(lid, t.id, kf.id, { value: newValue });
          pushToHistory({ type: 'keyframe_update', timestamp: Date.now(), description: `Update keyframe`, data: { layerId: lid, trackId: t.id, keyframeId: kf.id, oldValue: oldKf, newValue: { ...oldKf, value: newValue } } } as KeyframeUpdateHistoryAction);
        } else {
          const kfId = tl.addKeyframe(lid, t.id, cf, newValue);
          // Find the newly added keyframe across layers and groups
          const findKf = () => {
            const layer = tl.getLayer(lid);
            if (layer) {
              const track = layer.propertyTracks.find(pt => pt.id === t.id);
              return track?.keyframes.find(k => k.id === kfId);
            }
            for (const g of tl.layerGroups) {
              const track = g.propertyTracks.find(pt => pt.id === t.id);
              if (track) return track.keyframes.find(k => k.id === kfId);
            }
            return undefined;
          };
          const newKf = findKf();
          if (newKf) pushToHistory({ type: 'keyframe_add', timestamp: Date.now(), description: `Add keyframe`, data: { layerId: lid, trackId: t.id, keyframeId: kfId, keyframe: structuredClone(newKf) } } as KeyframeAddHistoryAction);
        }
      } else {
        const layer = tl.getLayer(lid);
        const oldValue = layer?.staticProperties?.[pp] ?? (ig ? tl.layerGroups.find(g => (g.id as unknown) === lid)?.staticProperties?.[pp] : undefined);
        tl.setStaticProperty(lid, pp, newValue);
        pushToHistory({ type: 'static_property_change', timestamp: Date.now(), description: `Set ${pp}`, data: { layerId: lid, propertyPath: pp, oldValue, newValue } } as StaticPropertyChangeHistoryAction);
      }
    },
    [], // stable — reads from stateRef
  );

  const toggleTrack = useCallback(() => {
    const { layerId: lid, track: t, propertyPath: pp, currentFrame: cf, value: v } = stateRef.current;
    if (!lid) return;
    const tl = useTimelineStore.getState();
    const { pushToHistory } = useToolStore.getState();
    if (t) {
      const trackData = structuredClone(t);
      tl.removePropertyTrack(lid, t.id);
      pushToHistory({ type: 'property_track_remove', timestamp: Date.now(), description: `Remove track`, data: { layerId: lid, trackId: t.id, trackData } } as PropertyTrackRemoveHistoryAction);
    } else {
      const trackId = tl.addPropertyTrack(lid, pp);
      if (trackId) {
        tl.addKeyframe(lid, trackId, cf, v);
        pushToHistory({ type: 'property_track_add', timestamp: Date.now(), description: `Add track`, data: { layerId: lid, trackId, propertyPath: pp } } as PropertyTrackAddHistoryAction);
      }
    }
  }, []);

  const toggleKeyframe = useCallback(() => {
    const { layerId: lid, track: t, keyframeAtCurrentFrame: kf, currentFrame: cf, value: v } = stateRef.current;
    if (!lid || !t) return;
    const tl = useTimelineStore.getState();
    const { pushToHistory } = useToolStore.getState();
    if (kf) {
      const kfData = structuredClone(kf);
      tl.removeKeyframe(lid, t.id, kf.id);
      pushToHistory({ type: 'keyframe_remove', timestamp: Date.now(), description: `Remove keyframe`, data: { layerId: lid, trackId: t.id, keyframeId: kf.id, keyframe: kfData } } as KeyframeRemoveHistoryAction);
    } else {
      const kfId = tl.addKeyframe(lid, t.id, cf, v);
      // Find keyframe across layers and groups
      const findKf = () => {
        const layer = tl.getLayer(lid);
        if (layer) {
          const track = layer.propertyTracks.find(pt => pt.id === t.id);
          return track?.keyframes.find(k => k.id === kfId);
        }
        for (const g of tl.layerGroups) {
          const track = g.propertyTracks.find(pt => pt.id === t.id);
          if (track) return track.keyframes.find(k => k.id === kfId);
        }
        return undefined;
      };
      const newKf = findKf();
      if (newKf) pushToHistory({ type: 'keyframe_add', timestamp: Date.now(), description: `Add keyframe`, data: { layerId: lid, trackId: t.id, keyframeId: kfId, keyframe: structuredClone(newKf) } } as KeyframeAddHistoryAction);
    }
  }, []);

  return {
    value,
    setValue: layerId ? setValue : NOOP as (v: number) => void,
    toggleTrack: layerId ? toggleTrack : NOOP,
    toggleKeyframe: layerId ? toggleKeyframe : NOOP,
    isTracked: track !== null,
    hasKeyframeAtCurrentFrame: keyframeAtCurrentFrame !== null,
    track,
    definition,
    defaultValue,
  };
}
