/**
 * Effect Properties Panel — right-side panel showing all properties
 * for the selected effect block, with value inputs and keyframe toggles.
 *
 * Shown when an effect block is selected on the timeline.
 * Replaces the LayerPropertiesPanel in the right sidebar.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef, createRef } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useToolStore } from '../../../stores/toolStore';
import { useCanvasStore } from '../../../stores/canvasStore';
import { usePaletteStore } from '../../../stores/paletteStore';
import { getEffect } from '../../../registry/effectRegistry';
import { evaluateEffectBlock } from '../../../utils/effectsPipeline';
import { mapCanvasColorsToPalette } from '../../../utils/effectsProcessing';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { ColorPickerOverlay } from '../ColorPickerOverlay';
import { EnhancedCharacterPicker } from '../EnhancedCharacterPicker';
import { Trash2, Eye, EyeOff, X, Check, Diamond, RotateCcw } from 'lucide-react';
import { useScrubInput } from '../../../hooks/useScrubInput';
import { useEffectBlockHistory } from '../../../hooks/useEffectBlockHistory';
import type { EffectTrack, EffectPropertyDefinition, EffectBlock } from '../../../types/effectBlock';
import type { KeyframeId } from '../../../types/timeline';

/**
 * Find the effect track containing a block by its ID across layers, groups, and global.
 */
function findTrackByBlockId(blockId: string): { track: EffectTrack; ownerId: string | null } | null {
  const state = useTimelineStore.getState();

  // Search layers
  for (const layer of state.layers) {
    for (const track of (layer.effectTracks ?? [])) {
      if ((track.effectBlock.id as string) === blockId) {
        return { track, ownerId: layer.id as string };
      }
    }
  }

  // Search groups
  for (const group of state.layerGroups) {
    for (const track of (group.effectTracks ?? [])) {
      if ((track.effectBlock.id as string) === blockId) {
        return { track, ownerId: group.id as string };
      }
    }
  }

  // Search global
  for (const track of state.globalEffects) {
    if ((track.effectBlock.id as string) === blockId) {
      return { track, ownerId: null };
    }
  }

  return null;
}

interface EffectPropertyRowProps {
  definition: EffectPropertyDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  block: EffectBlock;
  currentFrame: number;
}

const EffectPropertyRow: React.FC<EffectPropertyRowProps> = ({ definition, value, onChange, block, currentFrame }) => {
  const [localValue, setLocalValue] = useState<string>(String(value ?? definition.defaultValue));
  const [isFocused, setIsFocused] = useState(false);
  const addEffectPropertyTrack = useTimelineStore((s) => s.addEffectPropertyTrack);
  const addEffectKeyframe = useTimelineStore((s) => s.addEffectKeyframe);
  const removeEffectKeyframe = useTimelineStore((s) => s.removeEffectKeyframe);
  const toggleEffectTrackExpanded = useTimelineStore((s) => s.toggleEffectTrackExpanded);
  const pushToHistory = useToolStore((s) => s.pushToHistory);

  /** Auto-expand the layer and effect track to reveal keyframes */
  const ensureExpanded = useCallback(() => {
    const tl = useTimelineStore.getState();
    // Expand the effect track if not already
    if (!tl.view.expandedEffectTrackIds.has(block.id)) {
      toggleEffectTrackExpanded(block.id);
    }
    // Find the owning layer and expand it if not already
    for (const layer of tl.layers) {
      if ((layer.effectTracks ?? []).some((et) => et.effectBlock.id === block.id)) {
        if (!tl.view.expandedLayerIds.has(layer.id)) {
          tl.toggleLayerExpanded(layer.id);
        }
        break;
      }
    }
  }, [block.id, toggleEffectTrackExpanded]);

  // Find existing property track and keyframe at current frame
  const existingTrack = block.propertyTracks.find((pt) => pt.propertyPath === definition.path);
  const existingKf = existingTrack?.keyframes.find((kf) => kf.frame === currentFrame);
  const isTracked = !!existingTrack;
  const hasKeyframeAtCurrentFrame = !!existingKf;

  const handleKeyframeToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTracked) {
      // Create property track + add keyframe at current frame
      const trackId = addEffectPropertyTrack(block.id, definition.path);
      if (trackId) {
        const kfValue = (value ?? definition.defaultValue) as import('../../../types/effectBlock').EffectKeyframe['value'];
        const kfId = addEffectKeyframe(block.id, trackId, currentFrame, kfValue);
        pushToHistory({
          type: 'effect_keyframe_add', timestamp: Date.now(), description: `Add ${definition.displayName} keyframe`,
          data: { ownerId: null, ownerType: 'layer', blockId: block.id as string, trackId: trackId as string,
            keyframe: { id: kfId, frame: currentFrame, value: kfValue, easing: { type: 'linear' as const } } },
        } as import('../../../types').EffectKeyframeAddHistoryAction);
        ensureExpanded();
      }
    } else if (hasKeyframeAtCurrentFrame && existingKf && existingTrack) {
      // Remove keyframe at current frame — record before removing
      pushToHistory({
        type: 'effect_keyframe_remove', timestamp: Date.now(), description: `Remove ${definition.displayName} keyframe`,
        data: { ownerId: null, ownerType: 'layer', blockId: block.id as string, trackId: existingTrack.id as string,
          keyframe: structuredClone(existingKf) },
      } as import('../../../types').EffectKeyframeRemoveHistoryAction);
      removeEffectKeyframe(block.id, existingTrack.id, existingKf.id as KeyframeId);
    } else if (existingTrack) {
      // Add keyframe at current frame
      const kfValue = (value ?? definition.defaultValue) as import('../../../types/effectBlock').EffectKeyframe['value'];
      const kfId = addEffectKeyframe(block.id, existingTrack.id, currentFrame, kfValue);
      pushToHistory({
        type: 'effect_keyframe_add', timestamp: Date.now(), description: `Add ${definition.displayName} keyframe`,
        data: { ownerId: null, ownerType: 'layer', blockId: block.id as string, trackId: existingTrack.id as string,
          keyframe: { id: kfId, frame: currentFrame, value: kfValue, easing: { type: 'linear' as const } } },
      } as import('../../../types').EffectKeyframeAddHistoryAction);
      ensureExpanded();
    }
  }, [isTracked, hasKeyframeAtCurrentFrame, block.id, definition.path, definition.displayName, definition.defaultValue, currentFrame, value, existingKf, existingTrack, addEffectPropertyTrack, addEffectKeyframe, removeEffectKeyframe, ensureExpanded, pushToHistory]);

  // Scrub input hook (must be before any early returns)
  const scrubValue = typeof value === 'number' ? value : (definition.defaultValue as number);
  const scrub = useScrubInput({
    value: scrubValue,
    onChange: (v) => { setLocalValue(String(v)); onChange(v); },
    step: definition.step ?? 1,
    min: definition.min,
    max: definition.max,
  });

  const keyframeDiamond = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex-shrink-0 p-0.5 hover:bg-muted rounded"
            onClick={handleKeyframeToggle}
          >
            <Diamond
              className={`w-3 h-3 ${
                hasKeyframeAtCurrentFrame
                  ? 'text-yellow-400 fill-yellow-400'
                  : isTracked
                    ? 'text-yellow-500'
                    : 'text-muted-foreground/40'
              }`}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {hasKeyframeAtCurrentFrame
            ? 'Remove keyframe at playhead'
            : isTracked
              ? 'Add keyframe at playhead'
              : 'Add property track + keyframe'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const displayValue = isFocused ? localValue : String(value ?? definition.defaultValue);

  const commitValue = useCallback(() => {
    if (definition.valueType === 'number') {
      const num = parseFloat(localValue);
      if (!isNaN(num)) {
        let clamped = num;
        if (definition.min !== undefined) clamped = Math.max(definition.min, clamped);
        if (definition.max !== undefined) clamped = Math.min(definition.max, clamped);
        onChange(clamped);
        setLocalValue(String(clamped));
        return;
      }
    } else if (definition.valueType === 'boolean') {
      onChange(!value);
      return;
    }
    setLocalValue(String(value ?? definition.defaultValue));
  }, [localValue, value, definition, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitValue();
      (e.target as HTMLInputElement).blur();
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && definition.valueType === 'number') {
      e.preventDefault();
      const step = definition.step ?? 1;
      const delta = e.key === 'ArrowUp' ? step : -step;
      const current = parseFloat(localValue) || 0;
      let next = current + delta;
      if (definition.min !== undefined) next = Math.max(definition.min, next);
      if (definition.max !== undefined) next = Math.min(definition.max, next);
      setLocalValue(String(next));
      onChange(next);
    }
  };

  // Boolean toggle
  if (definition.valueType === 'boolean') {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        {keyframeDiamond}
        <span className="text-[10px] text-muted-foreground w-20 truncate flex-shrink-0">
          {definition.displayName}
        </span>
        <button
          className="h-5 px-2 text-[10px] rounded border border-border/50 bg-background hover:bg-muted"
          onClick={() => onChange(!value)}
        >
          {value ? 'On' : 'Off'}
        </button>
      </div>
    );
  }

  // Select dropdown
  if (definition.valueType === 'select' && definition.options) {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        {keyframeDiamond}
        <span className="text-[10px] text-muted-foreground w-20 truncate flex-shrink-0">
          {definition.displayName}
        </span>
        <select
          className="h-5 text-[10px] px-1 flex-1 min-w-0 rounded border border-border/50 bg-background text-foreground outline-none"
          value={String(value ?? definition.defaultValue)}
          onChange={(e) => onChange(e.target.value)}
        >
          {definition.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  // Mapping type — inline mapping editor
  if (definition.valueType === 'mapping') {
    return (
      <MappingEditor
        definition={definition}
        value={value as Record<string, string> | undefined}
        onChange={onChange}
        keyframeDiamond={keyframeDiamond}
      />
    );
  }

  // Numeric input (default)
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      {keyframeDiamond}
      <span className="text-[10px] text-muted-foreground w-20 truncate flex-shrink-0 cursor-ew-resize" onMouseDown={scrub.onMouseDown}>
        {definition.displayName}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => { setIsFocused(true); setLocalValue(String(value ?? definition.defaultValue)); }}
        onBlur={() => { setIsFocused(false); commitValue(); }}
        onKeyDown={handleKeyDown}
        className="h-5 text-[10px] px-1 flex-1 min-w-0 rounded border border-border/50 bg-background text-foreground outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {definition.unit && (
        <span className="text-[9px] text-muted-foreground/50 w-5 flex-shrink-0">
          {definition.unit}
        </span>
      )}
    </div>
  );
};

// ============================================
// MAPPING EDITOR COMPONENT
// ============================================

interface MappingEditorProps {
  definition: EffectPropertyDefinition;
  value: Record<string, string> | undefined;
  onChange: (value: unknown) => void;
  keyframeDiamond: React.ReactNode;
}

const MappingEditor: React.FC<MappingEditorProps> = ({ definition, value, onChange, keyframeDiamond }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [mode, setMode] = useState<'manual' | 'palette'>('manual');
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);

  // Refs for color picker positioning (one per mapping key)
  const swatchRefs = useRef<Map<string, React.RefObject<HTMLDivElement | null>>>(new Map());
  const getSwatchRef = useCallback((key: string) => {
    if (!swatchRefs.current.has(key)) {
      swatchRefs.current.set(key, createRef<HTMLDivElement>());
    }
    return swatchRefs.current.get(key)!;
  }, []);

  const canvasCells = useCanvasStore((s) => s.cells);
  const palettes = usePaletteStore((s) => s.palettes);
  const customPalettes = usePaletteStore((s) => s.customPalettes);
  const [selectedPaletteId, setSelectedPaletteId] = useState<string | null>(null);
  const [mappingAlgorithm, setMappingAlgorithm] = useState<'closest' | 'by-index'>('closest');

  const mappings = useMemo(() => value ?? {}, [value]);
  const isColorMapping = definition.path === 'colorMappings';

  // Auto-detect colors or characters from canvas
  const detectedValues = useMemo(() => {
    if (isColorMapping) {
      const colors = new Set<string>();
      canvasCells.forEach((cell) => {
        if (cell.color && cell.color !== 'transparent') colors.add(cell.color);
        if (cell.bgColor && cell.bgColor !== 'transparent') colors.add(cell.bgColor);
      });
      return [...colors].sort();
    } else {
      const chars = new Set<string>();
      canvasCells.forEach((cell) => {
        if (cell.char && cell.char.trim() !== '') chars.add(cell.char);
      });
      return [...chars].sort();
    }
  }, [canvasCells, isColorMapping]);

  // Auto-populate identity mappings when canvas values change
  useEffect(() => {
    if (detectedValues.length === 0) return;
    const currentKeys = Object.keys(mappings);
    // Only auto-populate if mappings are empty (first time or canvas changed significantly)
    if (currentKeys.length > 0) return;
    const identityMappings: Record<string, string> = {};
    detectedValues.forEach((val) => {
      identityMappings[val] = val;
    });
    onChange(identityMappings);
  }, [detectedValues]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure all detected values are represented in mappings
  const displayEntries = useMemo(() => {
    const result: [string, string][] = [];
    // Include all detected values (with identity as default)
    for (const val of detectedValues) {
      result.push([val, mappings[val] ?? val]);
    }
    // Include any manually-added mappings not in detected set
    for (const [key, val] of Object.entries(mappings)) {
      if (!detectedValues.includes(key)) {
        result.push([key, val]);
      }
    }
    return result;
  }, [detectedValues, mappings]);

  const updateMapping = useCallback((fromKey: string, toValue: string) => {
    const updated = { ...mappings, [fromKey]: toValue };
    onChange(updated);
  }, [mappings, onChange]);

  const removeMapping = useCallback((fromKey: string) => {
    const updated = { ...mappings };
    delete updated[fromKey];
    onChange(updated);
  }, [mappings, onChange]);

  // Apply palette-based remapping
  const applyPaletteMapping = useCallback(() => {
    if (!selectedPaletteId || !isColorMapping) return;
    const allPalettes = [...palettes, ...customPalettes];
    const palette = allPalettes.find((p) => p.id === selectedPaletteId);
    if (!palette) return;
    const paletteColors = palette.colors.map((c) => c.value);
    const canvasColors = detectedValues;
    const newMappings = mapCanvasColorsToPalette(canvasColors, paletteColors, mappingAlgorithm);
    onChange(newMappings);
  }, [selectedPaletteId, isColorMapping, palettes, customPalettes, detectedValues, mappingAlgorithm, onChange]);

  return (
    <div className="py-0.5">
      {/* Header row */}
      <div className="flex items-center gap-1.5">
        {keyframeDiamond}
        <button
          className="text-[10px] text-muted-foreground hover:text-foreground flex-1 text-left"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {definition.displayName} ({displayEntries.length})
        </button>
      </div>

      {/* Expanded mapping list */}
      {isExpanded && (
        <div className="mt-1 ml-4 space-y-0.5">
          {/* Mode tabs for color mappings */}
          {isColorMapping && (
            <div className="flex gap-1 mb-1">
              <button
                className={`text-[9px] px-2 py-0.5 rounded ${mode === 'manual' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setMode('manual')}
              >
                Manual
              </button>
              <button
                className={`text-[9px] px-2 py-0.5 rounded ${mode === 'palette' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setMode('palette')}
              >
                Palette
              </button>
            </div>
          )}

          {/* Palette mode */}
          {isColorMapping && mode === 'palette' && (
            <div className="space-y-1 mb-1 p-1 rounded border border-border/30 bg-muted/10">
              <Select value={selectedPaletteId ?? ''} onValueChange={setSelectedPaletteId}>
                <SelectTrigger className="h-5 text-[9px]">
                  <SelectValue placeholder="Select palette..." />
                </SelectTrigger>
                <SelectContent>
                  {[...palettes, ...customPalettes].map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[10px]">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Select value={mappingAlgorithm} onValueChange={(v) => setMappingAlgorithm(v as 'closest' | 'by-index')}>
                  <SelectTrigger className="h-5 text-[9px] flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closest" className="text-[10px]">Closest Match</SelectItem>
                    <SelectItem value="by-index" className="text-[10px]">By Index</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[9px] px-2"
                  onClick={applyPaletteMapping}
                  disabled={!selectedPaletteId}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}

          {/* Manual mapping list */}
          {displayEntries.length === 0 && (
            <div className="text-[9px] text-muted-foreground/50 py-1">No values detected on canvas</div>
          )}
          {displayEntries.map(([fromKey, toVal]) => (
            <div key={fromKey} className="flex items-center gap-1 group">
              {isColorMapping ? (
                <>
                  {/* Color swatch: from */}
                  <div
                    className="w-4 h-4 rounded border border-border/50 flex-shrink-0"
                    style={{ backgroundColor: fromKey }}
                    title={fromKey}
                  />
                  <span className="text-[9px] text-muted-foreground">→</span>
                  {/* Color swatch: to (clickable, opens ColorPickerOverlay) */}
                  <div
                    ref={getSwatchRef(fromKey) as React.RefObject<HTMLDivElement>}
                    className="w-4 h-4 rounded border border-border/50 flex-shrink-0 cursor-pointer hover:ring-1 hover:ring-primary"
                    style={{ backgroundColor: toVal }}
                    title={toVal}
                    onClick={() => setPickerOpenFor(pickerOpenFor === fromKey ? null : fromKey)}
                  />
                  <ColorPickerOverlay
                    isOpen={pickerOpenFor === fromKey}
                    onOpenChange={(open) => { if (!open) setPickerOpenFor(null); }}
                    onColorSelect={(color) => { updateMapping(fromKey, color); setPickerOpenFor(null); }}
                    onColorChange={(color) => updateMapping(fromKey, color)}
                    initialColor={/^#[0-9a-fA-F]{6}$/.test(toVal) ? toVal : '#000000'}
                    triggerRef={getSwatchRef(fromKey) as React.RefObject<HTMLElement | null>}
                    anchorPosition="bottom-left"
                  />
                  {/* Hex input for to color */}
                  <input
                    type="text"
                    value={toVal}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === '') {
                        updateMapping(fromKey, v);
                      }
                    }}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
                        updateMapping(fromKey, fromKey);
                      }
                    }}
                    className="h-4 w-16 text-[9px] px-1 rounded border border-border/50 bg-background text-foreground outline-none"
                  />
                </>
              ) : (
                <>
                  {/* Character: from */}
                  <div className="w-5 h-5 rounded border border-border/50 flex items-center justify-center text-[10px] flex-shrink-0 bg-muted/30">
                    {fromKey === ' ' ? '␣' : fromKey}
                  </div>
                  <span className="text-[9px] text-muted-foreground">→</span>
                  {/* Character: to (clickable, opens character picker) */}
                  <div
                    ref={getSwatchRef(fromKey) as React.RefObject<HTMLDivElement>}
                    className="w-5 h-5 rounded border border-border/50 flex items-center justify-center text-[10px] flex-shrink-0 bg-background cursor-pointer hover:ring-1 hover:ring-primary"
                    onClick={() => setPickerOpenFor(pickerOpenFor === fromKey ? null : fromKey)}
                  >
                    {toVal === ' ' ? '␣' : toVal}
                  </div>
                  <EnhancedCharacterPicker
                    isOpen={pickerOpenFor === fromKey}
                    onClose={() => setPickerOpenFor(null)}
                    onSelectCharacter={(char) => { updateMapping(fromKey, char); setPickerOpenFor(null); }}
                    triggerRef={getSwatchRef(fromKey) as React.RefObject<HTMLElement | null>}
                    anchorPosition="left-bottom"
                    initialValue={toVal}
                    title="Map to character"
                  />
                </>
              )}
              {/* Reset button */}
              <button
                className="p-0.5 text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => fromKey !== toVal ? updateMapping(fromKey, fromKey) : removeMapping(fromKey)}
                title={fromKey !== toVal ? 'Reset to original' : 'Remove mapping'}
              >
                {fromKey !== toVal ? <RotateCcw className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN PANEL COMPONENT
// ============================================

export const EffectPropertiesPanel: React.FC = () => {
  const selectedEffectBlockId = useTimelineStore((s) => s.view.selectedEffectBlockId);
  const selectEffectBlock = useTimelineStore((s) => s.selectEffectBlock);
  const updateEffectBlockSettings = useTimelineStore((s) => s.updateEffectBlockSettings);
  const updateEffectKeyframe = useTimelineStore((s) => s.updateEffectKeyframe);
  const addEffectKeyframe = useTimelineStore((s) => s.addEffectKeyframe);
  const addEffectPropertyTrack = useTimelineStore((s) => s.addEffectPropertyTrack);
  const toggleEffectBlockEnabled = useTimelineStore((s) => s.toggleEffectBlockEnabled);
  const removeEffectBlock = useTimelineStore((s) => s.removeEffectBlock);
  const { recordRemove: recordEffectRemove, recordUpdate: recordEffectUpdate } = useEffectBlockHistory();
  const pushToHistory = useToolStore((s) => s.pushToHistory);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);

  // Re-read layers/groups/globalEffects to react to changes
  useTimelineStore((s) => s.layers);
  useTimelineStore((s) => s.layerGroups);
  useTimelineStore((s) => s.globalEffects);

  if (!selectedEffectBlockId) return null;

  const found = findTrackByBlockId(selectedEffectBlockId as string);
  if (!found) return null;

  const { track, ownerId } = found;
  const block = track.effectBlock;
  const entry = getEffect(block.effectType);
  if (!entry) return null;

  // Evaluate current settings at this frame (resolves keyframed values)
  const resolvedSettings = evaluateEffectBlock(block, currentFrame);
  const Icon = entry.icon;

  // Group properties by category
  const categories = new Map<string, EffectPropertyDefinition[]>();
  for (const def of entry.propertyDefinitions) {
    const cat = def.category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(def);
  }

  return (
    <div className="w-56 flex-shrink-0 border-l border-border/50 bg-muted/10 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/50 bg-muted/20">
        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-[11px] font-medium truncate flex-1">{entry.name}</span>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-0.5 hover:bg-muted rounded"
                onClick={() => {
                  const beforeBlock = structuredClone(block);
                  toggleEffectBlockEnabled(block.id);
                  recordEffectUpdate(block.id, beforeBlock);
                }}
              >
                {block.enabled
                  ? <Eye className="w-3 h-3 text-muted-foreground" />
                  : <EyeOff className="w-3 h-3 text-muted-foreground/50" />
                }
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">{block.enabled ? 'Disable' : 'Enable'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <button
          className="p-0.5 hover:bg-muted rounded"
          onClick={() => selectEffectBlock(null)}
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Properties by category */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {[...categories.entries()].map(([category, defs]) => (
          <div key={category} className="mb-2">
            <div className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-0.5">
              {category}
            </div>
            {defs.map((def) => {
              // Check if a keyframe track + keyframe exists at current frame
              const propTrack = block.propertyTracks.find((pt) => pt.propertyPath === def.path);
              const kfAtFrame = propTrack?.keyframes.find((kf) => kf.frame === currentFrame);
              return (
              <EffectPropertyRow
                key={def.path}
                definition={def}
                value={resolvedSettings[def.path]}
                onChange={(newValue) => {
                  if (kfAtFrame && propTrack) {
                    // Update the existing keyframe value directly
                    const previousKf = structuredClone(kfAtFrame);
                    updateEffectKeyframe(
                      block.id,
                      propTrack.id,
                      kfAtFrame.id as import('../../../types/timeline').KeyframeId,
                      { value: newValue as import('../../../types/effectBlock').EffectKeyframe['value'] },
                    );
                    pushToHistory({
                      type: 'effect_keyframe_update', timestamp: Date.now(), description: `Update ${def.displayName}`,
                      data: { ownerId: null, ownerType: 'layer', blockId: block.id as string, trackId: propTrack.id as string,
                        keyframeId: kfAtFrame.id as string, previousKeyframe: previousKf,
                        newKeyframe: { ...previousKf, value: newValue } },
                    } as import('../../../types').EffectKeyframeUpdateHistoryAction);
                  } else if (propTrack) {
                    // Property is keyframed but no keyframe at playhead — auto-key: create one
                    const kfId = addEffectKeyframe(
                      block.id,
                      propTrack.id,
                      currentFrame,
                      newValue as import('../../../types/effectBlock').EffectKeyframe['value'],
                    );
                    pushToHistory({
                      type: 'effect_keyframe_add', timestamp: Date.now(), description: `Auto-key ${def.displayName}`,
                      data: { ownerId: null, ownerType: 'layer', blockId: block.id as string, trackId: propTrack.id as string,
                        keyframe: { id: kfId, frame: currentFrame, value: newValue, easing: { type: 'linear' as const } } },
                    } as import('../../../types').EffectKeyframeAddHistoryAction);
                  } else {
                    // No property track at all (static property) — update block settings with undo
                    const beforeBlock = structuredClone(block);
                    updateEffectBlockSettings(block.id, { [def.path]: newValue });
                    recordEffectUpdate(block.id, beforeBlock);
                  }
                }}
                block={block}
                currentFrame={currentFrame}
              />
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div className="px-2 py-1.5 border-t border-border/50 space-y-1">
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-6 text-[10px]"
            onClick={() => {
              // Snapshot all affected layers' content frames + the effect track for undo
              const tl = useTimelineStore.getState();
              const ownerIdTyped = ownerId as import('../../../types/timeline').LayerId | import('../../../types/timeline').LayerGroupId | null;

              // Determine affected layer IDs
              let affectedLayerIds: string[] = [];
              if (ownerId) {
                const layer = tl.layers.find((l) => l.id === ownerIdTyped);
                if (layer) {
                  affectedLayerIds = [layer.id as string];
                } else {
                  const group = tl.layerGroups.find((g) => g.id === ownerIdTyped);
                  if (group) affectedLayerIds = group.childLayerIds.map((id) => id as string);
                }
              } else {
                affectedLayerIds = tl.layers.map((l) => l.id as string);
              }

              // Snapshot full content frames per layer before bake
              // For the active layer, use canvasStore.cells for the current content frame
              // (it may have unsaved drawing changes)
              const activeLayerId = tl.view.activeLayerId;
              const canvasCellsNow = useCanvasStore.getState().cells;

              const layerSnapshots = affectedLayerIds.map((layerId) => {
                const layer = tl.layers.find((l) => (l.id as string) === layerId);
                if (!layer) return null;
                return {
                  layerId,
                  contentFrames: layer.contentFrames.map((cf) => {
                    // For the active layer's current frame, use canvas store cells
                    const isActiveFrame = (layer.id as string) === (activeLayerId as string) &&
                      currentFrame >= cf.startFrame && currentFrame < cf.startFrame + cf.durationFrames;
                    const sourceData = isActiveFrame ? canvasCellsNow : cf.data;
                    // Deep clone: new Map + new Cell objects for each entry
                    const clonedData = new Map<string, import('../../../types').Cell>();
                    sourceData.forEach((cell, key) => {
                      clonedData.set(key, { ...cell });
                    });
                    return {
                      ...cf,
                      data: clonedData,
                    };
                  }),
                };
              }).filter(Boolean) as Array<{ layerId: string; contentFrames: import('../../../types/timeline').ContentFrame[] }>;

              // Find the track before removal
              let trackSnapshot: import('../../../types/effectBlock').EffectTrack | undefined;
              let trackIndex = 0;
              for (const l of tl.layers) {
                const idx = (l.effectTracks ?? []).findIndex((t) => t.effectBlock.id === block.id);
                if (idx !== -1) { trackSnapshot = structuredClone(l.effectTracks[idx]); trackIndex = idx; break; }
              }
              if (!trackSnapshot) {
                for (const g of tl.layerGroups) {
                  const idx = (g.effectTracks ?? []).findIndex((t) => t.effectBlock.id === block.id);
                  if (idx !== -1) { trackSnapshot = structuredClone(g.effectTracks[idx]); trackIndex = idx; break; }
                }
              }
              if (!trackSnapshot) {
                const idx = tl.globalEffects.findIndex((t) => t.effectBlock.id === block.id);
                if (idx !== -1) { trackSnapshot = structuredClone(tl.globalEffects[idx]); trackIndex = idx; }
              }

              // Bake the effect
              tl.bakeEffect(block.id);
              selectEffectBlock(null);

              // Record undo history
              if (trackSnapshot) {
                pushToHistory({
                  type: 'effect_bake',
                  timestamp: Date.now(),
                  description: `Apply ${entry.name} effect`,
                  data: {
                    ownerId: (ownerId ?? null) as string | null,
                    ownerType: ownerId === null ? 'global' : 'layer',
                    trackSnapshot,
                    trackIndex,
                    layerSnapshots,
                  },
                } as import('../../../types').EffectBakeHistoryAction);
              }
            }}
          >
            <Check className="w-3 h-3 mr-1" />
            Apply
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-6 text-[10px]"
            onClick={() => {
              const beforeBlock = structuredClone(block);
              const staticResets: Record<string, unknown> = {};

              for (const def of entry.propertyDefinitions) {
                const propTrack = block.propertyTracks.find((pt) => pt.propertyPath === def.path);
                if (propTrack) {
                  // Keyframed property: add/update a keyframe at playhead with default value
                  const existingKf = propTrack.keyframes.find((kf) => kf.frame === currentFrame);
                  if (existingKf) {
                    updateEffectKeyframe(block.id, propTrack.id, existingKf.id, { value: def.defaultValue as number });
                  } else {
                    addEffectKeyframe(block.id, propTrack.id, currentFrame, def.defaultValue as number);
                  }
                } else {
                  // Static property: collect for batch reset
                  staticResets[def.path] = def.defaultValue;
                }
              }

              if (Object.keys(staticResets).length > 0) {
                updateEffectBlockSettings(block.id, staticResets);
              }

              recordEffectUpdate(block.id, beforeBlock);
            }}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full h-6 text-[10px]"
          onClick={() => {
            recordEffectRemove(
              ownerId as import('../../../types/timeline').LayerId | import('../../../types/timeline').LayerGroupId | null,
              block.id,
            );
            removeEffectBlock(
              ownerId as import('../../../types/timeline').LayerId | import('../../../types/timeline').LayerGroupId | null,
              block.id,
            );
            selectEffectBlock(null);
          }}
        >
          <Trash2 className="w-3 h-3 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  );
};
