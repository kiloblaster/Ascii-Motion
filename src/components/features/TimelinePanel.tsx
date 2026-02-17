/**
 * Timeline Panel — the layer-aware timeline interface.
 * 
 * Renders the timeline view with:
 * - Layer list + content frame blocks + keyframe diamonds
 * - Toolbar with playback controls, frame operations
 * - Ruler, zoom, frame rate controls
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.2
 */

import React, { useRef, useEffect } from 'react';
import { useTimelineStore } from '../../stores/timelineStore';
import { useToolStore } from '../../stores/toolStore';
import { LayerList } from './timeline/LayerList';
import { TimelineTrackArea } from './timeline/TimelineTrackArea';
import { TimelineRuler } from './timeline/TimelineRuler';
import { TimelineToolbar } from './timeline/TimelineToolbar';
import { KeyframeEditorPanel } from './timeline/KeyframeEditorPanel';
import { OnionSkinControls } from './OnionSkinControls';
import { LayerPropertiesPanel } from './timeline/LayerPropertiesPanel';
import { GroupPropertiesPanel } from './timeline/GroupPropertiesPanel';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Slider } from '../ui/slider';
import { ZoomIn, CornerDownLeft, CornerDownRight, Scissors, X, RulerDimensionLine } from 'lucide-react';
import { useTimelineHistory } from '../../hooks/useTimelineHistory';

/**
 * PERF FIX: TimelineFooter is a separate memoized component that owns
 * currentFrame/durationFrames subscriptions. Previously these lived in
 * TimelinePanel, causing the entire timeline tree (Ruler + TrackArea + LayerList)
 * to re-render on every frame navigation. Now only this small footer re-renders.
 */
const TimelineFooter = React.memo(function TimelineFooter({
  zoom,
  setZoom,
  workAreaEnabled,
  trimToWorkArea,
  clearWorkArea,
}: {
  zoom: number;
  setZoom: (v: number) => void;
  workAreaEnabled: boolean;
  trimToWorkArea: () => void;
  clearWorkArea: () => void;
}) {
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const setWorkAreaStart = useTimelineStore((s) => s.setWorkAreaStart);
  const setWorkAreaEnd = useTimelineStore((s) => s.setWorkAreaEnd);
  const footerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={footerRef}
      className="flex-shrink-0 border-t border-border/50 px-2 py-1.5 flex items-center gap-2 h-[34px]"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <TooltipProvider>
        <div className="flex items-center gap-0.5 ml-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => setWorkAreaStart(currentFrame)}
              >
                <CornerDownLeft className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Set work area start to playhead</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => setWorkAreaEnd(currentFrame + 1)}
              >
                <CornerDownRight className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Set work area end to playhead</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={trimToWorkArea}
                disabled={!workAreaEnabled}
              >
                <Scissors className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Trim timeline to work area</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={clearWorkArea}
                disabled={!workAreaEnabled}
              >
                <X className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear work area</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Center: Onion skin controls */}
      <div className="flex-1 flex items-center justify-center">
        <OnionSkinControls />
      </div>

      {/* Right: Zoom + Frame timeline */}
      <TooltipProvider>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Tooltip><TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => {
              // Calculate zoom to fit entire timeline in view
              // Track area width ≈ footer width (they're in the same flex column)
              const containerWidth = footerRef.current?.parentElement?.clientWidth ?? 600;
              // Subtract layer list width (w-52 = 208px) and some padding
              const trackWidth = Math.max(100, containerWidth - 220);
              const BASE_PX = 12; // BASE_PX_PER_FRAME from TimelineTrackArea
              const fitZoom = trackWidth / (durationFrames * BASE_PX);
              setZoom(Math.max(0.5, Math.min(8, Math.round(fitZoom * 4) / 4)));
            }}
          >
            <RulerDimensionLine className="w-3 h-3" />
          </Button>
        </TooltipTrigger><TooltipContent>Frame entire timeline</TooltipContent></Tooltip>
        <ZoomIn className="w-3 h-3 text-muted-foreground" />
        <Slider
          value={zoom}
          onValueChange={(v) => setZoom(v)}
          min={0.5}
          max={8}
          step={0.25}
          className="w-28"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
          {zoom.toFixed(1)}x
        </span>
      </div>
      </TooltipProvider>
    </div>
  );
});

export const TimelinePanel: React.FC = () => {
  const editingKeyframeId = useTimelineStore((s) => s.view.editingKeyframeId);
  const showLayerProperties = useTimelineStore((s) => s.view.showLayerProperties);
  const setShowLayerProperties = useTimelineStore((s) => s.setShowLayerProperties);
  const activeTool = useToolStore((s) => s.activeTool);
  const zoom = useTimelineStore((s) => s.view.zoom);
  const setZoom = useTimelineStore((s) => s.setZoom);
  const workAreaEnabled = useTimelineStore((s) => s.view.workAreaEnabled);
  const clearWorkArea = useTimelineStore((s) => s.clearWorkArea);
  const { trimToWorkArea } = useTimelineHistory();
  // PERF FIX: Removed currentFrame + durationFrames subscriptions from TimelinePanel.
  // They only served the footer display ("frame N / total") but caused the ENTIRE
  // timeline tree to re-render on every frame navigation. Moved to TimelineFooter.

  // Auto-show layer properties panel when transform tool is active
  useEffect(() => {
    if (activeTool === 'layertransform') {
      setShowLayerProperties(true);
    }
  }, [activeTool, setShowLayerProperties]);

  // Sync vertical scroll between layer list and track area
  const layerListScrollRef = useRef<HTMLDivElement>(null);
  const trackAreaScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);

  useEffect(() => {
    const layerEl = layerListScrollRef.current;
    const trackEl = trackAreaScrollRef.current;
    if (!layerEl || !trackEl) return;

    const syncFromLayers = () => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      trackEl.scrollTop = layerEl.scrollTop;
      requestAnimationFrame(() => { isSyncingScroll.current = false; });
    };

    const syncFromTracks = () => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      layerEl.scrollTop = trackEl.scrollTop;
      requestAnimationFrame(() => { isSyncingScroll.current = false; });
    };

    layerEl.addEventListener('scroll', syncFromLayers);
    trackEl.addEventListener('scroll', syncFromTracks);

    return () => {
      layerEl.removeEventListener('scroll', syncFromLayers);
      trackEl.removeEventListener('scroll', syncFromTracks);
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar row */}
      <TimelineToolbar />
      
      {/* Main timeline area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Layer list */}
        <LayerList scrollRef={layerListScrollRef} />

        {/* Center: Timeline ruler + content frame blocks + keyframe tracks */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TimelineRuler />
          <TimelineTrackArea scrollRef={trackAreaScrollRef} />
              <TimelineFooter
                zoom={zoom}
                setZoom={setZoom}
                workAreaEnabled={workAreaEnabled}
                trimToWorkArea={trimToWorkArea}
                clearWorkArea={clearWorkArea}
              />
            </div>

            {/* Right: Keyframe editor or Layer/Group properties */}
            {editingKeyframeId ? <KeyframeEditorPanel /> : showLayerProperties ? <LayerPropertiesPanel /> : <GroupPropertiesPanel />}
          </div>
        </div>
  );
};
