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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { X, ChevronDown } from 'lucide-react';
import type { EasingCurve, EasingPreset } from '../../../types/timeline';

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
      updateKeyframe(layerId, trackId, keyframe.id, { value: num });
    }
  };

  const handleEasingChange = (easing: EasingCurve) => {
    updateKeyframe(layerId, trackId, keyframe.id, { easing });
  };

  const handleDelete = () => {
    removeKeyframe(layerId, trackId, keyframe.id);
    setEditingKeyframe(null);
  };

  const EASING_LABELS: Record<string, string> = {
    'linear': 'Linear',
    'hold': 'Hold',
    'ease-in': 'Ease In',
    'ease-out': 'Ease Out',
    'ease-in-out': 'Ease In-Out',
    'ease-out-back': 'Overshoot Out',
    'ease-in-back': 'Overshoot In',
    'bounce': 'Bounce',
    'custom': 'Custom',
  };

  return (
    <div className="w-48 flex-shrink-0 border-l border-border/50 bg-muted/20 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
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

      <div className="p-2 space-y-2">
        {/* Frame + Value on same row */}
        <div className="flex gap-1.5">
          <div className="flex-1">
            <Label className="text-[10px] text-muted-foreground">Frame</Label>
            <Input
              type="number"
              value={keyframe.frame}
              onChange={(e) => handleFrameChange(e.target.value)}
              className="h-6 text-xs mt-0.5"
              min={0}
            />
          </div>
          <div className="flex-1">
            <Label className="text-[10px] text-muted-foreground">
              Value{definition?.unit ? ` (${definition.unit})` : ''}
            </Label>
            <Input
              type="number"
              value={keyframe.value}
              onChange={(e) => handleValueChange(e.target.value)}
              className="h-6 text-xs mt-0.5"
              min={definition?.min}
              max={definition?.max}
              step={definition?.step ?? 1}
            />
          </div>
        </div>

        {/* Easing dropdown */}
        <div>
          <Label className="text-[10px] text-muted-foreground">Easing</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between h-6 px-2 mt-0.5 text-xs rounded border border-border/50 bg-background hover:bg-muted transition-colors">
                <span>{EASING_LABELS[keyframe.easing.type] ?? keyframe.easing.type}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[140px]">
              {(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'ease-out-back', 'ease-in-back', 'bounce', 'hold', 'custom'] as const).map((preset) => (
                <DropdownMenuItem
                  key={preset}
                  onClick={() => {
                    if (preset === 'custom') {
                      handleEasingChange({ type: 'custom', x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
                    } else {
                      handleEasingChange({ type: preset });
                    }
                  }}
                  className={keyframe.easing.type === preset ? 'bg-accent' : ''}
                >
                  {EASING_LABELS[preset]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Custom curve editor (only when custom selected) */}
        {keyframe.easing.type === 'custom' && (
          <EasingCurveEditor value={keyframe.easing} onChange={handleEasingChange} />
        )}

        {/* Loop + Delete row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <Switch
              checked={track.loopKeyframes}
              onCheckedChange={(loop) => setKeyframeLooping(layerId, trackId, loop)}
              className="scale-[0.6]"
            />
            <Label className="text-[10px] text-muted-foreground">Loop</Label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1.5 text-destructive hover:text-destructive"
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};
