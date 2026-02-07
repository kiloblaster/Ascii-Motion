/**
 * Content Frame Block — a selectable, draggable, resizable block representing
 * a content frame on the timeline.
 *
 * Supports:
 *  - Click to select (and activate layer)
 *  - Shift+click to multi-select
 *  - Drag to reorder within or across layers with ghost + drop indicator
 *  - Edge-drag to resize
 *
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.8
 */

import React, { useCallback, useRef } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { cn } from '@/lib/utils';
import type { ContentFrame, ContentFrameId, LayerId } from '../../../types/timeline';

interface ContentFrameBlockProps {
  layerId: LayerId;
  contentFrame: ContentFrame;
  pxPerFrame: number;
  scrollX: number;
}

const DRAG_THRESHOLD = 4;

export const ContentFrameBlock: React.FC<ContentFrameBlockProps> = ({
  layerId,
  contentFrame,
  pxPerFrame,
  scrollX,
}) => {
  const updateContentFrameTiming = useTimelineStore((s) => s.updateContentFrameTiming);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const selectedIds = useTimelineStore((s) => s.view.selectedContentFrameIds);
  const selectContentFrames = useTimelineStore((s) => s.selectContentFrames);
  const toggleContentFrameSelected = useTimelineStore((s) => s.toggleContentFrameSelected);
  const setActiveLayer = useTimelineStore((s) => s.setActiveLayer);
  const setContentFrameDragPreview = useTimelineStore((s) => s.setContentFrameDragPreview);
  const goToFrame = useTimelineStore((s) => s.goToFrame);

  const isActive = layerId === activeLayerId;
  const isSelected = selectedIds.has(contentFrame.id);
  const dragPreview = useTimelineStore((s) => s.view.contentFrameDragPreview);
  const isDragging = dragPreview?.frameId === contentFrame.id;

  const left = contentFrame.startFrame * pxPerFrame;
  const width = Math.max(contentFrame.durationFrames * pxPerFrame, 4);
  const blockRef = useRef<HTMLDivElement>(null);

  // ── Helpers ──

  const getTargetLayerId = (clientY: number): LayerId => {
    const els = document.querySelectorAll<HTMLElement>('[data-layer-id]');
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY < rect.bottom) {
        return el.dataset.layerId as LayerId;
      }
    }
    return layerId;
  };

  const getOtherFrames = (tgtLayerId: LayerId) => {
    const tl = useTimelineStore.getState();
    const layer = tl.layers.find((l) => l.id === tgtLayerId);
    if (!layer) return [];
    return [...layer.contentFrames]
      .filter((cf) => cf.id !== contentFrame.id)
      .sort((a, b) => a.startFrame - b.startFrame);
  };

  const getDropTarget = (mouseLeftFrame: number, otherFrames: ContentFrame[]) => {
    const duration = contentFrame.durationFrames;
    const centerFrame = mouseLeftFrame + duration / 2;
    const roundedStart = Math.max(0, Math.round(mouseLeftFrame));

    const overFrame = otherFrames.find(
      (cf) => centerFrame >= cf.startFrame && centerFrame < cf.startFrame + cf.durationFrames,
    );

    if (!overFrame) {
      return { targetStart: roundedStart, slotFrame: roundedStart };
    }

    const leftBoundary = overFrame.startFrame;
    const rightBoundary = overFrame.startFrame + overFrame.durationFrames;
    const distLeft = Math.abs(mouseLeftFrame - leftBoundary);
    const distRight = Math.abs(mouseLeftFrame - rightBoundary);

    return distLeft <= distRight
      ? { targetStart: leftBoundary, slotFrame: leftBoundary }
      : { targetStart: rightBoundary, slotFrame: rightBoundary };
  };

  // ── Main handler: click / shift-click / drag ──

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const origStart = contentFrame.startFrame;
      const duration = contentFrame.durationFrames;
      let didDrag = false;

      const onMouseMove = (me: MouseEvent) => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        if (!didDrag && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
        didDrag = true;

        const tgtLayerId = getTargetLayerId(me.clientY);
        const others = getOtherFrames(tgtLayerId);
        const mouseLeftFrame = origStart + dx / pxPerFrame;
        const { slotFrame } = getDropTarget(mouseLeftFrame, others);

        setContentFrameDragPreview({
          sourceLayerId: layerId,
          targetLayerId: tgtLayerId,
          frameId: contentFrame.id,
          ghostLeftPx: Math.max(0, slotFrame * pxPerFrame),
          ghostWidthPx: duration * pxPerFrame,
          slotFrame,
        });
      };

      const onMouseUp = (me: MouseEvent) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const preview = useTimelineStore.getState().view.contentFrameDragPreview;
        setContentFrameDragPreview(null);

        if (!didDrag) {
          if (layerId !== activeLayerId) setActiveLayer(layerId);
          goToFrame(contentFrame.startFrame);
          if (me.shiftKey) {
            toggleContentFrameSelected(contentFrame.id);
          } else {
            selectContentFrames([contentFrame.id]);
          }
          return;
        }

        if (!preview) return;

        const tgtLayerId = preview.targetLayerId;
        const others = getOtherFrames(tgtLayerId);
        const dx = me.clientX - startX;
        const mouseLeftFrame = origStart + dx / pxPerFrame;
        const { targetStart } = getDropTarget(mouseLeftFrame, others);

        if (tgtLayerId === layerId && targetStart === origStart) return;

        const tl = useTimelineStore.getState();

        if (tgtLayerId !== layerId) {
          // Cross-layer move
          tl.removeContentFrame(layerId, contentFrame.id);
          tl.addContentFrame(tgtLayerId, targetStart, duration, new Map(contentFrame.data));

          const updatedTarget = useTimelineStore.getState().layers.find((l) => l.id === tgtLayerId);
          if (updatedTarget) {
            const sorted = [...updatedTarget.contentFrames].sort((a, b) => a.startFrame - b.startFrame);
            for (let i = 1; i < sorted.length; i++) {
              const prevEnd = sorted[i - 1].startFrame + sorted[i - 1].durationFrames;
              if (sorted[i].startFrame < prevEnd) {
                updateContentFrameTiming(tgtLayerId, sorted[i].id, prevEnd, sorted[i].durationFrames);
                sorted[i] = { ...sorted[i], startFrame: prevEnd };
              }
            }
          }
          setActiveLayer(tgtLayerId);
        } else {
          // Same-layer reorder
          const currentLayer = tl.layers.find((l) => l.id === layerId);
          if (!currentLayer) return;

          const draggedId = contentFrame.id;
          const sim = currentLayer.contentFrames.map((cf) =>
            cf.id === draggedId ? { ...cf, startFrame: targetStart } : { ...cf },
          );
          sim.sort((a, b) => {
            if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame;
            if (a.id === draggedId) return -1;
            if (b.id === draggedId) return 1;
            return 0;
          });
          for (let i = 1; i < sim.length; i++) {
            const prevEnd = sim[i - 1].startFrame + sim[i - 1].durationFrames;
            if (sim[i].startFrame < prevEnd) {
              sim[i] = { ...sim[i], startFrame: prevEnd };
            }
          }

          const simMaxEnd = Math.max(...sim.map((cf) => cf.startFrame + cf.durationFrames));
          if (simMaxEnd !== origStart) {
            updateContentFrameTiming(layerId, contentFrame.id, simMaxEnd, duration);
          }

          const nonDragged = sim.filter((cf) => cf.id !== contentFrame.id).sort((a, b) => b.startFrame - a.startFrame);
          for (const planned of nonDragged) {
            const current = useTimelineStore.getState().layers.find((l) => l.id === layerId)?.contentFrames.find((cf) => cf.id === planned.id);
            if (current && current.startFrame !== planned.startFrame) {
              updateContentFrameTiming(layerId, planned.id, planned.startFrame, planned.durationFrames);
            }
          }

          updateContentFrameTiming(layerId, contentFrame.id, targetStart, duration);

          const allLayers = useTimelineStore.getState().layers;
          const globalMaxEnd = Math.max(1, ...allLayers.flatMap((l) => l.contentFrames.map((cf) => cf.startFrame + cf.durationFrames)));
          const currentDuration = useTimelineStore.getState().config.durationFrames;
          if (globalMaxEnd < currentDuration) {
            useTimelineStore.getState().setDuration(globalMaxEnd);
          }
        }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [contentFrame, layerId, pxPerFrame, updateContentFrameTiming, activeLayerId, setActiveLayer, goToFrame, selectContentFrames, toggleContentFrameSelected, setContentFrameDragPreview],
  );

  // ── Resize handlers ──

  const handleResizeRight = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startDuration = contentFrame.durationFrames;
    const onMouseMove = (me: MouseEvent) => {
      const newDuration = Math.max(1, startDuration + Math.round((me.clientX - startX) / pxPerFrame));
      if (newDuration !== contentFrame.durationFrames) updateContentFrameTiming(layerId, contentFrame.id, contentFrame.startFrame, newDuration);
    };
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [contentFrame, layerId, pxPerFrame, updateContentFrameTiming]);

  const handleResizeLeft = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const sf = contentFrame.startFrame;
    const sd = contentFrame.durationFrames;
    const endFrame = sf + sd;
    const onMouseMove = (me: MouseEvent) => {
      const newStart = Math.max(0, Math.min(endFrame - 1, sf + Math.round((me.clientX - startX) / pxPerFrame)));
      const newDuration = endFrame - newStart;
      if (newStart !== contentFrame.startFrame || newDuration !== contentFrame.durationFrames) updateContentFrameTiming(layerId, contentFrame.id, newStart, newDuration);
    };
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [contentFrame, layerId, pxPerFrame, updateContentFrameTiming]);

  const cellCount = contentFrame.data.size;

  return (
    <div
      ref={blockRef}
      className={cn(
        'absolute top-1 h-[24px] rounded border cursor-move',
        isDragging && 'opacity-30',
        isSelected
          ? 'bg-purple-500/30 border-purple-500/70 ring-1 ring-purple-500/40'
          : isActive
            ? 'bg-primary/30 border-primary/60'
            : 'bg-muted-foreground/15 border-muted-foreground/30',
      )}
      style={{ left, width }}
      onMouseDown={handleMouseDown}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/30 rounded-l" onMouseDown={handleResizeLeft} />
      {width > 30 && (
        <div className="px-2 text-[10px] truncate leading-[24px] text-foreground/70 pointer-events-none">
          {contentFrame.name}
          {cellCount > 0 && <span className="ml-1 text-muted-foreground">({cellCount})</span>}
        </div>
      )}
      <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/30 rounded-r" onMouseDown={handleResizeRight} />
    </div>
  );
};
