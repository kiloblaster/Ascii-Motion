/**
 * Keyframe Editor Panel — right-side panel for editing a selected keyframe's
 * value, frame position, and easing curve.
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.10
 */

import React, { useMemo } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { PROPERTY_DEFINITIONS } from '../../../types/timeline';
import { EASING_PRESETS } from '../../../types/timeline';
import { EasingCurveEditor } from './EasingCurveEditor';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { X } from 'lucide-react';
import type { EasingCurve } from '../../../types/timeline';

export const KeyframeEditorPanel: React.FC = () => {
  const editingKeyframeId = useTimelineStore((s) => s.view.editingKeyframeId);
  const layers = useTimelineStore((s) => s.layers);
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const moveKeyframe = useTimelineStore((s) => s.moveKeyframe);
  const updateKeyframe = useTimelineStore((s) => s.updateKeyframe);
  const setKeyframeLooping = useTimelineStore((s) => s.setKeyframeLooping);
  const removeKeyframe = useTimelineStore((s) => s.removeKeyframe);

  // Find the keyframe being edited across all layers/tracks
  const kfData = useMemo(() => {
    if (!editingKeyframeId) return null;
    for (const layer of layers) {
      for (const track of layer.propertyTracks) {
        const kf = track.keyframes.find((k) => k.id === editingKeyframeId);
        if (kf) {
          return { layerId: layer.id, trackId: track.id, keyframe: kf, track };
        }
      }
    }
    return null;
  }, [editingKeyframeId, layers]);

  if (!kfData) {
    return null;
  }

  const { layerId, trackId, keyframe, track } = kfData;
  const definition = PROPERTY_DEFINITIONS[track.propertyPath];

  const handleFrameChange = (value: string) => {
    const frame = parseInt(value, 10);
    if (!isNaN(frame) && frame >= 0) {
      moveKeyframe(layerId, trackId, keyframe.id, frame);
    }
  };

  const handleValueChange = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      updateKeyframe(layerId, trackId, keyframe.id, num, keyframe.easing);
    }
  };

  const handleEasingChange = (easing: EasingCurve) => {
    updateKeyframe(layerId, trackId, keyframe.id, keyframe.value, easing);
  };

  const handleDelete = () => {
    removeKeyframe(layerId, trackId, keyframe.id);
    setEditingKeyframe(null);
  };

  return (
    <div className="w-56 flex-shrink-0 border-l bg-muted/20 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium">
          {definition?.displayName ?? track.propertyPath}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={() => setEditingKeyframe(null)}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>

      <div className="p-3 space-y-3">
        {/* Frame */}
        <div>
          <Label className="text-xs text-muted-foreground">Frame</Label>
          <Input
            type="number"
            value={keyframe.frame}
            onChange={(e) => handleFrameChange(e.target.value)}
            className="h-7 text-xs mt-1"
            min={0}
          />
        </div>

        {/* Value */}
        <div>
          <Label className="text-xs text-muted-foreground">
            Value
            {definition?.unit && (
              <span className="ml-1 text-muted-foreground/60">({definition.unit})</span>
            )}
          </Label>
          <Input
            type="number"
            value={keyframe.value}
            onChange={(e) => handleValueChange(e.target.value)}
            className="h-7 text-xs mt-1"
            min={definition?.min}
            max={definition?.max}
            step={definition?.step ?? 1}
          />
        </div>

        {/* Easing */}
        <div>
          <Label className="text-xs text-muted-foreground">Easing</Label>
          <EasingCurveEditor value={keyframe.easing} onChange={handleEasingChange} />
        </div>

        {/* Loop toggle */}
        <div className="flex items-center gap-2 pt-1">
          <Switch
            checked={track.loopKeyframes}
            onCheckedChange={(loop) => setKeyframeLooping(layerId, trackId, loop)}
            className="scale-75"
          />
          <Label className="text-xs text-muted-foreground">Loop keyframes</Label>
        </div>

        {/* Delete keyframe */}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-7 text-destructive hover:text-destructive"
          onClick={handleDelete}
        >
          Delete Keyframe
        </Button>
      </div>
    </div>
  );
};
