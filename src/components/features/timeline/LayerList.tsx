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
import { LayerListItem } from './LayerListItem';
import type { LayerId } from '../../../types/timeline';

interface LayerListProps {
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export const LayerList: React.FC<LayerListProps> = ({ scrollRef }) => {
  const layers = useTimelineStore((s) => s.layers);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const setActiveLayer = useTimelineStore((s) => s.setActiveLayer);
  const reorderLayers = useTimelineStore((s) => s.reorderLayers);

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragSourceIndex = useRef<number | null>(null);

  // Display reversed: top of list = top of z-order = last in array
  const displayLayers = [...layers].reverse();

  const handleDragStart = useCallback((displayIndex: number) => {
    dragSourceIndex.current = displayIndex;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, displayIndex: number) => {
    e.preventDefault();
    setDragOverIndex(displayIndex);
  }, []);

  const handleDrop = useCallback(
    (displayIndex: number) => {
      if (dragSourceIndex.current === null || dragSourceIndex.current === displayIndex) {
        setDragOverIndex(null);
        dragSourceIndex.current = null;
        return;
      }

      // Convert display indices (reversed) to store array indices
      const fromStoreIndex = layers.length - 1 - dragSourceIndex.current;
      const toStoreIndex = layers.length - 1 - displayIndex;

      reorderLayers(fromStoreIndex, toStoreIndex);
      setDragOverIndex(null);
      dragSourceIndex.current = null;
    },
    [layers.length, reorderLayers],
  );

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null);
    dragSourceIndex.current = null;
  }, []);

  return (
    <div
      ref={scrollRef}
      className="w-52 flex-shrink-0 border-r border-border/50 overflow-y-auto bg-muted/20"
    >
      {/* Spacer to align with TimelineRuler (h-6 = 24px) */}
      <div className="h-6 flex-shrink-0 border-b border-border/50 bg-muted/30" />
      {displayLayers.map((layer, displayIndex) => (
        <LayerListItem
          key={layer.id}
          layer={layer}
          isActive={layer.id === activeLayerId}
          onSelect={() => setActiveLayer(layer.id)}
          isDragOver={dragOverIndex === displayIndex}
          onDragStart={() => handleDragStart(displayIndex)}
          onDragOver={(e) => handleDragOver(e, displayIndex)}
          onDrop={() => handleDrop(displayIndex)}
          onDragEnd={handleDragEnd}
        />
      ))}
      {layers.length === 0 && (
        <div className="p-3 text-xs text-muted-foreground text-center">
          No layers yet
        </div>
      )}
    </div>
  );
};
