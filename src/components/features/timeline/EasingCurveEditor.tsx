/**
 * EasingCurveEditor — Visual cubic bezier easing editor with presets.
 * 
 * Renders an interactive SVG canvas for editing custom cubic bezier curves,
 * plus preset buttons for common easing types.
 * 
 * Phase 3, §3.11
 */
import React, { useCallback, useRef, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EasingCurve, EasingPreset } from '@/types/timeline';
import { EASING_PRESETS } from '@/types/timeline';

// ─── Props ─────────────────────────────────────────────────────────
export interface EasingCurveEditorProps {
  value: EasingCurve;
  onChange: (curve: EasingCurve) => void;
  className?: string;
}

// ─── Constants ─────────────────────────────────────────────────────
const SVG_SIZE = 160;
const PADDING = 16;
const GRAPH_SIZE = SVG_SIZE - PADDING * 2;
const HANDLE_RADIUS = 5;

/** Ordered preset buttons */
const PRESET_ORDER: EasingPreset[] = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'ease-out-back',
  'ease-in-back',
  'bounce',
  'hold',
];

/** Friendly labels for presets */
const PRESET_LABELS: Record<EasingPreset, string> = {
  'linear': 'Linear',
  'hold': 'Hold',
  'ease-in': 'Ease In',
  'ease-out': 'Ease Out',
  'ease-in-out': 'Ease In-Out',
  'ease-out-back': 'Overshoot Out',
  'ease-in-back': 'Overshoot In',
  'bounce': 'Bounce',
};

// ─── Helpers ───────────────────────────────────────────────────────

/** Convert normalized coordinates (0-1 range, y can exceed) to SVG pixel coords */
function toSvg(nx: number, ny: number): { x: number; y: number } {
  return {
    x: PADDING + nx * GRAPH_SIZE,
    y: PADDING + (1 - ny) * GRAPH_SIZE, // Y is inverted in SVG
  };
}

/** Convert SVG pixel coords back to normalized coordinates */
function fromSvg(sx: number, sy: number): { nx: number; ny: number } {
  return {
    nx: Math.max(0, Math.min(1, (sx - PADDING) / GRAPH_SIZE)),
    ny: 1 - (sy - PADDING) / GRAPH_SIZE, // Allow values outside 0-1 for overshoot
  };
}

/** Get the bezier control points from an EasingCurve */
function getControlPoints(curve: EasingCurve): [number, number, number, number] {
  if (curve.type === 'custom') {
    return [curve.x1 ?? 0.42, curve.y1 ?? 0, curve.x2 ?? 0.58, curve.y2 ?? 1];
  }
  return EASING_PRESETS[curve.type] ?? EASING_PRESETS.linear;
}

/** Generate SVG path for a cubic bezier curve */
function buildCurvePath(cp: [number, number, number, number]): string {
  const start = toSvg(0, 0);
  const c1 = toSvg(cp[0], cp[1]);
  const c2 = toSvg(cp[2], cp[3]);
  const end = toSvg(1, 1);
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

/** Small preview path for preset buttons */
function buildMiniPath(cp: [number, number, number, number], size: number): string {
  const p = 2; // mini padding
  const g = size - p * 2;
  const sx = (nx: number, ny: number) => ({
    x: p + nx * g,
    y: p + (1 - ny) * g,
  });
  const s = sx(0, 0);
  const c1 = sx(cp[0], cp[1]);
  const c2 = sx(cp[2], cp[3]);
  const e = sx(1, 1);
  return `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`;
}

// ─── Component ─────────────────────────────────────────────────────
export const EasingCurveEditor: React.FC<EasingCurveEditorProps> = ({
  value,
  onChange,
  className,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<'cp1' | 'cp2' | null>(null);

  const controlPoints = useMemo(() => getControlPoints(value), [value]);
  const isCustom = value.type === 'custom';

  // ─── Control point SVG positions ───
  const cp1Svg = useMemo(() => toSvg(controlPoints[0], controlPoints[1]), [controlPoints]);
  const cp2Svg = useMemo(() => toSvg(controlPoints[2], controlPoints[3]), [controlPoints]);
  const startSvg = useMemo(() => toSvg(0, 0), []);
  const endSvg = useMemo(() => toSvg(1, 1), []);

  // ─── Curve path ───
  const curvePath = useMemo(() => buildCurvePath(controlPoints), [controlPoints]);

  // ─── Drag handling ───
  const getSvgPoint = useCallback((e: React.MouseEvent | MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handleMouseDown = useCallback((cp: 'cp1' | 'cp2') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(cp);

    const handleMouseMove = (me: MouseEvent) => {
      const point = getSvgPoint(me);
      // Use fromSvg — x is clamped 0-1, y can exceed for overshoot
      const { nx, ny } = fromSvg(point.x, point.y);
      // Clamp y to reasonable range (-0.5 to 1.5)
      const clampedY = Math.max(-0.5, Math.min(1.5, ny));

      if (cp === 'cp1') {
        onChange({
          type: 'custom',
          x1: nx,
          y1: clampedY,
          x2: controlPoints[2],
          y2: controlPoints[3],
        });
      } else {
        onChange({
          type: 'custom',
          x1: controlPoints[0],
          y1: controlPoints[1],
          x2: nx,
          y2: clampedY,
        });
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [controlPoints, getSvgPoint, onChange]);

  // ─── Preset selection ───
  const handlePresetClick = useCallback((preset: EasingPreset) => {
    onChange({ type: preset });
  }, [onChange]);

  // ─── Active preset detection ───
  const activePreset = useMemo((): EasingPreset | null => {
    if (value.type !== 'custom') return value.type;
    // Check if custom values match any preset
    for (const [name, points] of Object.entries(EASING_PRESETS)) {
      if (
        Math.abs(controlPoints[0] - points[0]) < 0.01 &&
        Math.abs(controlPoints[1] - points[1]) < 0.01 &&
        Math.abs(controlPoints[2] - points[2]) < 0.01 &&
        Math.abs(controlPoints[3] - points[3]) < 0.01
      ) {
        return name as EasingPreset;
      }
    }
    return null;
  }, [value.type, controlPoints]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* SVG Curve Editor */}
      <div className="rounded-md border border-border bg-background/50 p-1">
        <svg
          ref={svgRef}
          width={SVG_SIZE}
          height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          className="select-none"
        >
          {/* Grid */}
          <rect
            x={PADDING}
            y={PADDING}
            width={GRAPH_SIZE}
            height={GRAPH_SIZE}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.1}
          />
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((t) => {
            const pos = PADDING + t * GRAPH_SIZE;
            return (
              <g key={t}>
                <line
                  x1={pos} y1={PADDING}
                  x2={pos} y2={PADDING + GRAPH_SIZE}
                  stroke="currentColor" strokeOpacity={0.05}
                />
                <line
                  x1={PADDING} y1={pos}
                  x2={PADDING + GRAPH_SIZE} y2={pos}
                  stroke="currentColor" strokeOpacity={0.05}
                />
              </g>
            );
          })}
          {/* Diagonal reference line (linear) */}
          <line
            x1={startSvg.x} y1={startSvg.y}
            x2={endSvg.x} y2={endSvg.y}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeDasharray="3 3"
          />
          {/* Bezier curve */}
          <path
            d={curvePath}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeLinecap="round"
          />
          {/* Control point handles (lines from endpoints to control points) */}
          <line
            x1={startSvg.x} y1={startSvg.y}
            x2={cp1Svg.x} y2={cp1Svg.y}
            stroke="hsl(var(--primary))"
            strokeOpacity={0.4}
            strokeWidth={1}
          />
          <line
            x1={endSvg.x} y1={endSvg.y}
            x2={cp2Svg.x} y2={cp2Svg.y}
            stroke="hsl(var(--primary))"
            strokeOpacity={0.4}
            strokeWidth={1}
          />
          {/* Start and end points */}
          <circle
            cx={startSvg.x} cy={startSvg.y}
            r={3}
            fill="currentColor"
            fillOpacity={0.3}
          />
          <circle
            cx={endSvg.x} cy={endSvg.y}
            r={3}
            fill="currentColor"
            fillOpacity={0.3}
          />
          {/* Control point 1 (draggable) */}
          <circle
            cx={cp1Svg.x}
            cy={cp1Svg.y}
            r={HANDLE_RADIUS}
            fill={dragging === 'cp1' ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.7)'}
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            className="cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown('cp1')}
          />
          {/* Control point 2 (draggable) */}
          <circle
            cx={cp2Svg.x}
            cy={cp2Svg.y}
            r={HANDLE_RADIUS}
            fill={dragging === 'cp2' ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.7)'}
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            className="cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown('cp2')}
          />
        </svg>
      </div>

      {/* Control point values (read-only display) */}
      {isCustom && (
        <div className="flex gap-2 text-[10px] text-muted-foreground font-mono px-1">
          <span>P1({controlPoints[0].toFixed(2)}, {controlPoints[1].toFixed(2)})</span>
          <span>P2({controlPoints[2].toFixed(2)}, {controlPoints[3].toFixed(2)})</span>
        </div>
      )}

      {/* Preset buttons */}
      <div className="grid grid-cols-4 gap-1">
        {PRESET_ORDER.map((preset) => {
          const points = EASING_PRESETS[preset];
          const isActive = activePreset === preset;
          return (
            <Button
              key={preset}
              variant={isActive ? 'secondary' : 'ghost'}
              size="sm"
              className={cn(
                'h-auto flex flex-col items-center gap-0.5 py-1 px-1',
                isActive && 'ring-1 ring-primary/50',
              )}
              onClick={() => handlePresetClick(preset)}
              title={PRESET_LABELS[preset]}
            >
              {/* Mini curve preview */}
              <svg width={24} height={24} viewBox="0 0 24 24">
                <path
                  d={buildMiniPath(points, 24)}
                  fill="none"
                  stroke={isActive ? 'hsl(var(--primary))' : 'currentColor'}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-[9px] leading-none truncate w-full text-center">
                {PRESET_LABELS[preset]}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};

export default EasingCurveEditor;
