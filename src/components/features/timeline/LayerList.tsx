/**
 * Layer List — left panel showing all layers with controls.
 * 
 * Shows layers in visual z-order (topmost layer first).
 * Supports drag-and-drop reordering via native HTML5 drag API.
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.3
 */

import React, { useCallback, useRef, useState } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useToolStore } from '../../../stores/toolStore';
import { useTimelineHistory } from '../../../hooks/useTimelineHistory';
import { useLayerLimit } from '../../../hooks/useLayerLimit';
import { LayerListItem } from './LayerListItem';
import { GroupHeader } from './GroupHeader';
import { GlobalEffectsTrackHeader } from './GlobalEffectsTrackHeader';
import { LayerContextMenu, type LayerContextMenuState } from './LayerContextMenu';
import { LayerMenu } from './LayerMenu';
import { cn } from '@/lib/utils';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { Plus } from 'lucide-react';
import type { LayerId } from '../../../types/timeline';

interface LayerListProps {
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export const LayerList: React.FC<LayerListProps> = ({ scrollRef }) => {
  const layers = useTimelineStore((s) => s.layers);
  const layerGroups = useTimelineStore((s) => s.layerGroups);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const selectedLayerIds = useTimelineStore((s) => s.view.selectedLayerIds);
  const setActiveLayer = useTimelineStore((s) => s.setActiveLayer);
  const selectLayers = useTimelineStore((s) => s.selectLayers);
  const toggleLayerSelected = useTimelineStore((s) => s.toggleLayerSelected);
  const clearLayerSelection = useTimelineStore((s) => s.clearLayerSelection);
  const reorderLayers = useTimelineStore((s) => s.reorderLayers);
  const setShowLayerProperties = useTimelineStore((s) => s.setShowLayerProperties);
  const setActiveGroup = useTimelineStore((s) => s.setActiveGroup);
  const activeGroupId = useTimelineStore((s) => s.view.activeGroupId);
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const { canAddLayer } = useLayerLimit();
  const { addLayer } = useTimelineHistory();

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'into' | null>(null);
  const [contextMenu, setContextMenu] = useState<LayerContextMenuState | null>(null);
  const [renamingLayerId, setRenamingLayerId] = useState<LayerId | null>(null);
  const dragSourceIndex = useRef<number | null>(null);
  const dragSourceGroupId = useRef<import('../../../types/timeline').LayerGroupId | null>(null);

  // Display reversed: top of list = top of z-order = last in array
  const displayLayers = [...layers].reverse();

  // Handle layer click with multi-select support
  const handleLayerClick = useCallback((layerId: LayerId, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: toggle this layer in/out of selection
      toggleLayerSelected(layerId);
      setActiveLayer(layerId);
    } else if (e.shiftKey && activeLayerId) {
      // Shift+click: range select from active to clicked
      const activeDisplayIdx = displayLayers.findIndex(l => l.id === activeLayerId);
      const clickedDisplayIdx = displayLayers.findIndex(l => l.id === layerId);
      if (activeDisplayIdx !== -1 && clickedDisplayIdx !== -1) {
        const start = Math.min(activeDisplayIdx, clickedDisplayIdx);
        const end = Math.max(activeDisplayIdx, clickedDisplayIdx);
        const rangeIds = displayLayers.slice(start, end + 1).map(l => l.id);
        selectLayers(rangeIds);
      }
    } else {
      // Plain click: select only this layer, deselect any group
      clearLayerSelection();
      setActiveGroup(null);
      setActiveLayer(layerId);
      setShowLayerProperties(true);
      setEditingKeyframe(null); // Dismiss keyframe editor so layer panel shows
    }
  }, [activeLayerId, displayLayers, setActiveLayer, selectLayers, toggleLayerSelected, clearLayerSelection, setShowLayerProperties, setActiveGroup, setEditingKeyframe]);

  const handleDragStart = useCallback((displayIndex: number, groupId?: import('../../../types/timeline').LayerGroupId) => {
    dragSourceIndex.current = displayIndex;
    dragSourceGroupId.current = groupId ?? null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, displayIndex: number) => {
    e.preventDefault();
    setDragOverIndex(displayIndex);
    setDragOverPosition(null); // Regular layer items — no top/bottom split
  }, []);

  const handleDrop = useCallback(
    (displayIndex: number) => {
      if (dragSourceIndex.current === null || dragSourceIndex.current === displayIndex) {
        setDragOverIndex(null);
        dragSourceIndex.current = null;
        dragSourceGroupId.current = null;
        return;
      }

      // ── GROUP DRAG ──
      if (dragSourceGroupId.current) {
        const groupId = dragSourceGroupId.current;
        const tl = useTimelineStore.getState();
        const group = tl.layerGroups.find(g => g.id === groupId);
        if (!group) {
          setDragOverIndex(null);
          setDragOverPosition(null);
          dragSourceIndex.current = null;
          dragSourceGroupId.current = null;
          return;
        }

        // Snapshot for undo
        const prevLayers = layers.map(l => ({ ...l }));
        const prevGroups = tl.layerGroups.map(g => ({ ...g, childLayerIds: [...g.childLayerIds] }));

        // Determine target position in store order
        // displayIndex >= displayLayers.length means bottom drop zone → store index 0
        // displayIndex 0 means top of visual list → store index layers.length - 1 (top of z-order)
        const targetStoreIndex = displayIndex >= displayLayers.length
          ? 0
          : layers.length - 1 - displayIndex;

        const targetLayer = targetStoreIndex >= 0 && targetStoreIndex < layers.length ? layers[targetStoreIndex] : null;
        const childIds = new Set(group.childLayerIds.map(id => id as string));

        // Don't drop a group onto itself — but allow dropping at position 0 (top)
        // even if that position happens to be occupied by one of the group's children
        if (targetLayer && childIds.has(targetLayer.id as string) && displayIndex !== 0 && displayIndex < displayLayers.length) {
          setDragOverIndex(null);
          setDragOverPosition(null);
          dragSourceIndex.current = null;
          dragSourceGroupId.current = null;
          return;
        }

        // Remove all group children from the layers array, then re-insert them
        const childLayers = layers.filter(l => childIds.has(l.id as string));
        const otherLayers = layers.filter(l => !childIds.has(l.id as string));

        // Find insertion point in the filtered (non-child) array
        let insertIdx: number;
        if (displayIndex >= displayLayers.length) {
          // Bottom drop zone → insert at store index 0 (bottom of z-order)
          insertIdx = 0;
        } else if (displayIndex === 0) {
          // Top of list → insert at the end (top of z-order)
          insertIdx = otherLayers.length;
        } else if (targetLayer && !childIds.has(targetLayer.id as string)) {
          const targetInOthers = otherLayers.indexOf(targetLayer);
          insertIdx = targetInOthers !== -1 ? targetInOthers : otherLayers.length;
        } else {
          insertIdx = Math.min(Math.max(0, targetStoreIndex), otherLayers.length);
        }

        const newLayers = [
          ...otherLayers.slice(0, insertIdx),
          ...childLayers,
          ...otherLayers.slice(insertIdx),
        ];

        useTimelineStore.setState({ layers: newLayers });

        // Record history
        const historyAction: import('../../../types').LayerReorderHistoryAction = {
          type: 'layer_reorder',
          timestamp: Date.now(),
          description: `Reorder group "${group.name}"`,
          data: {
            fromIndex: 0,
            toIndex: 0,
            previousLayers: prevLayers,
            previousGroups: prevGroups,
            newLayers: newLayers.map(l => ({ ...l })),
            newGroups: tl.layerGroups.map(g => ({ ...g, childLayerIds: [...g.childLayerIds] })),
          }
        };
        useToolStore.getState().pushToHistory(historyAction);

        setDragOverIndex(null);
        setDragOverPosition(null);
        dragSourceIndex.current = null;
        dragSourceGroupId.current = null;
        return;
      }

      // ── SINGLE LAYER DRAG ──
      const fromStoreIndex = layers.length - 1 - dragSourceIndex.current;
      const toStoreIndex = displayIndex >= displayLayers.length
        ? 0
        : layers.length - 1 - displayIndex;

      if (fromStoreIndex === toStoreIndex) {
        setDragOverIndex(null);
        dragSourceIndex.current = null;
        dragSourceGroupId.current = null;
        return;
      }

      const draggedLayer = layers[fromStoreIndex];
      const targetLayer = toStoreIndex >= 0 && toStoreIndex < layers.length ? layers[toStoreIndex] : null;

      // Snapshot for undo
      const prevLayers = layers.map(l => ({ ...l }));
      const prevGroups = useTimelineStore.getState().layerGroups.map(g => ({
        ...g,
        childLayerIds: [...g.childLayerIds],
      }));

      // Perform reorder
      reorderLayers(fromStoreIndex, Math.max(0, toStoreIndex));

      // Handle group membership changes
      if (draggedLayer) {
        const tl = useTimelineStore.getState();
        const targetGroup = targetLayer?.parentGroupId
          ? tl.layerGroups.find(g => g.id === targetLayer.parentGroupId)
          : null;
        const sourceGroup = draggedLayer.parentGroupId
          ? tl.layerGroups.find(g => g.id === draggedLayer.parentGroupId)
          : null;

        // Determine if the drop should add the layer to a group.
        // Rules:
        // 1. Drop on group header bottom half → join group
        // 2. Drop on group header top half → ABOVE group (don't join)
        // 3. Drop between two group members → join group
        // 4. Drop below last group member → outside group (don't join)
        let shouldJoinGroup = false;
        if (targetGroup && (!sourceGroup || sourceGroup.id !== targetGroup.id)) {
          const targetDisplayIdx = displayIndex;
          const groupChildIds = new Set(targetGroup.childLayerIds.map(id => id as string));

          // Check if this is a group header drop (first child's displayIndex with dragOverPosition set)
          const firstChildDisplayIdx = displayLayers.findIndex(l => groupChildIds.has(l.id as string));
          const isGroupHeaderDrop = targetDisplayIdx === firstChildDisplayIdx && dragOverPosition !== null;

          if (isGroupHeaderDrop) {
            // Group header: only join if dropped on bottom half ("into")
            shouldJoinGroup = dragOverPosition === 'into';
          } else {
            // Regular member: join if there are more members below (between members)
            const nextDisplayIdx = targetDisplayIdx + 1;
            if (nextDisplayIdx < displayLayers.length) {
              const nextLayer = displayLayers[nextDisplayIdx];
              if (groupChildIds.has(nextLayer.id as string)) {
                shouldJoinGroup = true; // Dropping between group members
              }
            }
          }
        }

        if (shouldJoinGroup && targetGroup) {
          // Add to target group
          useTimelineStore.setState((state) => ({
            layers: state.layers.map(l =>
              l.id === draggedLayer.id ? { ...l, parentGroupId: targetGroup.id } : l
            ),
            layerGroups: state.layerGroups.map(g =>
              g.id === targetGroup.id && !g.childLayerIds.includes(draggedLayer.id)
                ? { ...g, childLayerIds: [...g.childLayerIds, draggedLayer.id] }
                : g
            ),
          }));
        }

        // Remove from source group if leaving it (and not joining same group)
        if (sourceGroup && (!shouldJoinGroup || !targetGroup || targetGroup.id !== sourceGroup.id)) {
          useTimelineStore.setState((state) => ({
            layers: state.layers.map(l =>
              l.id === draggedLayer.id && !shouldJoinGroup ? { ...l, parentGroupId: undefined } : l
            ),
            layerGroups: state.layerGroups.map(g => {
              if (g.id === sourceGroup.id) {
                const remaining = g.childLayerIds.filter(id => id !== draggedLayer.id);
                if (remaining.length < 2) return { ...g, childLayerIds: [] };
                return { ...g, childLayerIds: remaining };
              }
              return g;
            }).filter(g => g.childLayerIds.length >= 2),
          }));
          // Clean up orphaned parentGroupIds
          const updatedGroups = useTimelineStore.getState().layerGroups;
          const groupIds = new Set(updatedGroups.map(g => g.id));
          useTimelineStore.setState((state) => ({
            layers: state.layers.map(l =>
              l.parentGroupId && !groupIds.has(l.parentGroupId)
                ? { ...l, parentGroupId: undefined }
                : l
            ),
          }));
        }

        // Record history with full snapshot for undo (covers reorder + group changes)
        const newLayers = useTimelineStore.getState().layers;
        const newGroups = useTimelineStore.getState().layerGroups;
        const historyAction: import('../../../types').LayerReorderHistoryAction = {
          type: 'layer_reorder',
          timestamp: Date.now(),
          description: `Reorder layer "${draggedLayer.name}"`,
          data: {
            fromIndex: fromStoreIndex,
            toIndex: Math.max(0, toStoreIndex),
            // Snapshot for full restore (group membership etc.)
            previousLayers: prevLayers,
            previousGroups: prevGroups,
            newLayers: newLayers.map(l => ({ ...l })),
            newGroups: newGroups.map(g => ({ ...g, childLayerIds: [...g.childLayerIds] })),
          }
        };
        useToolStore.getState().pushToHistory(historyAction);
      }

      setDragOverIndex(null);
      dragSourceIndex.current = null;
      dragSourceGroupId.current = null;
    },
    [layers, displayLayers, reorderLayers, dragOverPosition],
  );

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null);
    setDragOverPosition(null);
    dragSourceIndex.current = null;
    dragSourceGroupId.current = null;
  }, []);

  return (
    <div className="w-52 flex-shrink-0 border-r border-border/50 flex flex-col bg-muted/20">
      {/* Spacer to align with TimelineRuler (h-6 = 24px) */}
      <div className="h-6 flex-shrink-0 border-b border-border/50 bg-muted/30" />
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
      >
      {/* Build display list with group headers interleaved */}
      {(() => {
        const renderedGroupIds = new Set<string>();
        const items: React.ReactNode[] = [];

        // Global effects track at top (always visible for adding effects)
        items.push(
          <GlobalEffectsTrackHeader key="global-effects" />
        );

        displayLayers.forEach((layer, displayIndex) => {
          // Check if this layer belongs to a group
          const group = layer.parentGroupId
            ? layerGroups.find(g => g.id === layer.parentGroupId)
            : null;

          // If part of a group and we haven't rendered the header yet, render it
          if (group && !renderedGroupIds.has(group.id as string)) {
            renderedGroupIds.add(group.id as string);
            // Find the display index of the first child for drag purposes
            const groupDisplayIndex = displayIndex;
            items.push(
              <GroupHeader
                key={`group-${group.id}`}
                group={group}
                isSelected={activeGroupId === group.id}
                onSelect={() => {
                  setActiveGroup(group.id);
                  clearLayerSelection();
                  setEditingKeyframe(null);
                }}
                isDragOver={dragOverIndex === groupDisplayIndex}
                dragOverPosition={dragOverIndex === groupDisplayIndex ? dragOverPosition : null}
                onDragStart={() => handleDragStart(groupDisplayIndex, group.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverIndex(groupDisplayIndex);
                  // Detect top/bottom half of the group header
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const isTopHalf = y < rect.height / 2;
                  setDragOverPosition(isTopHalf ? 'above' : 'into');
                }}
                onDrop={() => handleDrop(groupDisplayIndex)}
                onDragEnd={handleDragEnd}
              />
            );
          }

          // Skip rendering if group is collapsed
          if (group && group.collapsed) return;

          items.push(
            <LayerListItem
              key={layer.id}
              layer={layer}
              isActive={layer.id === activeLayerId}
              isSelected={selectedLayerIds.has(layer.id)}
              isInGroup={!!group}
              isRenaming={renamingLayerId === layer.id}
              onStartRename={() => setRenamingLayerId(layer.id)}
              onFinishRename={() => setRenamingLayerId(null)}
              onSelect={(e) => handleLayerClick(layer.id, e)}
              isDragOver={dragOverIndex === displayIndex}
              onDragStart={() => handleDragStart(displayIndex)}
              onDragOver={(e) => handleDragOver(e, displayIndex)}
              onDrop={() => handleDrop(displayIndex)}
              onDragEnd={handleDragEnd}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, layerId: layer.id });
              }}
            />
          );
        });

        return items;
      })()}
      {/* Bottom drop zone — allows dropping below the last layer */}
      {layers.length > 0 && (
        <div
          className={cn(
            'min-h-[60px] flex-1',
            dragOverIndex === displayLayers.length && 'border-t-2 border-t-primary',
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOverIndex(displayLayers.length); }}
          onDrop={() => handleDrop(displayLayers.length)}
        />
      )}
      {layers.length === 0 && (
        <div className="p-3 text-xs text-muted-foreground text-center">
          No layers yet
        </div>
      )}
      </div>
      {/* Pinned footer: Layer Menu + Add Layer */}
      <TooltipProvider>
      <div className="flex-shrink-0 border-t border-border/50 px-2 py-1.5 h-[34px] flex items-center gap-1">
        <LayerMenu />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-6 gap-1 text-xs"
              onClick={() => canAddLayer && addLayer()}
              disabled={!canAddLayer}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Layer
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {canAddLayer ? 'Add a new layer (Shift+N)' : 'Layer limit reached — upgrade for more'}
          </TooltipContent>
        </Tooltip>
      </div>
      </TooltipProvider>
      {contextMenu && (
        <LayerContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onStartRename={(layerId) => {
            setContextMenu(null);
            setRenamingLayerId(layerId);
          }}
        />
      )}
    </div>
  );
};
