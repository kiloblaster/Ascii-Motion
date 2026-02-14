/**
 * Group Properties Panel — right-side panel showing transform property
 * values for the active group, with keyframe toggles.
 *
 * Mirrors LayerPropertiesPanel styling exactly. Groups support the same
 * transform properties except anchor point (not meaningful for groups).
 *
 * Part of the Layer Timeline Refactor (Phase 7)
 */

import React, { useState, useCallback } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { PROPERTY_DEFINITIONS } from '../../../types/timeline';
import { getGroupPropertyValue } from '../../../utils/layerCompositing';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { Diamond, X, RotateCcw } from 'lucide-react';
import type { PropertyPath, LayerGroupId } from '../../../types/timeline';
import {
  generateKeyframeId,
  generatePropertyTrackId,
} from '../../../types/timeline';
import { defaultEasing } from '../../../types/easing';

const GROUP_TRANSFORM_PROPERTIES: PropertyPath[] = [
  'transform.position.x',
  'transform.position.y',
  'transform.scale.x',
  'transform.scale.y',
  'transform.rotation',
];

interface GroupPropertyRowProps {
  groupId: LayerGroupId;
  propertyPath: PropertyPath;
}

const GroupPropertyRow: React.FC<GroupPropertyRowProps> = ({ groupId, propertyPath }) => {
  const group = useTimelineStore((s) => s.layerGroups.find(g => g.id === groupId));
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const definition = PROPERTY_DEFINITIONS[propertyPath];
  if (!group || !definition) return null;

  const track = group.propertyTracks.find(t => t.propertyPath === propertyPath);
  const isTracked = !!track;
  const value = getGroupPropertyValue(group, propertyPath, currentFrame);
  const hasKeyframeAtCurrentFrame = track?.keyframes.some(kf => kf.frame === currentFrame) ?? false;

  const [localValue, setLocalValue] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState(false);
  const displayValue = isFocused ? localValue : String(value);

  const writeValue = useCallback((clamped: number) => {
    if (isTracked && track) {
      const existingKf = track.keyframes.find(kf => kf.frame === currentFrame);
      if (existingKf) {
        useTimelineStore.setState((s) => ({
          layerGroups: s.layerGroups.map(g => g.id !== groupId ? g : {
            ...g, propertyTracks: g.propertyTracks.map(t => t.id !== track.id ? t : {
              ...t, keyframes: t.keyframes.map(kf => kf.id !== existingKf.id ? kf : { ...kf, value: clamped }),
            }),
          }),
        }));
      } else {
        useTimelineStore.setState((s) => ({
          layerGroups: s.layerGroups.map(g => g.id !== groupId ? g : {
            ...g, propertyTracks: g.propertyTracks.map(t => t.id !== track.id ? t : {
              ...t, keyframes: [...t.keyframes, { id: generateKeyframeId(), frame: currentFrame, value: clamped, easing: defaultEasing() }].sort((a, b) => a.frame - b.frame),
            }),
          }),
        }));
      }
    } else {
      useTimelineStore.setState((s) => ({
        layerGroups: s.layerGroups.map(g => g.id !== groupId ? g : {
          ...g, staticProperties: { ...g.staticProperties, [propertyPath]: clamped },
        }),
      }));
    }
  }, [isTracked, track, groupId, propertyPath, currentFrame]);

  const commitValue = useCallback(() => {
    const num = parseFloat(localValue);
    if (!isNaN(num) && num !== value) {
      const clamped = Math.max(definition.min ?? -Infinity, Math.min(definition.max ?? Infinity, num));
      writeValue(clamped);
    }
    setLocalValue(String(isNaN(num) ? value : num));
  }, [localValue, value, definition, writeValue]);

  const handleKeyframeToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTracked && track) {
      const existingKf = track.keyframes.find(kf => kf.frame === currentFrame);
      if (existingKf) {
        useTimelineStore.setState((s) => ({
          layerGroups: s.layerGroups.map(g => g.id !== groupId ? g : {
            ...g, propertyTracks: g.propertyTracks.map(t => t.id !== track.id ? t : {
              ...t, keyframes: t.keyframes.filter(kf => kf.id !== existingKf.id),
            }),
          }),
        }));
      } else {
        useTimelineStore.setState((s) => ({
          layerGroups: s.layerGroups.map(g => g.id !== groupId ? g : {
            ...g, propertyTracks: g.propertyTracks.map(t => t.id !== track.id ? t : {
              ...t, keyframes: [...t.keyframes, { id: generateKeyframeId(), frame: currentFrame, value, easing: defaultEasing() }].sort((a, b) => a.frame - b.frame),
            }),
          }),
        }));
      }
    } else {
      useTimelineStore.setState((s) => ({
        layerGroups: s.layerGroups.map(g => g.id !== groupId ? g : {
          ...g, propertyTracks: [...g.propertyTracks, {
            id: generatePropertyTrackId(), propertyPath, loopKeyframes: false,
            keyframes: [{ id: generateKeyframeId(), frame: currentFrame, value, easing: defaultEasing() }],
          }],
        }),
      }));
    }
  };

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="flex-shrink-0 p-0.5 hover:bg-muted rounded" onClick={handleKeyframeToggle}>
              <Diamond className={`w-3 h-3 ${hasKeyframeAtCurrentFrame ? 'text-yellow-400 fill-yellow-400' : isTracked ? 'text-yellow-500' : 'text-muted-foreground/40'}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {hasKeyframeAtCurrentFrame ? 'Remove keyframe at playhead' : isTracked ? 'Add keyframe at playhead' : 'Add property track + keyframe'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <span className="text-[10px] text-muted-foreground w-14 truncate flex-shrink-0">
        {definition?.displayName ?? propertyPath.split('.').pop()}
      </span>

      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => { setIsFocused(true); setLocalValue(String(value)); }}
        onBlur={() => { setIsFocused(false); commitValue(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commitValue(); (e.target as HTMLInputElement).blur(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const step = definition?.step ?? 1;
            const delta = e.key === 'ArrowUp' ? step : -step;
            const current = parseFloat(localValue) || 0;
            let next = current + delta;
            if (definition?.min !== undefined) next = Math.max(definition.min, next);
            if (definition?.max !== undefined) next = Math.min(definition.max, next);
            setLocalValue(String(next));
            writeValue(next);
          }
        }}
        className="h-5 text-[10px] px-1 flex-1 min-w-0 rounded border border-border/50 bg-background text-foreground outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />

      {definition?.unit && (
        <span className="text-[9px] text-muted-foreground/50 w-5 flex-shrink-0">{definition.unit}</span>
      )}
    </div>
  );
};

export const GroupPropertiesPanel: React.FC = () => {
  const activeGroupId = useTimelineStore((s) => s.view.activeGroupId);
  const group = useTimelineStore((s) => s.view.activeGroupId ? s.layerGroups.find(g => g.id === s.view.activeGroupId) : null);
  const setActiveGroup = useTimelineStore((s) => s.setActiveGroup);

  if (!group || !activeGroupId) return null;

  return (
    <div className="w-48 flex-shrink-0 border-l border-border/50 bg-muted/20 overflow-y-auto">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50">
        <div className="min-w-0">
          <span className="text-xs font-medium truncate block">{group.name}</span>
        </div>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 flex-shrink-0" onClick={() => setActiveGroup(null)}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      <div className="px-2 py-1">
        {GROUP_TRANSFORM_PROPERTIES.map((path) => (
          <GroupPropertyRow key={path} groupId={activeGroupId} propertyPath={path} />
        ))}
      </div>

      <div className="px-2 pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            useTimelineStore.setState((state) => ({
              layerGroups: state.layerGroups.map(g => g.id !== activeGroupId ? g : {
                ...g, propertyTracks: [], staticProperties: {},
              }),
            }));
          }}
        >
          <RotateCcw className="w-3 h-3" />
          Reset Transforms
        </Button>
      </div>
    </div>
  );
};
