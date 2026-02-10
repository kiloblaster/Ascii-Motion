/**
 * Timeline Panel — the new layer-aware timeline interface.
 * 
 * Contains tabs for switching between:
 * - "Timeline" view: Layer list + content frame blocks + keyframe diamonds
 * - "Frames (Simple)" view: The existing AnimationTimeline (frame thumbnails)
 * 
 * Replaces AnimationTimeline as the bottom panel content when layers are active.
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.2
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { useTimelineStore } from '../../stores/timelineStore';
import { AnimationTimeline } from './AnimationTimeline';
import { LayerList } from './timeline/LayerList';
import { TimelineTrackArea } from './timeline/TimelineTrackArea';
import { TimelineRuler } from './timeline/TimelineRuler';
import { TimelineToolbar } from './timeline/TimelineToolbar';
import { TimecodeDisplay } from './timeline/TimecodeDisplay';
import { KeyframeEditorPanel } from './timeline/KeyframeEditorPanel';
import { LayerPropertiesPanel } from './timeline/LayerPropertiesPanel';
import { OnionSkinControls } from './OnionSkinControls';
import { FrameRateControl } from './timeline/FrameRateControl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Slider } from '../ui/slider';
import { Layers, Grid3X3, ZoomIn, CornerDownLeft, CornerDownRight, Scissors, X } from 'lucide-react';
import { useTimelineHistory } from '../../hooks/useTimelineHistory';

export const TimelinePanel: React.FC = () => {
  const activeView = useTimelineStore((s) => s.view.activeView);
  const setActiveView = useTimelineStore((s) => s.setActiveView);
  const editingKeyframeId = useTimelineStore((s) => s.view.editingKeyframeId);
  const showLayerProperties = useTimelineStore((s) => s.view.showLayerProperties);
  const zoom = useTimelineStore((s) => s.view.zoom);
  const setZoom = useTimelineStore((s) => s.setZoom);
  const setWorkAreaStart = useTimelineStore((s) => s.setWorkAreaStart);
  const setWorkAreaEnd = useTimelineStore((s) => s.setWorkAreaEnd);
  const workAreaEnabled = useTimelineStore((s) => s.view.workAreaEnabled);
  const clearWorkArea = useTimelineStore((s) => s.clearWorkArea);
  const { trimToWorkArea } = useTimelineHistory();
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);

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
    <Tabs
      value={activeView}
      onValueChange={(v) => setActiveView(v as 'frames' | 'layers')}
      className="h-full flex flex-col"
    >
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-border/50 px-2 py-1">
        <TabsList className="h-7">
          <TabsTrigger value="layers" className="text-xs gap-1 px-2 py-0.5">
            <Layers className="w-3.5 h-3.5" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="frames" className="text-xs gap-1 px-2 py-0.5">
            <Grid3X3 className="w-3.5 h-3.5" />
            Frames
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Frames (Simple) tab — shows the existing AnimationTimeline */}
      <TabsContent value="frames" className="flex-1 mt-0 overflow-hidden">
        <AnimationTimeline />
      </TabsContent>

      {/* Timeline (Layers) tab */}
      <TabsContent value="layers" className="flex-1 mt-0 overflow-hidden">
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
              {/* Footer: frame info + zoom controls */}
              <div
                className="flex-shrink-0 border-t border-border/50 px-2 py-1.5 flex items-center gap-2 h-[34px]"
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {currentFrame + 1} / {durationFrames} ·{' '}
                </span>
                <FrameRateControl />
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
                <div className="flex-1" />
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
            </div>

            {/* Right: Keyframe editor or Layer properties */}
            {editingKeyframeId ? <KeyframeEditorPanel /> : showLayerProperties ? <LayerPropertiesPanel /> : null}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
};
