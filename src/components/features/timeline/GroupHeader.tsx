/**
 * GroupHeader — collapsible header row for a layer group in the layer list.
 *
 * Renders above its child layers. Clicking the chevron collapses/expands
 * the group. Visibility/solo/lock toggles cascade to all child layers.
 *
 * Part of the Layer Timeline Refactor (Phase 7)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { cn } from '@/lib/utils';
import {
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  FolderOpen,
  Folder,
  Trash2,
  Diamond,
  X,
  Plus,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { EffectTrackRow } from './EffectTrackRow';
import { useEffectBlockHistory } from '../../../hooks/useEffectBlockHistory';
import { getAllEffects } from '../../../registry/effectRegistry';
import { getGroupPropertyValue } from '../../../utils/layerCompositing';
import { PROPERTY_DEFINITIONS, PROPERTY_DISPLAY_ORDER, generateKeyframeId } from '../../../types/timeline';
import { defaultEasing } from '../../../types/easing';
import type { LayerGroup } from '../../../types/timeline';

interface GroupHeaderProps {
  group: LayerGroup;
  isSelected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  isDragOver?: boolean;
  dragOverPosition?: 'above' | 'into' | null;
}

export const GroupHeader: React.FC<GroupHeaderProps> = React.memo(function GroupHeader({
  group,
  isSelected,
  onSelect,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
  dragOverPosition,
}) {
  const toggleGroupCollapsed = useTimelineStore((s) => s.toggleGroupCollapsed);
  const layers = useTimelineStore((s) => s.layers);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const goToFrame = useTimelineStore((s) => s.goToFrame);
  const selectKeyframes = useTimelineStore((s) => s.selectKeyframes);
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const setLayerVisible = useTimelineStore((s) => s.setLayerVisible);
  const setLayerLocked = useTimelineStore((s) => s.setLayerLocked);
  const ungroupLayers = useTimelineStore((s) => s.ungroupLayers);
  const expandedEffectTrackIds = useTimelineStore((s) => s.view.expandedEffectTrackIds);
  const addEffectBlock = useTimelineStore((s) => s.addEffectBlock);
  const { recordAdd: recordEffectAdd } = useEffectBlockHistory();

  // Groups show property tracks when not collapsed (unlike layers which use expandedLayerIds)
  const isExpanded = !group.collapsed;

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleNameCommit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== group.name) {
      // Update group name in store
      useTimelineStore.setState((state) => ({
        layerGroups: state.layerGroups.map((g) =>
          g.id === group.id ? { ...g, name: trimmed } : g
        ),
      }));
    }
    setIsEditing(false);
  }, [editName, group.id, group.name]);

  // Check if all children are visible / locked
  const childLayers = layers.filter((l) => group.childLayerIds.includes(l.id));
  const allVisible = childLayers.every((l) => l.visible);
  const allLocked = childLayers.every((l) => l.locked);

  const handleToggleVisibility = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newVisible = !allVisible;
    for (const id of group.childLayerIds) {
      setLayerVisible(id, newVisible);
    }
  }, [allVisible, group.childLayerIds, setLayerVisible]);

  const handleToggleLocked = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newLocked = !allLocked;
    for (const id of group.childLayerIds) {
      setLayerLocked(id, newLocked);
    }
  }, [allLocked, group.childLayerIds, setLayerLocked]);

  return (
    <div
      className={cn(
        'border-b border-border/50 select-none bg-muted/40 group',
        isSelected && 'bg-accent/40',
        isDragOver && dragOverPosition === 'above' && 'border-t-2 border-t-primary',
        isDragOver && dragOverPosition === 'into' && 'bg-primary/20',
      )}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.(e);
      }}
      onDrop={() => onDrop?.()}
      onDragEnd={() => onDragEnd?.()}
    >
      <TooltipProvider>
        <div className="flex items-center gap-0.5 px-1 py-1 min-h-[28px]">
          {/* Collapse/expand */}
          <button
            className="p-0.5 hover:bg-muted rounded"
            onClick={(e) => {
              e.stopPropagation();
              toggleGroupCollapsed(group.id);
            }}
          >
            <ChevronRight
              className={cn(
                'w-3 h-3 transition-transform text-muted-foreground',
                !group.collapsed && 'rotate-90',
              )}
            />
          </button>

          {/* Folder icon */}
          {group.collapsed ? (
            <Folder className="w-3.5 h-3.5 text-yellow-500/70 flex-shrink-0" />
          ) : (
            <FolderOpen className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
          )}

          {/* Visibility */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-0.5 hover:bg-muted rounded"
                onClick={handleToggleVisibility}
              >
                {allVisible ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3 text-muted-foreground/50" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {allVisible ? 'Hide all layers in group' : 'Show all layers in group'}
            </TooltipContent>
          </Tooltip>

          {/* Lock */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-0.5 hover:bg-muted rounded"
                onClick={handleToggleLocked}
              >
                {allLocked ? (
                  <Lock className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <Unlock className="w-3 h-3 text-muted-foreground/50" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {allLocked ? 'Unlock all layers in group' : 'Lock all layers in group'}
            </TooltipContent>
          </Tooltip>

          {/* Group name */}
          {isEditing ? (
            <input
              ref={inputRef}
              className="flex-1 min-w-0 bg-input text-xs px-1 py-0.5 rounded border border-border outline-none"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameCommit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameCommit();
                else if (e.key === 'Escape') setIsEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="flex-1 min-w-0 truncate text-xs font-medium text-foreground/80 cursor-default"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditName(group.name);
                setIsEditing(true);
              }}
            >
              {group.name}
            </span>
          )}

          {/* Child count badge */}
          <span className="text-[10px] text-muted-foreground/60 px-1">
            {group.childLayerIds.length}
          </span>

          {/* Ungroup */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-0.5 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  ungroupLayers(group.id);
                }}
              >
                <Trash2 className="w-3 h-3 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Ungroup</TooltipContent>
          </Tooltip>
        </div>

      {/* Expanded: group property track labels */}
      {isExpanded && group.propertyTracks.length > 0 && (
        <div className="ml-5 border-t border-border/30">
          {[...group.propertyTracks]
            .sort((a, b) => {
              const idxA = PROPERTY_DISPLAY_ORDER.indexOf(a.propertyPath);
              const idxB = PROPERTY_DISPLAY_ORDER.indexOf(b.propertyPath);
              return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
            })
            .map((track) => {
              const def = PROPERTY_DEFINITIONS[track.propertyPath];
              const currentValue = getGroupPropertyValue(group, track.propertyPath, currentFrame);
              const existingKf = track.keyframes.find((kf) => kf.frame === currentFrame);
              return (
                <div
                  key={track.id}
                  className="flex items-center px-1.5 py-0.5 min-h-[24px] text-xs text-muted-foreground group/track"
                >
                  <span
                    className="flex-1 truncate cursor-pointer hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      const kfIds = track.keyframes.map((kf) => kf.id);
                      if (kfIds.length === 0) return;
                      selectKeyframes(kfIds);
                      setEditingKeyframe(kfIds[kfIds.length - 1]);
                    }}
                  >
                    {def?.displayName ?? track.propertyPath.split('.').pop()}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="p-0.5 hover:bg-muted rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          const prev = [...track.keyframes]
                            .map((kf) => kf.frame)
                            .filter((f) => f < currentFrame)
                            .sort((a, b) => b - a)[0];
                          if (prev !== undefined) goToFrame(prev);
                        }}
                        disabled={!track.keyframes.some((kf) => kf.frame < currentFrame)}
                      >
                        <ChevronLeft className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Previous keyframe</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="p-0.5 hover:bg-muted rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (existingKf) {
                            // Remove keyframe
                            useTimelineStore.setState((s) => ({
                              layerGroups: s.layerGroups.map(g => g.id !== group.id ? g : {
                                ...g, propertyTracks: g.propertyTracks.map(t => t.id !== track.id ? t : {
                                  ...t, keyframes: t.keyframes.filter(kf => kf.id !== existingKf.id),
                                }),
                              }),
                            }));
                          } else {
                            // Add keyframe at current frame
                            const kfId = generateKeyframeId();
                            useTimelineStore.setState((s) => ({
                              layerGroups: s.layerGroups.map(g => g.id !== group.id ? g : {
                                ...g, propertyTracks: g.propertyTracks.map(t => t.id !== track.id ? t : {
                                  ...t, keyframes: [...t.keyframes, { id: kfId, frame: currentFrame, value: currentValue, easing: defaultEasing() }].sort((a: { frame: number }, b: { frame: number }) => a.frame - b.frame),
                                }),
                              }),
                            }));
                            selectKeyframes([kfId]);
                            setEditingKeyframe(kfId);
                          }
                        }}
                      >
                        {existingKf ? (
                          <Diamond className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        ) : (
                          <Diamond className="w-3 h-3 text-yellow-500" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {existingKf ? 'Keyframe at current frame' : 'No keyframe at current frame'}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="p-0.5 hover:bg-muted rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = [...track.keyframes]
                            .map((kf) => kf.frame)
                            .filter((f) => f > currentFrame)
                            .sort((a, b) => a - b)[0];
                          if (next !== undefined) goToFrame(next);
                        }}
                        disabled={!track.keyframes.some((kf) => kf.frame > currentFrame)}
                      >
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Next keyframe</TooltipContent>
                  </Tooltip>
                  <button
                    className="p-0.5 hover:bg-muted rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      useTimelineStore.setState((s) => ({
                        layerGroups: s.layerGroups.map(g => g.id !== group.id ? g : {
                          ...g, propertyTracks: g.propertyTracks.filter(t => t.id !== track.id),
                        }),
                      }));
                    }}
                  >
                    <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* Effect track rows + Add Effect (when expanded) */}
      {isExpanded && (
        <div className="ml-5">
          {(group.effectTracks ?? []).map((track, idx) => (
            <React.Fragment key={track.id}>
              <EffectTrackRow
                track={track}
                isExpanded={expandedEffectTrackIds.has(track.effectBlock.id)}
                index={idx}
              />
              {expandedEffectTrackIds.has(track.effectBlock.id) && track.effectBlock.propertyTracks.map((pt) => (
                <div
                  key={pt.id}
                  className="flex items-center pl-6 pr-1.5 min-h-[20px] border-b border-border/20 text-[9px] text-muted-foreground/60"
                >
                  {pt.propertyPath}
                </div>
              ))}
            </React.Fragment>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1 px-1.5 py-0.5 min-h-[24px] text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <Plus className="w-3 h-3" />
                Add Effect
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[160px]">
              {getAllEffects().map((effect) => (
                <DropdownMenuItem
                  key={effect.type}
                  onClick={() => {
                    const start = currentFrame;
                    const duration = Math.max(1, useTimelineStore.getState().config.durationFrames - start);
                    const blockId = addEffectBlock(group.id, effect.type, start, duration);
                    if (blockId) recordEffectAdd(group.id, blockId);
                  }}
                >
                  <effect.icon className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                  {effect.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      </TooltipProvider>
    </div>
  );
});
