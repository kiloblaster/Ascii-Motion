import React, { useCallback } from 'react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Layers } from 'lucide-react';
import { useAnimationStore } from '../../stores/animationStore';

/**
 * OnionSkinControls component
 * Provides controls for toggling onion skinning and adjusting frame counts
 * Positioned between PlaybackControls and FrameControls in the timeline
 */
export const OnionSkinControls: React.FC = () => {
  const {
    onionSkin,
    toggleOnionSkin,
    setPreviousFrames,
    setNextFrames
  } = useAnimationStore();

  const handlePreviousFramesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setPreviousFrames(value);
    }
  }, [setPreviousFrames]);

  const handleNextFramesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setNextFrames(value);
    }
  }, [setNextFrames]);

  const handlePreviousIncrement = useCallback(() => {
    setPreviousFrames(Math.min(10, onionSkin.previousFrames + 1));
  }, [setPreviousFrames, onionSkin.previousFrames]);

  const handlePreviousDecrement = useCallback(() => {
    setPreviousFrames(Math.max(0, onionSkin.previousFrames - 1));
  }, [setPreviousFrames, onionSkin.previousFrames]);

  const handleNextIncrement = useCallback(() => {
    setNextFrames(Math.min(10, onionSkin.nextFrames + 1));
  }, [setNextFrames, onionSkin.nextFrames]);

  const handleNextDecrement = useCallback(() => {
    setNextFrames(Math.max(0, onionSkin.nextFrames - 1));
  }, [setNextFrames, onionSkin.nextFrames]);

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {/* Previous frames input with steppers */}
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePreviousDecrement}
            disabled={onionSkin.previousFrames <= 0}
            className="h-5 w-4 p-0 text-[10px] leading-none"
          >
            -
          </Button>
          <input
            type="number"
            min="0"
            max="10"
            value={onionSkin.previousFrames}
            onChange={handlePreviousFramesChange}
            className="w-7 h-5 text-[10px] text-center border border-border/50 rounded bg-background text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            style={{ color: '#3B82F6' }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePreviousIncrement}
            disabled={onionSkin.previousFrames >= 10}
            className="h-5 w-4 p-0 text-[10px] leading-none"
          >
            +
          </Button>
        </div>

        {/* Center toggle button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleOnionSkin}
              className={`h-6 w-6 p-0 ${onionSkin.enabled ? 'text-purple-500 hover:text-purple-400' : ''}`}
            >
              <Layers className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Toggle Onion Skin (Shift+O)</p>
          </TooltipContent>
        </Tooltip>

        {/* Next frames input with steppers */}
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleNextDecrement}
            disabled={onionSkin.nextFrames <= 0}
            className="h-5 w-4 p-0 text-[10px] leading-none"
          >
            -
          </Button>
          <input
            type="number"
            min="0"
            max="10"
            value={onionSkin.nextFrames}
            onChange={handleNextFramesChange}
            className="w-7 h-5 text-[10px] text-center border border-border/50 rounded bg-background text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            style={{ color: '#EF4444' }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={handleNextIncrement}
            disabled={onionSkin.nextFrames >= 10}
            className="h-5 w-4 p-0 text-[10px] leading-none"
          >
            +
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
};
