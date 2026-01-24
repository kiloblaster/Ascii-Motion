import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Maximize2 } from 'lucide-react';
import { useCanvasResize } from '@/hooks/useCanvasResize';
import { useCanvasContext } from '@/contexts/CanvasContext';
import { 
  ANCHOR_POSITIONS, 
  getAnchorDescription,
  type AnchorPosition 
} from '@/utils/canvasResizeUtils';
import { 
  charactersToPixels, 
  validatePixelInput 
} from '@/utils/canvasSizeConversion';

interface CanvasResizeDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Canvas Resize Dialog
 * 
 * Allows resizing the canvas with anchor-based positioning.
 * Features:
 * - Width/height inputs in characters or pixels mode
 * - 9-point anchor grid for content positioning
 * - Applies changes across all frames with undo support
 */
export function CanvasResizeDialog({ isOpen, onOpenChange }: CanvasResizeDialogProps) {
  const { resizeCanvas, currentWidth, currentHeight } = useCanvasResize();
  const { fontSize, characterSpacing, lineSpacing } = useCanvasContext();

  // Local state for form inputs
  const [newWidth, setNewWidth] = useState(currentWidth);
  const [newHeight, setNewHeight] = useState(currentHeight);
  const [anchor, setAnchor] = useState<AnchorPosition>('middle-center');
  const [sizeMode, setSizeMode] = useState<'characters' | 'pixels'>('characters');

  // Calculate pixel dimensions
  const currentPixelDimensions = useMemo(() => {
    return charactersToPixels(
      { width: currentWidth, height: currentHeight },
      { fontSize, characterSpacing, lineSpacing }
    );
  }, [currentWidth, currentHeight, fontSize, characterSpacing, lineSpacing]);

  const newPixelDimensions = useMemo(() => {
    return charactersToPixels(
      { width: newWidth, height: newHeight },
      { fontSize, characterSpacing, lineSpacing }
    );
  }, [newWidth, newHeight, fontSize, characterSpacing, lineSpacing]);

  // Sync local state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setNewWidth(currentWidth);
      setNewHeight(currentHeight);
      setAnchor('middle-center');
    }
  }, [isOpen, currentWidth, currentHeight]);

  // Handle width change
  const handleWidthChange = (value: number) => {
    if (sizeMode === 'characters') {
      setNewWidth(Math.max(4, Math.min(200, value)));
    } else {
      // Convert pixel input to characters
      const validatedChars = validatePixelInput(
        { width: value, height: newPixelDimensions.height },
        { fontSize, characterSpacing, lineSpacing }
      );
      setNewWidth(validatedChars.width);
    }
  };

  // Handle height change
  const handleHeightChange = (value: number) => {
    if (sizeMode === 'characters') {
      setNewHeight(Math.max(4, Math.min(100, value)));
    } else {
      // Convert pixel input to characters
      const validatedChars = validatePixelInput(
        { width: newPixelDimensions.width, height: value },
        { fontSize, characterSpacing, lineSpacing }
      );
      setNewHeight(validatedChars.height);
    }
  };

  // Get display values based on mode
  const displayWidth = sizeMode === 'characters' ? newWidth : newPixelDimensions.width;
  const displayHeight = sizeMode === 'characters' ? newHeight : newPixelDimensions.height;
  const displayCurrentWidth = sizeMode === 'characters' ? currentWidth : currentPixelDimensions.width;
  const displayCurrentHeight = sizeMode === 'characters' ? currentHeight : currentPixelDimensions.height;

  // Check if dimensions changed
  const sizeChanged = newWidth !== currentWidth || newHeight !== currentHeight;

  // Handle resize action
  const handleResize = () => {
    if (sizeChanged) {
      resizeCanvas(newWidth, newHeight, anchor);
    }
    onOpenChange(false);
  };

  // Handle cancel
  const handleCancel = () => {
    onOpenChange(false);
  };

  // Toggle size mode
  const handleModeToggle = () => {
    setSizeMode(prev => prev === 'characters' ? 'pixels' : 'characters');
  };

  // Increment/decrement width (handles pixel mode by adjusting by one character's worth)
  const adjustWidth = (delta: number) => {
    if (sizeMode === 'characters') {
      setNewWidth(Math.max(4, Math.min(200, newWidth + delta)));
    } else {
      // In pixel mode, adjust by one character worth of pixels
      const baseCharWidth = fontSize * 0.6 * characterSpacing;
      const pixelDelta = Math.round(baseCharWidth * delta);
      const newPixelWidth = newPixelDimensions.width + pixelDelta;
      const validatedChars = validatePixelInput(
        { width: newPixelWidth, height: newPixelDimensions.height },
        { fontSize, characterSpacing, lineSpacing }
      );
      setNewWidth(validatedChars.width);
    }
  };

  // Increment/decrement height (handles pixel mode by adjusting by one character's worth)
  const adjustHeight = (delta: number) => {
    if (sizeMode === 'characters') {
      setNewHeight(Math.max(4, Math.min(100, newHeight + delta)));
    } else {
      // In pixel mode, adjust by one character worth of pixels
      const baseCharHeight = fontSize * lineSpacing;
      const pixelDelta = Math.round(baseCharHeight * delta);
      const newPixelHeight = newPixelDimensions.height + pixelDelta;
      const validatedChars = validatePixelInput(
        { width: newPixelDimensions.width, height: newPixelHeight },
        { fontSize, characterSpacing, lineSpacing }
      );
      setNewHeight(validatedChars.height);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Maximize2 className="h-5 w-5" />
            Resize Canvas
          </DialogTitle>
          <DialogDescription>
            Resize the canvas and choose where to anchor existing content
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Current Size Display */}
          <div className="text-sm text-muted-foreground">
            Current size: {displayCurrentWidth} × {displayCurrentHeight} {sizeMode === 'characters' ? 'characters' : 'pixels'}
          </div>

          {/* Size Mode Toggle */}
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">New size:</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleModeToggle}
                    className="h-7 px-2 text-xs min-w-[36px]"
                  >
                    {sizeMode === 'characters' ? 'char' : 'px'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {sizeMode === 'characters' 
                    ? 'Characters (click to switch to pixels)'
                    : 'Pixels (click to switch to characters)'
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Size Inputs */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label htmlFor="resize-width" className="text-xs text-muted-foreground">
                Width
              </Label>
              <div className="flex items-center gap-1">
                <Input
                  id="resize-width"
                  type="number"
                  min={sizeMode === 'characters' ? 4 : 1}
                  max={sizeMode === 'characters' ? 200 : undefined}
                  value={displayWidth}
                  onChange={(e) => handleWidthChange(parseInt(e.target.value) || 4)}
                  className="text-center"
                />
                <div className="flex flex-col">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => adjustWidth(1)}
                    disabled={sizeMode === 'characters' && newWidth >= 200}
                    className="h-4 w-6 p-0 rounded-l-none rounded-br-none border-l-0 text-xs"
                  >
                    +
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => adjustWidth(-1)}
                    disabled={sizeMode === 'characters' && newWidth <= 4}
                    className="h-4 w-6 p-0 rounded-l-none rounded-tr-none border-l-0 border-t-0 text-xs"
                  >
                    −
                  </Button>
                </div>
              </div>
            </div>

            <span className="text-muted-foreground mt-5">×</span>

            <div className="flex-1">
              <Label htmlFor="resize-height" className="text-xs text-muted-foreground">
                Height
              </Label>
              <div className="flex items-center gap-1">
                <Input
                  id="resize-height"
                  type="number"
                  min={sizeMode === 'characters' ? 4 : 1}
                  max={sizeMode === 'characters' ? 100 : undefined}
                  value={displayHeight}
                  onChange={(e) => handleHeightChange(parseInt(e.target.value) || 4)}
                  className="text-center"
                />
                <div className="flex flex-col">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => adjustHeight(1)}
                    disabled={sizeMode === 'characters' && newHeight >= 100}
                    className="h-4 w-6 p-0 rounded-l-none rounded-br-none border-l-0 text-xs"
                  >
                    +
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => adjustHeight(-1)}
                    disabled={sizeMode === 'characters' && newHeight <= 4}
                    className="h-4 w-6 p-0 rounded-l-none rounded-tr-none border-l-0 border-t-0 text-xs"
                  >
                    −
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Anchor Grid */}
          <div className="grid gap-2">
            <Label className="text-sm font-medium">
              Anchor: <span className="text-muted-foreground font-normal">{getAnchorDescription(anchor)}</span>
            </Label>
            <TooltipProvider>
              <div className="grid grid-cols-3 gap-1 w-fit">
                {ANCHOR_POSITIONS.map((pos) => (
                  <Tooltip key={pos.position}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={anchor === pos.position ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setAnchor(pos.position)}
                        className="h-8 w-8 p-0 text-sm font-normal"
                        aria-label={getAnchorDescription(pos.position)}
                      >
                        {pos.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {getAnchorDescription(pos.position)}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
            <p className="text-xs text-muted-foreground">
              Content will stay anchored to this position. New space is added on the opposite sides.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleResize} disabled={!sizeChanged}>
            Resize
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
