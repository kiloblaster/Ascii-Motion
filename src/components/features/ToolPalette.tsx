import React from 'react';
import { useToolStore } from '../../stores/toolStore';
import { useCanvasStore } from '../../stores/canvasStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useGradientStore } from '../../stores/gradientStore';
import { useBezierStore } from '../../stores/bezierStore';
import { useCropToSelection } from '../../hooks/useCropToSelection';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GradientIcon } from '../icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AUTOFILL_PALETTES } from '../../constants/bezierAutofill';
import type { BezierCloseShapeHistoryAction } from '../../types';
import {
  PenTool,
  Eraser, 
  PaintBucket, 
  Pipette, 
  Square,
  Circle,
  Lasso,
  Type,
  Wand2,
  Palette,
  Move,
  MoveHorizontal,
  MoveVertical,
  TypeOutline,
  Grid2x2,
  Brush,
  Crop,
  Copy,
  Clipboard,
  Undo2,
  Redo2,
  Trash2,
  Minus,
  MoreVertical,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { Tool } from '../../types';
import { getToolTooltipText } from '../../constants/hotkeys';

interface ToolPaletteProps {
  className?: string;
}

// Custom dashed rectangle icon for selection tool
const DashedRectangleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    className={className}
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2"
  >
    <rect 
      x="3" 
      y="3" 
      width="18" 
      height="18" 
      strokeDasharray="3 3"
      fill="none"
    />
  </svg>
);

// Organized tools by category
const DRAWING_TOOLS: Array<{ id: Tool; name: string; icon: React.ReactNode; description: string }> = [
  { id: 'pencil', name: 'Brush', icon: <Brush className="w-3 h-3" />, description: 'Draw characters' },
  { id: 'eraser', name: 'Eraser', icon: <Eraser className="w-3 h-3" />, description: 'Remove characters' },
  { id: 'beziershape', name: 'Bezier Pen Tool', icon: <PenTool className="w-3 h-3" />, description: 'Draw bezier vector shapes' },
  { id: 'text', name: 'Text', icon: <Type className="w-3 h-3" />, description: 'Type text directly' },
  { id: 'paintbucket', name: 'Fill', icon: <PaintBucket className="w-3 h-3" />, description: 'Fill connected areas' },
  { id: 'gradientfill', name: 'Gradient', icon: <GradientIcon className="w-3 h-3" />, description: 'Apply gradient fills' },
  { id: 'rectangle', name: 'Rectangle', icon: <Square className="w-3 h-3" />, description: 'Draw rectangles' },
  { id: 'ellipse', name: 'Ellipse', icon: <Circle className="w-3 h-3" />, description: 'Draw ellipses/circles' },
  { id: 'asciibox', name: 'ASCII Box', icon: <Grid2x2 className="w-3 h-3" />, description: 'Draw boxes and tables' },
  { id: 'asciitype', name: 'ASCII Type', icon: <TypeOutline className="w-3 h-3" />, description: 'Create ASCII text' },
];

const SELECTION_TOOLS: Array<{ id: Tool; name: string; icon: React.ReactNode; description: string }> = [
  { id: 'select', name: 'Select', icon: <DashedRectangleIcon className="w-3 h-3" />, description: 'Select rectangular areas' },
  { id: 'lasso', name: 'Lasso', icon: <Lasso className="w-3 h-3" />, description: 'Freeform selection tool' },
  { id: 'magicwand', name: 'Magic Wand', icon: <Wand2 className="w-3 h-3" />, description: 'Select matching cells' },
];

const UTILITY_TOOLS: Array<{ id: Tool; name: string; icon: React.ReactNode; description: string }> = [
  { id: 'eyedropper', name: 'Eyedropper', icon: <Pipette className="w-3 h-3" />, description: 'Pick character/color' },
  { id: 'fliphorizontal', name: 'Flip H (Shift+H)', icon: <MoveHorizontal className="w-3 h-3" />, description: 'Flip horizontally (Shift+H)' },
  { id: 'flipvertical', name: 'Flip V (Shift+V)', icon: <MoveVertical className="w-3 h-3" />, description: 'Flip vertically (Shift+V)' },
  { id: 'layertransform', name: 'Layer Transform', icon: <Move className="w-3 h-3" />, description: 'Layer Transform tool' },
];

export const ToolPalette: React.FC<ToolPaletteProps> = ({ className = '' }) => {
  // PERF FIX: Only subscribe to `activeTool` reactively here. All other
  // toolStore properties are read inside the memoized ToolOptionsPanel below,
  // which only re-renders when the active tool changes — not on every
  // unrelated toolStore mutation (isProcessingHistory, brush settings, etc.)
  const activeTool = useToolStore((s) => s.activeTool);
  const setActiveTool = useToolStore((s) => s.setActiveTool);
  
  // For action button disabled states
  const historyPosition = useToolStore((s) => s.historyPosition);
  const historyLength = useToolStore((s) => s.historyStack.length);
  const hasSelection = useToolStore((s) => s.selection.active || s.lassoSelection.active || s.magicWandSelection.active);
  const hasClipboard = useToolStore((s) => s.hasClipboard());
  const canUndo = historyPosition >= 0;
  const canRedo = historyPosition < historyLength - 1;

  // Calculate effective tool
  // PERF FIX: Removed altKeyDown/ctrlKeyDown from context — they caused this
  // 828-line component to re-render on every Alt/Ctrl keypress. The visual
  // tool override indicator is not worth the cost.
  const effectiveTool = activeTool;

  const handleToolClick = (tool: { id: Tool; name: string; icon: React.ReactNode; description: string }) => {
    // Handle flip utilities via keyboard shortcut dispatch
    if (tool.id === 'fliphorizontal') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'H', shiftKey: true, bubbles: true }));
      return;
    }
    if (tool.id === 'flipvertical') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', shiftKey: true, bubbles: true }));
      return;
    }
    
    // Default tool switching behavior
    setActiveTool(tool.id);
  };

  const ToolButton: React.FC<{ tool: { id: Tool; name: string; icon: React.ReactNode; description: string } }> = ({ tool }) => {
    // Tools use default tabIndex (0) to come after header and frames but in natural DOM order
    const tabIndex = 0;
    
    return (
      <Tooltip key={tool.id}>
        <TooltipTrigger asChild>
          <Button
            variant={effectiveTool === tool.id ? 'default' : 'outline'}
            size="sm"
            className="h-8 w-8 p-0 touch-manipulation"
            onClick={() => handleToolClick(tool)}
            aria-label={`${tool.name} tool - ${tool.description}`}
            aria-pressed={effectiveTool === tool.id}
            tabIndex={tabIndex}
          >
            {tool.icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="text-xs">{getToolTooltipText(tool.id, tool.name)}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider>
      <div className={`${className}`} style={{ direction: 'ltr' }}>
        <div className="px-2 pt-0.5 pb-1 space-y-2">
          {/* Drawing Tools Section */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">Drawing</h4>
            <div className="grid grid-cols-2 gap-1" role="toolbar" aria-label="Drawing tools">
              {DRAWING_TOOLS.map((tool) => (
                <ToolButton key={tool.id} tool={tool} />
              ))}
            </div>
          </div>

          {/* Selection Tools Section */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">Selection</h4>
            <div className="grid grid-cols-2 gap-1" role="toolbar" aria-label="Selection tools">
              {SELECTION_TOOLS.map((tool) => (
                <ToolButton key={tool.id} tool={tool} />
              ))}
            </div>
          </div>

          {/* Utility Tools Section */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">Utility</h4>
            <div className="grid grid-cols-2 gap-1" role="toolbar" aria-label="Utility tools">
              {UTILITY_TOOLS.map((tool) => (
                <ToolButton key={tool.id} tool={tool} />
              ))}
            </div>
          </div>

          {/* Actions Section */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">Actions</h4>
            <div className="grid grid-cols-2 gap-1" role="toolbar" aria-label="Action buttons">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0 touch-manipulation"
                          disabled={!canUndo}
                          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }))}>
                          <Undo2 className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right"><p className="text-xs">Undo (⌘Z)</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0 touch-manipulation"
                          disabled={!canRedo}
                          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true }))}>
                          <Redo2 className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right"><p className="text-xs">Redo (⌘⇧Z)</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0 touch-manipulation"
                          disabled={!hasSelection}
                          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }))}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right"><p className="text-xs">Copy (⌘C)</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0 touch-manipulation"
                          disabled={!hasClipboard}
                          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true }))}>
                          <Clipboard className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right"><p className="text-xs">Paste (⌘V)</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0 touch-manipulation text-destructive hover:text-destructive"
                          onClick={() => { useToolStore.getState().pushCanvasHistory(new Map(useCanvasStore.getState().cells), useTimelineStore.getState().view.currentFrame, 'Clear canvas'); useCanvasStore.getState().clearCanvas(); }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right"><p className="text-xs">Clear canvas</p></TooltipContent>
                    </Tooltip>
            </div>
          </div>
        </div>

        {/* Separator between Tools and Tool Options - removed, options now in canvas header */}
      </div>
    </TooltipProvider>
  );
};

/**
 * PERF FIX: Memoized tool options panel.
 * Subscribes to its own store slices independently from the parent ToolPalette.
 * Only re-renders when activeTool changes or when the specific tool's settings change.
 * 
 * Now exported for use in the canvas header horizontal bar.
 */
export const ToolOptionsPanel = React.memo(({ activeTool }: { activeTool: Tool }) => {
  const { rectangleFilled, setRectangleFilled, paintBucketContiguous, setPaintBucketContiguous, magicWandContiguous, setMagicWandContiguous, toolAffectsChar, toolAffectsColor, toolAffectsBgColor, eyedropperPicksChar, eyedropperPicksColor, eyedropperPicksBgColor, setToolAffectsChar, setToolAffectsColor, setToolAffectsBgColor, setEyedropperPicksChar, setEyedropperPicksColor, setEyedropperPicksBgColor, fillMatchChar, fillMatchColor, fillMatchBgColor, setFillMatchChar, setFillMatchColor, setFillMatchBgColor, magicMatchChar, magicMatchColor, magicMatchBgColor, setMagicMatchChar, setMagicMatchColor, setMagicMatchBgColor, pushToHistory, layerTransformAutoKeyframe, selection: _selection, lassoSelection: _lassoSelection, magicWandSelection: _magicWandSelection, selectionAffectsAllLayers, setSelectionAffectsAllLayers } = useToolStore();
  const { contiguous, matchChar, matchColor, matchBgColor, setContiguous, setMatchCriteria } = useGradientStore();
  const { fillMode, autofillPaletteId, setFillMode, setAutofillPaletteId, fillColorMode, setFillColorMode, strokeWidth, strokeTaperStart, strokeTaperEnd, setStrokeWidth, setStrokeTaperStart, setStrokeTaperEnd, isClosed, toggleClosedShape, lineArtEdgeThreshold, lineArtSdfBlur, lineArtInverseMatch, setLineArtEdgeThreshold, setLineArtSdfBlur, setLineArtInverseMatch } = useBezierStore();
  const { canCrop, cropToSelection } = useCropToSelection();

  const effectiveTool = activeTool;

  const handleCloseShapeToggle = (checked: boolean) => {
    const wasClosed = isClosed;
    toggleClosedShape();
    const closeAction: BezierCloseShapeHistoryAction = {
      type: 'bezier_close_shape',
      timestamp: Date.now(),
      description: checked ? 'Close bezier shape' : 'Open bezier shape',
      data: { wasClosed, nowClosed: checked, frameIndex: useTimelineStore.getState().view.currentFrame },
    };
    pushToHistory(closeAction);
  };

  const getCurrentToolIcon = () => {
    const allTools = [...DRAWING_TOOLS, ...SELECTION_TOOLS, ...UTILITY_TOOLS];
    const currentTool = allTools.find(tool => tool.id === effectiveTool);
    return currentTool?.icon || null;
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {/* Tool name indicator */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {getCurrentToolIcon()}
        <span className="font-medium">{
          effectiveTool === 'pencil' ? 'Pencil' :
          effectiveTool === 'eraser' ? 'Eraser' :
          effectiveTool === 'paintbucket' ? 'Fill' :
          effectiveTool === 'gradientfill' ? 'Gradient' :
          effectiveTool === 'rectangle' ? 'Rectangle' :
          effectiveTool === 'ellipse' ? 'Ellipse' :
          effectiveTool === 'magicwand' ? 'Magic Wand' :
          effectiveTool === 'select' ? 'Selection' :
          effectiveTool === 'lasso' ? 'Lasso' :
          effectiveTool === 'eyedropper' ? 'Eyedropper' :
          effectiveTool === 'beziershape' ? 'Bezier Pen' :
          effectiveTool === 'layertransform' ? 'Layer Transform' :
          effectiveTool === 'text' ? 'Text' :
          effectiveTool === 'asciitype' ? 'ASCII Type' :
          effectiveTool === 'asciibox' ? 'ASCII Box' :
          'Tool'
        }</span>
      </div>

      {/* Divider — only when tool has options */}
      {['rectangle', 'ellipse', 'paintbucket', 'gradientfill', 'magicwand', 'pencil', 'eraser', 'eyedropper', 'beziershape', 'select', 'lasso', 'layertransform'].includes(effectiveTool) && (
        <div className="w-px h-5 bg-border/50" />
      )}

      {/* Rectangle/Ellipse: Filled toggle */}
      {(effectiveTool === 'rectangle' || effectiveTool === 'ellipse') && (
        <div className="flex items-center gap-1.5">
          <Label htmlFor="filled-toggle" className="text-xs cursor-pointer text-muted-foreground">Filled</Label>
          <Switch id="filled-toggle" checked={rectangleFilled} onCheckedChange={setRectangleFilled} className="scale-75" />
        </div>
      )}

      {/* Paint bucket: Contiguous + Match criteria + Affects */}
      {effectiveTool === 'paintbucket' && (
        <>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Contiguous</Label>
            <Switch checked={paintBucketContiguous} onCheckedChange={setPaintBucketContiguous} className="scale-75" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Match:</span>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={fillMatchChar ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setFillMatchChar(!fillMatchChar)}><Type className="h-3 w-3" /></Button>
            </TooltipTrigger><TooltipContent><p>Match character</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={fillMatchColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setFillMatchColor(!fillMatchColor)}><Palette className="h-3 w-3" /></Button>
            </TooltipTrigger><TooltipContent><p>Match text color</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={fillMatchBgColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setFillMatchBgColor(!fillMatchBgColor)}><Square className="h-3 w-3 fill-current" /></Button>
            </TooltipTrigger><TooltipContent><p>Match background color</p></TooltipContent></Tooltip>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Affects:</span>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={toolAffectsChar ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setToolAffectsChar(!toolAffectsChar)}><Type className="h-3 w-3" /></Button>
            </TooltipTrigger><TooltipContent><p>Affect character</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={toolAffectsColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setToolAffectsColor(!toolAffectsColor)}><Palette className="h-3 w-3" /></Button>
            </TooltipTrigger><TooltipContent><p>Affect text color</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={toolAffectsBgColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setToolAffectsBgColor(!toolAffectsBgColor)}><Square className="h-3 w-3 fill-current" /></Button>
            </TooltipTrigger><TooltipContent><p>Affect background color</p></TooltipContent></Tooltip>
          </div>
        </>
      )}

      {/* Gradient fill: Contiguous + Match criteria */}
      {effectiveTool === 'gradientfill' && (
        <>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Contiguous</Label>
            <Switch checked={contiguous} onCheckedChange={setContiguous} className="scale-75" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Match:</span>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={matchChar ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setMatchCriteria({ char: !matchChar, color: matchColor, bgColor: matchBgColor })}><Type className="h-3 w-3" /></Button>
            </TooltipTrigger><TooltipContent><p>Match character</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={matchColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setMatchCriteria({ char: matchChar, color: !matchColor, bgColor: matchBgColor })}><Palette className="h-3 w-3" /></Button>
            </TooltipTrigger><TooltipContent><p>Match text color</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={matchBgColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setMatchCriteria({ char: matchChar, color: matchColor, bgColor: !matchBgColor })}><Square className="h-3 w-3 fill-current" /></Button>
            </TooltipTrigger><TooltipContent><p>Match background color</p></TooltipContent></Tooltip>
          </div>
        </>
      )}

      {/* Magic wand: Contiguous + Match criteria */}
      {effectiveTool === 'magicwand' && (
        <>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Contiguous</Label>
            <Switch checked={magicWandContiguous} onCheckedChange={setMagicWandContiguous} className="scale-75" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Match:</span>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={magicMatchChar ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setMagicMatchChar(!magicMatchChar)}><Type className="h-3 w-3" /></Button>
            </TooltipTrigger><TooltipContent><p>Match character</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={magicMatchColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setMagicMatchColor(!magicMatchColor)}><Palette className="h-3 w-3" /></Button>
            </TooltipTrigger><TooltipContent><p>Match text color</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={magicMatchBgColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setMagicMatchBgColor(!magicMatchBgColor)}><Square className="h-3 w-3 fill-current" /></Button>
            </TooltipTrigger><TooltipContent><p>Match background color</p></TooltipContent></Tooltip>
          </div>
        </>
      )}

      {/* Selection tools: All Layers + Crop */}
      {(effectiveTool === 'select' || effectiveTool === 'lasso' || effectiveTool === 'magicwand') && (
        <>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">All Layers</Label>
            <Switch checked={selectionAffectsAllLayers} onCheckedChange={setSelectionAffectsAllLayers} className="scale-75" />
          </div>
          <Tooltip><TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1" onClick={cropToSelection} disabled={!canCrop()}>
              <Crop className="w-3 h-3" /> Crop
            </Button>
          </TooltipTrigger><TooltipContent><p>Crop canvas to selection (⌘⇧X)</p></TooltipContent></Tooltip>
        </>
      )}

      {/* Pencil/Eraser: Affects + Brush inline */}
      {(effectiveTool === 'pencil' || effectiveTool === 'eraser') && (
        <>
          {/* Inline brush size + shape */}
          {(() => {
            const brushTool = effectiveTool === 'eraser' ? 'eraser' : 'pencil' as const;
            const bs = useToolStore.getState().brushSettings[brushTool];
            return (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{brushTool === 'eraser' ? 'Eraser' : 'Brush'} Size:</span>
                  <Slider min={1} max={20} step={1} value={bs.size} onValueChange={(v) => { useToolStore.getState().setBrushSize(v, brushTool); useToolStore.getState().showBrushSizePreview(); }} className="w-16" />
                  <span className="text-[10px] text-muted-foreground tabular-nums w-4">{bs.size}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">Shape:</span>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant={bs.shape === 'circle' ? 'default' : 'outline'} size="sm" className="h-6 w-6 p-0" onClick={() => useToolStore.getState().setBrushShape('circle', brushTool)}><Circle className="h-3 w-3" /></Button>
                  </TooltipTrigger><TooltipContent><p>Circle brush</p></TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant={bs.shape === 'square' ? 'default' : 'outline'} size="sm" className="h-6 w-6 p-0" onClick={() => useToolStore.getState().setBrushShape('square', brushTool)}><Square className="h-3 w-3" /></Button>
                  </TooltipTrigger><TooltipContent><p>Square brush</p></TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant={bs.shape === 'horizontal' ? 'default' : 'outline'} size="sm" className="h-6 w-6 p-0" onClick={() => useToolStore.getState().setBrushShape('horizontal', brushTool)}><Minus className="h-3 w-3" /></Button>
                  </TooltipTrigger><TooltipContent><p>Horizontal line brush</p></TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant={bs.shape === 'vertical' ? 'default' : 'outline'} size="sm" className="h-6 w-6 p-0" onClick={() => useToolStore.getState().setBrushShape('vertical', brushTool)}><MoreVertical className="h-3 w-3" /></Button>
                  </TooltipTrigger><TooltipContent><p>Vertical line brush</p></TooltipContent></Tooltip>
                </div>
              </>
            );
          })()}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Affects:</span>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={toolAffectsChar ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setToolAffectsChar(!toolAffectsChar)}><Type className="h-3 w-3" /></Button>
            </TooltipTrigger><TooltipContent><p>Affect character</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={toolAffectsColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setToolAffectsColor(!toolAffectsColor)}><Palette className="h-3 w-3" /></Button>
            </TooltipTrigger><TooltipContent><p>Affect text color</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant={toolAffectsBgColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setToolAffectsBgColor(!toolAffectsBgColor)}><Square className="h-3 w-3 fill-current" /></Button>
            </TooltipTrigger><TooltipContent><p>Affect background color</p></TooltipContent></Tooltip>
          </div>
        </>
      )}

      {/* Eyedropper: Picks */}
      {effectiveTool === 'eyedropper' && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Picks:</span>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={eyedropperPicksChar ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setEyedropperPicksChar(!eyedropperPicksChar)}><Type className="h-3 w-3" /></Button>
          </TooltipTrigger><TooltipContent><p>Pick character</p></TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={eyedropperPicksColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setEyedropperPicksColor(!eyedropperPicksColor)}><Palette className="h-3 w-3" /></Button>
          </TooltipTrigger><TooltipContent><p>Pick text color</p></TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={eyedropperPicksBgColor ? "default" : "outline"} size="sm" className="h-6 w-6 p-0" onClick={() => setEyedropperPicksBgColor(!eyedropperPicksBgColor)}><Square className="h-3 w-3 fill-current" /></Button>
          </TooltipTrigger><TooltipContent><p>Pick background color</p></TooltipContent></Tooltip>
        </div>
      )}

      {/* Bezier shape options */}
      {effectiveTool === 'beziershape' && (
        <>
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] text-muted-foreground">Char:</Label>
            <Select value={fillMode} onValueChange={(v) => setFillMode(v as 'constant' | 'palette' | 'autofill' | 'lineart')}>
              <SelectTrigger className="h-6 w-20 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="constant" className="text-xs">Selection</SelectItem>
                <SelectItem value="palette" className="text-xs">Palette</SelectItem>
                <SelectItem value="autofill" className="text-xs">Autofill</SelectItem>
                <SelectItem value="lineart" className="text-xs">Line Art</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {fillMode === 'autofill' && (
            <Select value={autofillPaletteId} onValueChange={setAutofillPaletteId}>
              <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue>{AUTOFILL_PALETTES.find(p => p.id === autofillPaletteId)?.name ?? 'Palette'}</SelectValue></SelectTrigger>
              <SelectContent>{AUTOFILL_PALETTES.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {fillMode !== 'lineart' && (
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] text-muted-foreground">Color:</Label>
            <Select value={fillColorMode} onValueChange={(v) => setFillColorMode(v as 'current' | 'palette')}>
              <SelectTrigger className="h-6 w-20 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current" className="text-xs">Current</SelectItem>
                <SelectItem value="palette" className="text-xs">Palette</SelectItem>
              </SelectContent>
            </Select>
          </div>
          )}
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] text-muted-foreground">Closed</Label>
            <Switch checked={isClosed} onCheckedChange={handleCloseShapeToggle} className="scale-75" tabIndex={-1} onKeyDown={(e) => { e.preventDefault(); e.stopPropagation(); }} />
          </div>
          {(!isClosed || fillMode === 'lineart') && (
            <>
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground">Width:</Label>
                <Slider min={0.1} max={10} step={0.1} value={strokeWidth} onValueChange={setStrokeWidth} className="w-16" />
                <span className="text-[10px] text-muted-foreground tabular-nums w-6">{strokeWidth.toFixed(1)}</span>
              </div>
              {!isClosed && (
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground">Taper:</Label>
                <Slider min={0} max={1} step={0.01} value={strokeTaperStart} onValueChange={setStrokeTaperStart} className="w-12" />
                <Slider min={0} max={1} step={0.01} value={strokeTaperEnd} onValueChange={setStrokeTaperEnd} className="w-12" />
              </div>
              )}
            </>
          )}
        </>
      )}

      {/* Layer Transform: Auto Keyframe */}
      {effectiveTool === 'layertransform' && (
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Auto Keyframe</Label>
          <Switch checked={layerTransformAutoKeyframe} onCheckedChange={(checked) => useToolStore.setState({ layerTransformAutoKeyframe: checked })} className="scale-75" />
        </div>
      )}
    </div>
  );
});

ToolOptionsPanel.displayName = 'ToolOptionsPanel';
