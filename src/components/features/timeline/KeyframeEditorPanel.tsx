/**
 * Keyframe Editor Panel — right-side panel for editing a selected keyframe's
 * value, frame position, and easing curve.
 *
 * Features:
 *  - Diamond keyframe icon in header
 *  - Always-visible cubic easing graph (not just for custom)
 *  - Preset buttons set graph values; dragging graph switches to custom
 *  - Editable P1/P2 text fields for manual curve entry
 *  - Copy/Paste ease between keyframes (single or multi-select)
 *  - Works for both layer and group keyframes via store fallbacks
 *
 * Part of the Layer Timeline Refactor (Phase 3, updated Phase 7)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.10
 */

import React, { useMemo, useState } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { PROPERTY_DEFINITIONS } from '../../../types/timeline';
import { EasingCurveEditor } from './EasingCurveEditor';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { X, Diamond, Copy, ClipboardPaste } from 'lucide-react';
import type { EasingCurve } from '../../../types/timeline';

// Clipboard state for ease copy/paste (module-level, persists across re-renders)
let copiedEasing: EasingCurve | null = null;

export const KeyframeEditorPanel: React.FC = () => {
  const editingKeyframeId = useTimelineStore((s) => s.view.editingKeyframeId);
  const selectedKeyframeIds = useTimelineStore((s) => s.view.selectedKeyframeIds);
  const layers = useTimelineStore((s) => s.layers);
  const layerGroups = useTimelineStore((s) => s.layerGroups);
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const moveKeyframe = useTimelineStore((s) => s.moveKeyframe);
  const updateKeyframe = useTimelineStore((s) => s.updateKeyframe);
  const setKeyframeLooping = useTimelineStore((s) => s.setKeyframeLooping);
  const removeKeyframe = useTimelineStore((s) => s.removeKeyframe);
  const clearKeyframeSelection = useTimelineStore((s) => s.clearKeyframeSelection);

  const [hasCopiedEase, setHasCopiedEase] = useState(!!copiedEasing);

  const multiSelectCount = selectedKeyframeIds.size;

  // Find the keyframe being edited across all layers/tracks and groups
  const kfData = useMemo(() => {
    if (!editingKeyframeId) return null;
    for (const layer of layers) {
      for (const track of layer.propertyTracks) {
        const kf = track.keyframes.find((k) => k.id === editingKeyframeId);
        if (kf) return { layerId: layer.id, trackId: track.id, keyframe: kf, track };
      }
    }
    for (const group of layerGroups) {
      for (const track of group.propertyTracks) {
        const kf = track.keyframes.find((k) => k.id === editingKeyframeId);
        if (kf) {
          const proxyLayerId = group.childLayerIds[0] ?? ('' as typeof layers[0]['id']);
          return { layerId: proxyLayerId, trackId: track.id, keyframe: kf, track };
        }
      }
    }
    return null;
  }, [editingKeyframeId, layers, layerGroups]);

  // All selected keyframes (for batch operations)
  const selectedKeyframeEntries = useMemo(() => {
    if (selectedKeyframeIds.size <= 1) return [];
    const entries: Array<{ layerId: typeof layers[0]['id']; trackId: typeof layers[0]['propertyTracks'][0]['id']; keyframe: typeof layers[0]['propertyTracks'][0]['keyframes'][0] }> = [];
    for (const layer of layers) {
      for (const track of layer.propertyTracks) {
        for (const kf of track.keyframes) {
          if (selectedKeyframeIds.has(kf.id)) entries.push({ layerId: layer.id, trackId: track.id, keyframe: kf });
        }
      }
    }
    for (const group of layerGroups) {
      for (const track of group.propertyTracks) {
        for (const kf of track.keyframes) {
          if (selectedKeyframeIds.has(kf.id)) {
            const proxyLayerId = group.childLayerIds[0] ?? ('' as typeof layers[0]['id']);
            entries.push({ layerId: proxyLayerId, trackId: track.id, keyframe: kf });
          }
        }
      }
    }
    return entries;
  }, [selectedKeyframeIds, layers, layerGroups]);

  if (!kfData) return null;

  const { layerId, trackId, keyframe, track } = kfData;
  const definition = PROPERTY_DEFINITIONS[track.propertyPath];

  const handleFrameChange = (value: string) => {
    const frame = parseInt(value, 10);
    if (!isNaN(frame) && frame >= 0) moveKeyframe(layerId, trackId, keyframe.id, frame);
  };

  const handleValueChange = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) updateKeyframe(layerId, trackId, keyframe.id, { value: num });
  };

  const handleEasingChange = (easing: EasingCurve) => {
    if (selectedKeyframeEntries.length > 1) {
      for (const entry of selectedKeyframeEntries) {
        updateKeyframe(entry.layerId, entry.trackId, entry.keyframe.id, { easing });
      }
    } else {
      updateKeyframe(layerId, trackId, keyframe.id, { easing });
    }
  };

  const handleDelete = () => {
    if (selectedKeyframeEntries.length > 1) {
      for (const entry of selectedKeyframeEntries) {
        removeKeyframe(entry.layerId, entry.trackId, entry.keyframe.id);
      }
      clearKeyframeSelection();
    } else {
      removeKeyframe(layerId, trackId, keyframe.id);
      setEditingKeyframe(null);
    }
  };

  const handleCopyEase = () => {
    copiedEasing = { ...keyframe.easing };
    if (copiedEasing.type === 'custom') {
      copiedEasing = { type: 'custom', x1: copiedEasing.x1, y1: copiedEasing.y1, x2: copiedEasing.x2, y2: copiedEasing.y2 };
    }
    setHasCopiedEase(true);
  };

  const handlePasteEase = () => {
    if (!copiedEasing) return;
    handleEasingChange({ ...copiedEasing });
  };

  return (
    <div className="w-56 flex-shrink-0 border-l border-border/50 bg-muted/20 overflow-y-auto">
      {/* Header with diamond icon */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
        <div className="flex items-center gap-1.5 min-w-0">
          <Diamond className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />
          <span className="text-xs font-medium truncate">
            {definition?.displayName ?? track.propertyPath}
          </span>
          {multiSelectCount > 1 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 tabular-nums flex-shrink-0">
              {multiSelectCount}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setEditingKeyframe(null)}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      <div className="p-2 space-y-2">
        {/* Frame + Value */}
        <div className="flex gap-1.5">
          <div className="flex-1">
            <Label className="text-[10px] text-muted-foreground">Frame</Label>
            <Input type="number" value={keyframe.frame} onChange={(e) => handleFrameChange(e.target.value)}
              className="h-6 text-xs mt-0.5" min={0} />
          </div>
          <div className="flex-1">
            <Label className="text-[10px] text-muted-foreground">
              Value{definition?.unit ? ` (${definition.unit})` : ''}
            </Label>
            <Input type="number" value={keyframe.value as number} onChange={(e) => handleValueChange(e.target.value)}
              className="h-6 text-xs mt-0.5" min={definition?.min} max={definition?.max} step={definition?.step ?? 1} />
          </div>
        </div>

        {/* Easing — always-visible graph + presets + editable fields */}
        <div>
          <Label className="text-[10px] text-muted-foreground">Easing</Label>
          <div className="mt-0.5">
            <EasingCurveEditor value={keyframe.easing} onChange={handleEasingChange} />
          </div>
        </div>

        {/* Copy/Paste Ease buttons */}
        <TooltipProvider>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 h-6 text-[10px] gap-1" onClick={handleCopyEase}>
                  <Copy className="w-3 h-3" />
                  Copy Ease
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Copy easing curve to clipboard</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 h-6 text-[10px] gap-1"
                  onClick={handlePasteEase} disabled={!hasCopiedEase}>
                  <ClipboardPaste className="w-3 h-3" />
                  Paste Ease
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {hasCopiedEase
                  ? `Paste easing to ${multiSelectCount > 1 ? `${multiSelectCount} keyframes` : 'keyframe'}`
                  : 'No easing copied yet'}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

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
          <Button variant="ghost" size="sm"
            className="h-5 text-[10px] px-1.5 text-destructive hover:text-destructive"
            onClick={handleDelete}>
            Delete{multiSelectCount > 1 ? ` (${multiSelectCount})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
};
