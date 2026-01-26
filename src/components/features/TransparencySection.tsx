/**
 * TransparencySection - Collapsible section for color keying/alpha transparency controls
 * 
 * Features:
 * - Enable/disable color as alpha
 * - Color picker for selecting the alpha key color
 * - Eyedropper tool to sample colors from the preview (integrated canvas)
 * - Tolerance slider for fuzzy color matching
 * - Visual preview showing which pixels will be transparent (green overlay)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { Slider } from '../ui/slider';
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { Checkbox } from '../ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Sparkles, ChevronDown, Pipette } from 'lucide-react';
import { useImportSettings } from '../../stores/importStore';
import { ColorPickerOverlay } from './ColorPickerOverlay';
import { ColorMatcher } from '../../utils/asciiConverter';
import type { ProcessedFrame } from '../../utils/mediaProcessor';

interface TransparencySectionProps {
  onSettingsChange?: () => void;
  /** Preview frames from the media processor - used for eyedropper and transparency preview */
  previewFrames?: ProcessedFrame[];
  /** Current frame index for multi-frame media */
  frameIndex?: number;
}

export function TransparencySection({ onSettingsChange, previewFrames = [], frameIndex = 0 }: TransparencySectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);
  
  // Canvas ref for transparency preview
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Import settings
  const { settings, updateSettings } = useImportSettings();
  const {
    enableColorAsAlpha,
    colorAsAlphaKey,
    colorAsAlphaTolerance
  } = settings;

  const handleToggleEnabled = (enabled: boolean) => {
    updateSettings({ enableColorAsAlpha: enabled });
    onSettingsChange?.();
  };

  const handleColorChange = useCallback((color: string) => {
    updateSettings({ colorAsAlphaKey: color });
    onSettingsChange?.();
  }, [updateSettings, onSettingsChange]);

  const handleToleranceChange = (value: number) => {
    updateSettings({ colorAsAlphaTolerance: value });
    onSettingsChange?.();
  };

  const handleColorPickerOpen = () => {
    setIsColorPickerOpen(true);
  };

  const handleColorPickerSelect = (color: string) => {
    handleColorChange(color);
    setIsColorPickerOpen(false);
  };
  
  // Handle eyedropper click on the preview canvas
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (previewFrames.length === 0) return;
    
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Scale click position to canvas coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = Math.floor(x * scaleX);
    const canvasY = Math.floor(y * scaleY);
    
    // Get the pixel from the current preview frame
    const frame = previewFrames[frameIndex];
    if (frame && frame.imageData) {
      const index = (canvasY * frame.imageData.width + canvasX) * 4;
      const r = frame.imageData.data[index];
      const g = frame.imageData.data[index + 1];
      const b = frame.imageData.data[index + 2];
      
      const hexColor = ColorMatcher.rgbToHex(r, g, b);
      handleColorChange(hexColor);
    }
    
    setIsEyedropperActive(false);
  }, [previewFrames, frameIndex, handleColorChange]);
  
  // Draw the preview canvas with green overlay for matched pixels
  useEffect(() => {
    if (!previewCanvasRef.current || previewFrames.length === 0 || !isOpen) return;
    
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const frame = previewFrames[frameIndex];
    if (!frame || !frame.imageData) return;
    
    // Character aspect ratio - characters are 0.6x as wide as they are tall
    // This means each "pixel" in the ASCII grid is taller than it is wide
    // To display the preview correctly matching the original video aspect ratio,
    // we need to make pixels taller than wide (stretch height, not width)
    
    const charWidth = frame.imageData.width;
    const charHeight = frame.imageData.height;
    
    // Set canvas display size to show correct aspect ratio
    // Each pixel should appear taller than wide (1:1.67 ratio, or height = width / 0.6)
    canvas.width = charWidth;
    canvas.height = Math.round(charHeight / 0.6);
    
    // Create a copy of the image data to modify
    const displayData = new ImageData(
      new Uint8ClampedArray(frame.imageData.data),
      frame.imageData.width,
      frame.imageData.height
    );
    
    // If color keying is enabled, overlay green on matched pixels
    if (enableColorAsAlpha) {
      for (let i = 0; i < displayData.data.length; i += 4) {
        const r = displayData.data[i];
        const g = displayData.data[i + 1];
        const b = displayData.data[i + 2];
        
        // Check if this pixel matches the color key within tolerance
        const matches = ColorMatcher.matchesColorKey(r, g, b, colorAsAlphaKey, colorAsAlphaTolerance);
        
        if (matches) {
          // Overlay bright green to show matched pixels
          displayData.data[i] = 0;       // R
          displayData.data[i + 1] = 255; // G
          displayData.data[i + 2] = 0;   // B
          // Keep alpha as-is
        }
      }
    }
    
    // Draw the modified image data scaled to fit the aspect-ratio-corrected canvas
    // First put original data on a temp canvas, then draw scaled
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = frame.imageData.width;
    tempCanvas.height = frame.imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(displayData, 0, 0);
      // Draw scaled to fit the aspect-corrected canvas
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    }
    
  }, [previewFrames, frameIndex, isOpen, enableColorAsAlpha, colorAsAlphaKey, colorAsAlphaTolerance]);
  
  // Handle ESC key to exit eyedropper mode
  useEffect(() => {
    if (!isEyedropperActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEyedropperActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEyedropperActive]);
  
  const hasPreviewFrame = previewFrames.length > 0 && previewFrames[frameIndex]?.imageData;

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start gap-2 h-8 px-2 hover:bg-accent/50"
            >
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Transparency</span>
              <ChevronDown 
                className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
          
          <Checkbox
            checked={enableColorAsAlpha}
            onCheckedChange={handleToggleEnabled}
            className="flex-shrink-0"
          />
        </div>
        
        <CollapsibleContent className="collapsible-content">
          <div className="px-3 pb-3">
            {!enableColorAsAlpha && (
              <div className="p-3 border border-border/50 rounded-lg bg-muted/20">
                <p className="text-xs text-muted-foreground text-center">
                  Color keying is disabled. Enable to make a color transparent.
                </p>
              </div>
            )}
            
            {enableColorAsAlpha && (
              <Card className="bg-card/30 border-border/50">
                <CardContent className="p-3 space-y-3">
                  {/* Source Preview Canvas - Click to sample color */}
                  {hasPreviewFrame && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Source Preview</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant={isEyedropperActive ? "default" : "outline"}
                                size="sm"
                                onClick={() => setIsEyedropperActive(!isEyedropperActive)}
                                className="h-6 px-2 gap-1"
                              >
                                <Pipette className="h-3 w-3" />
                                <span className="text-xs">Pick</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{isEyedropperActive ? 'Click image to sample color' : 'Enable color sampling'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div 
                        className={`relative w-full bg-black/50 rounded overflow-hidden border-2 ${
                          isEyedropperActive ? 'border-primary' : 'border-transparent'
                        }`}
                      >
                        <canvas
                          ref={previewCanvasRef}
                          onClick={handleCanvasClick}
                          className={`w-full h-auto block ${isEyedropperActive ? 'cursor-crosshair' : 'cursor-pointer'}`}
                          style={{ imageRendering: 'pixelated' }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isEyedropperActive 
                          ? 'Click to sample a color. Green pixels will be transparent.'
                          : 'Green areas show pixels that will be transparent. Click "Pick" to sample a color.'}
                      </p>
                    </div>
                  )}
                  
                  {!hasPreviewFrame && (
                    <div className="p-3 border border-border/50 rounded-lg bg-muted/20">
                      <p className="text-xs text-muted-foreground text-center">
                        Process a file to see the transparency preview
                      </p>
                    </div>
                  )}
                  
                  {/* Color Selection */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Alpha Key Color</Label>
                    <Button
                      variant="outline"
                      onClick={handleColorPickerOpen}
                      className="w-full h-8 justify-start gap-2 px-2"
                    >
                      <div 
                        className="w-4 h-4 rounded border border-border"
                        style={{ backgroundColor: colorAsAlphaKey }}
                      />
                      <span className="text-xs font-mono">{colorAsAlphaKey}</span>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Pixels matching this color will be transparent in the output
                    </p>
                  </div>

                  {/* Tolerance Slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Tolerance</Label>
                      <span className="text-xs text-muted-foreground">{colorAsAlphaTolerance}</span>
                    </div>
                    <Slider
                      value={colorAsAlphaTolerance}
                      onValueChange={handleToleranceChange}
                      min={0}
                      max={255}
                      step={1}
                      className="w-full"
                      disabled={!enableColorAsAlpha}
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher values match similar colors (0 = exact match)
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Color Picker Overlay */}
      <ColorPickerOverlay
        isOpen={isColorPickerOpen}
        onOpenChange={setIsColorPickerOpen}
        initialColor={colorAsAlphaKey}
        onColorSelect={handleColorPickerSelect}
        title="Select Alpha Key Color"
        anchorPosition="import-media-panel"
      />
    </>
  );
}
