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

import { useCallback, useMemo } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import { useTimelineHistory } from './useTimelineHistory';
import {
  PROPERTY_DEFINITIONS,
  type PropertyPath,
  type LayerId,
} from '../types/timeline';
import { getPropertyValueAtFrame } from '../utils/layerCompositing';

export function useKeyframeableProperty(
  layerId: LayerId | null,
  propertyPath: PropertyPath,
) {
  const layer = useTimelineStore((s) =>
    layerId ? s.layers.find((l) => l.id === layerId) : null,
  );
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const { addPropertyTrack, removePropertyTrack, addKeyframe, updateKeyframe, removeKeyframe } =
    useTimelineHistory();

  const definition = PROPERTY_DEFINITIONS[propertyPath];
  const defaultValue = (definition?.defaultValue as number) ?? 0;

  // Find the property track (if it exists)
  const track = useMemo(
    () => layer?.propertyTracks.find((t) => t.propertyPath === propertyPath) ?? null,
    [layer, propertyPath],
  );

  // Interpolated value at current frame
  const value = useMemo(() => {
    if (!layer) return defaultValue;
    return getPropertyValueAtFrame(layer, propertyPath, currentFrame);
  }, [layer, propertyPath, currentFrame, defaultValue]);

  // Whether a keyframe exists exactly at the current frame
  const keyframeAtCurrentFrame = useMemo(
    () => track?.keyframes.find((kf) => kf.frame === currentFrame) ?? null,
    [track, currentFrame],
  );

  // Set value — creates/updates keyframe if tracked, no-op if not tracked
  const setValue = useCallback(
    (newValue: number) => {
      if (!layerId || !track) return;
      if (keyframeAtCurrentFrame) {
        updateKeyframe(layerId, track.id, keyframeAtCurrentFrame.id, { value: newValue });
      } else {
        addKeyframe(layerId, track.id, currentFrame, newValue);
      }
    },
    [layerId, track, keyframeAtCurrentFrame, currentFrame, updateKeyframe, addKeyframe],
  );

  // Toggle property track on/off
  const toggleTrack = useCallback(() => {
    if (!layerId) return;
    if (track) {
      removePropertyTrack(layerId, track.id);
    } else {
      const trackId = addPropertyTrack(layerId, propertyPath);
      // Optionally create an initial keyframe at the current frame
      if (trackId) {
        addKeyframe(layerId, trackId, currentFrame, value);
      }
    }
  }, [layerId, track, propertyPath, currentFrame, value, addPropertyTrack, removePropertyTrack, addKeyframe]);

  // Toggle keyframe at current frame (add or remove)
  const toggleKeyframe = useCallback(() => {
    if (!layerId || !track) return;
    if (keyframeAtCurrentFrame) {
      removeKeyframe(layerId, track.id, keyframeAtCurrentFrame.id);
    } else {
      addKeyframe(layerId, track.id, currentFrame, value);
    }
  }, [layerId, track, keyframeAtCurrentFrame, currentFrame, value, addKeyframe, removeKeyframe]);

  return {
    value,
    setValue,
    toggleTrack,
    toggleKeyframe,
    isTracked: track !== null,
    hasKeyframeAtCurrentFrame: keyframeAtCurrentFrame !== null,
    track,
    definition,
    defaultValue,
  };
}
