/**
 * TimelineResizeHandle — Drag handle for resizing the bottom timeline panel.
 * 
 * Places a draggable bar at the top of the bottom panel. Dragging vertically
 * adjusts the `--bottom-panel-height` CSS variable and syncs to the timeline
 * store's `panelHeight`.
 * 
 * Phase 3, §3.1
 */
import React, { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useTimelineStore } from '@/stores/timelineStore';

// ─── Constants ─────────────────────────────────────────────────────
const MIN_HEIGHT = 140;   // Minimum panel height in px
const MAX_HEIGHT = 600;   // Maximum panel height in px

// ─── Component ─────────────────────────────────────────────────────
export interface TimelineResizeHandleProps {
  className?: string;
}

export const TimelineResizeHandle: React.FC<TimelineResizeHandleProps> = ({ className }) => {
  const setPanelHeight = useTimelineStore((s) => s.setPanelHeight);
  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;

    // Disable transitions on panels so they follow the drag exactly
    document.documentElement.classList.add('panel-resizing');

    // Track initial values
    const startY = e.clientY;
    const startHeight = document.documentElement.style.getPropertyValue('--bottom-panel-height');
    const startPx = startHeight ? parseInt(startHeight, 10) : 320;

    const handleMouseMove = (me: MouseEvent) => {
      if (!isDraggingRef.current) return;
      // Dragging up (negative deltaY) should increase height
      const deltaY = startY - me.clientY;
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startPx + deltaY));
      document.documentElement.style.setProperty('--bottom-panel-height', `${newHeight}px`);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      // Re-enable transitions
      document.documentElement.classList.remove('panel-resizing');
      // Persist final height to store
      const finalHeight = document.documentElement.style.getPropertyValue('--bottom-panel-height');
      if (finalHeight) {
        const px = parseInt(finalHeight, 10);
        if (!isNaN(px)) {
          setPanelHeight(px);
        }
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [setPanelHeight]);

  return (
    <div
      className={cn(
        'absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-30',
        'group hover:bg-primary/20 active:bg-primary/30 transition-colors',
        className,
      )}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize timeline panel"
    >
      {/* Visual drag indicator */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0.5 w-8 h-0.5 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
    </div>
  );
};

export default TimelineResizeHandle;
