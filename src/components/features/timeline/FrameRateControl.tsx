/**
 * Frame Rate Control — popup menu for changing the animation frame rate.
 *
 * Shows common FPS presets (1–60) plus a "Custom..." option that opens
 * a dialog for arbitrary FPS input with a live ms-per-frame readout.
 *
 * Behavior: changing frame rate preserves frame count and only changes
 * playback speed (maintainDuration=false).
 *
 * Part of the Layer Timeline Refactor (Phase 4)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §4.12
 */

import React, { useState, useMemo } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useTimelineHistory } from '../../../hooks/useTimelineHistory';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Check } from 'lucide-react';

/** Common frame rate presets */
const FPS_PRESETS = [1, 2, 4, 8, 10, 12, 15, 24, 25, 30, 60] as const;

export const FrameRateControl: React.FC = () => {
  const frameRate = useTimelineStore((s) => s.config.frameRate);
  const { setFrameRate } = useTimelineHistory();
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customFps, setCustomFps] = useState(String(frameRate));

  const handlePresetSelect = (fps: number) => {
    if (fps !== frameRate) {
      setFrameRate(fps, false); // maintainDuration=false: keep frame count, change speed
    }
  };

  const handleCustomApply = () => {
    const fps = parseInt(customFps, 10);
    if (!isNaN(fps) && fps >= 1 && fps <= 120 && fps !== frameRate) {
      setFrameRate(fps, false);
    }
    setShowCustomDialog(false);
  };

  const handleOpenCustom = () => {
    setCustomFps(String(frameRate));
    setShowCustomDialog(true);
  };

  const msPerFrame = useMemo(() => {
    const fps = parseInt(customFps, 10);
    if (isNaN(fps) || fps <= 0) return '—';
    return `${(1000 / fps).toFixed(1)} ms`;
  }, [customFps]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-[10px] text-muted-foreground tabular-nums hover:text-foreground transition-colors cursor-pointer">
            {frameRate} fps
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="min-w-[120px]">
          {FPS_PRESETS.map((fps) => (
            <DropdownMenuItem
              key={fps}
              onClick={() => handlePresetSelect(fps)}
              className="flex items-center justify-between"
            >
              <span>{fps} fps</span>
              {fps === frameRate && <Check className="w-3 h-3 ml-2" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleOpenCustom}>
            Custom...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Custom FPS Dialog */}
      <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Custom Frame Rate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="custom-fps" className="text-xs text-muted-foreground">
                Frames per second
              </Label>
              <Input
                id="custom-fps"
                type="number"
                min={1}
                max={120}
                step={1}
                value={customFps}
                onChange={(e) => setCustomFps(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomApply();
                }}
                className="mt-1"
                autoFocus
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Each frame = <span className="text-foreground font-medium tabular-nums">{msPerFrame}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCustomDialog(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCustomApply}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
