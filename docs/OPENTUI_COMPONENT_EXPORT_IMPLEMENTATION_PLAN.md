# OpenTUI Component Export Feature - Implementation Plan

**Date**: January 19, 2026  
**Feature**: OpenTUI Component Export for ASCII Motion Animations  
**Integration**: New export modality in existing Export system  
**Status**: ✅ COMPLETED

---

## 📋 Overview

Introduce an export format that outputs a self-contained TypeScript React component for **OpenTUI** (Terminal UI framework) capable of rendering ASCII Motion animations in the terminal. The component will use OpenTUI's React mode with `<box>` and `<text>` components.

### Key Requirements
- Export format: "OpenTUI Component" with subtitle "Terminal UI component"
- TypeScript-only output (`.tsx` file)
- React mode using `@opentui/react` with JSX components
- Data structure: separate `content` strings and `colors` dictionary (matching Ink export)
- Human-readable color theme dictionary for easy customization
- Frame-based animation with duration per frame using `setInterval`
- Dual theme support (dark/light backgrounds)
- Copy-friendly import/usage snippet
- Playback controls API (`play`, `pause`, `restart`) via `onReady` callback

---

## 🎯 Design Goals

### Why setInterval Instead of useTimeline?

OpenTUI's `useTimeline` hook is designed for **tweening animations** (smooth interpolation between values). Our ASCII animations require **discrete frame switching** with variable durations per frame. Using `setInterval` with `useEffect` provides:

1. **Variable frame durations**: Each frame can have its own timing (e.g., 100ms, 500ms, 50ms)
2. **Consistency with Ink export**: Same animation logic, easier maintenance
3. **Simpler code**: No need to coordinate timeline segments for discrete frames

### Data Structure (Matching Ink Export)

```typescript
type FrameData = {
  duration: number;      // ms - can vary per frame
  content: string[];     // Row strings for ASCII art
  fgColors: Record<string, string>;  // Position → color key
  bgColors: Record<string, string>;  // Position → color key
};
```

### Dual Theme Support

```typescript
// ANSI mode
const THEME_DARK: Record<string, string> = {
  cyan: 'cyan',
  magenta: 'magenta',
};

const THEME_LIGHT: Record<string, string> = {
  cyan: 'cyan',
  magenta: 'magenta',
};

// Hex mode
const COLORS_DARK: Record<string, string> = {
  c0: '#00ffff',
  c1: '#ff00ff',
};

const COLORS_LIGHT: Record<string, string> = {
  c0: '#004444',
  c1: '#440044',
};
```

---

## 🏗️ Architecture Integration

### Export System Flow
```
User selects "OpenTUI Component" → OpenTuiExportDialog → 
OpenTUI export settings in Zustand store → ExportRenderer.exportOpenTuiComponent() → 
File download (.tsx)
```

### Touchpoints

1. **Types** (`src/types/export.ts`)
   - Add `'opentui'` to `ExportFormatId`
   - Introduce `OpenTuiExportSettings` interface
   - Extend `ExportSettings` union and `ExportState`

2. **Store** (`src/stores/exportStore.ts`)
   - Add `OpenTuiExportSettings` import
   - Provide default settings and `setOpenTuiSettings` action
   - Add case for 'opentui' in `getCurrentSettings`

3. **UI**
   - `ExportImportButtons.tsx`: Add "OpenTUI Component" option with `Monitor` icon
   - `OpenTuiExportDialog.tsx` (new): Settings dialog matching InkExportDialog
   - `EditorPage.tsx`: Include dialog in render tree

4. **Renderer** (`src/utils/exportRenderer.ts`)
   - Implement `exportOpenTuiComponent(data, settings)`
   - Implement `generateOpenTuiComponentCode(options)`

5. **Test Project** (`dev-tools/opentui-test-cli/`)
   - Create test CLI project for validating exports

---

## 🧱 Type Definitions

### New Types in `src/types/export.ts`

```typescript
// Add to ExportFormatId
export type ExportFormatId = 
  | 'image' | 'video' | 'session' | 'text' | 'json' | 'html' | 'react' | 'ink'
  | 'opentui';  // NEW

// New interface
export interface OpenTuiExportSettings {
  fileName: string;
  includePlaybackControls: boolean;
  loopAnimation: boolean;
  colorMode: 'ansi' | 'hex';
}

// Add to ExportSettings union
export type ExportSettings = 
  | ImageExportSettings 
  | VideoExportSettings 
  // ... existing types
  | InkExportSettings
  | OpenTuiExportSettings;  // NEW

// Add to ExportState
export interface ExportState {
  // ... existing properties
  opentuiSettings: OpenTuiExportSettings;  // NEW
}
```

---

## 🎨 Generated Component Structure

### OpenTUI React Component Output

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"

// Dual theme dictionaries
const THEME_DARK: Record<string, string> = {
  cyanBright: 'cyanBright',
  // ...
};

const THEME_LIGHT: Record<string, string> = {
  cyanBright: 'cyan',
  // ...
};

type FrameData = {
  duration: number;
  content: string[];
  fgColors: Record<string, string>;
  bgColors: Record<string, string>;
};

type PlaybackAPI = {
  play: () => void;
  pause: () => void;
  restart: () => void;
};

type ComponentProps = {
  hasDarkBackground?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  onReady?: (api: PlaybackAPI) => void;
};

const FRAMES: FrameData[] = [ /* frame data */ ];

export const ComponentName: React.FC<ComponentProps> = ({
  hasDarkBackground = true,
  autoPlay = true,
  loop = true,
  onReady,
}) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  // ... animation logic using setInterval
  
  const theme = useMemo(() => 
    hasDarkBackground ? THEME_DARK : THEME_LIGHT, 
    [hasDarkBackground]
  );
  
  const getColor = useCallback((key: string) => theme[key] || key, [theme]);
  
  return (
    <box flexDirection="column">
      {frame.content.map((row, y) => (
        <text key={y}>
          {row.split("").map((char, x) => {
            const fg = getColor(frame.fgColors[`${x},${y}`]) || defaultFg;
            const bg = frame.bgColors[`${x},${y}`] ? getColor(frame.bgColors[`${x},${y}`]) : undefined;
            return (
              <span key={x} fg={fg} bg={bg}>{char}</span>
            );
          })}
        </text>
      ))}
    </box>
  );
};

// Usage example at bottom of file
// const renderer = await createCliRenderer()
// createRoot(renderer).render(<ComponentName />)
```

### Key Differences from Ink Export

| Aspect | Ink | OpenTUI |
|--------|-----|---------|
| Import | `import { render } from 'ink'` | `import { createCliRenderer } from '@opentui/core'`<br>`import { createRoot } from '@opentui/react'` |
| Render | `render(<Component />)` | `createRoot(renderer).render(<Component />)` |
| Box | `<Box>` | `<box>` |
| Text | `<Text color={} backgroundColor={}>` | `<text><span fg={} bg={}></span></text>` |
| Color props | `color`, `backgroundColor` | `fg`, `bg` |

---

## 🖥️ UI: OpenTuiExportDialog

### Dialog Components (matching InkExportDialog)

1. **Filename Input** - Component file name with `.tsx` suffix
2. **Color Mode Select** - ANSI (semantic) vs Hex (exact)
3. **Loop Animation Switch** - Enable/disable looping
4. **Include Playback Controls Switch** - Expose `onReady` API
5. **Usage Snippet** - Copy-ready import/render code
6. **Dependencies Card** - `npm install @opentui/core @opentui/react react`
7. **Export Summary** - Frame count, canvas size, colors, etc.

---

## 📁 Test Project Structure

### `dev-tools/opentui-test-cli/`

```
opentui-test-cli/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    └── cli.tsx
```

### package.json

```json
{
  "name": "opentui-test-cli",
  "type": "module",
  "scripts": {
    "dev": "tsx src/cli.tsx",
    "test:dark": "tsx src/cli.tsx --dark",
    "test:light": "tsx src/cli.tsx --light"
  },
  "dependencies": {
    "@opentui/core": "^0.1.69",
    "@opentui/react": "^0.1.69",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.2"
  }
}
```

---

## 📋 Implementation Phases

### Phase 1: Types & Store
- [ ] Add `'opentui'` to `ExportFormatId`
- [ ] Create `OpenTuiExportSettings` interface
- [ ] Add `opentuiSettings` to `ExportState`
- [ ] Add default settings and `setOpenTuiSettings` action to store
- [ ] Add 'opentui' case to `getCurrentSettings`

### Phase 2: UI Components
- [ ] Add "OpenTUI Component" to `EXPORT_OPTIONS` in `ExportImportButtons.tsx`
- [ ] Create `OpenTuiExportDialog.tsx` (clone from InkExportDialog)
- [ ] Register dialog in `EditorPage.tsx`

### Phase 3: Export Renderer
- [ ] Add `OpenTuiExportSettings` import to `exportRenderer.ts`
- [ ] Implement `exportOpenTuiComponent()` method
- [ ] Implement `generateOpenTuiComponentCode()` method

### Phase 4: Test Project
- [ ] Create `dev-tools/opentui-test-cli/` directory
- [ ] Create `package.json` with OpenTUI dependencies
- [ ] Create `tsconfig.json` for ESM TypeScript
- [ ] Create `src/cli.tsx` with placeholder and instructions
- [ ] Create `README.md` with usage documentation
- [ ] Test with npm install and sample export

### Phase 5: Documentation
- [ ] Update this plan with completion status
- [ ] Test full export workflow

---

## ✅ Acceptance Criteria

1. "OpenTUI Component" appears in export dropdown with Monitor icon
2. Dialog shows filename, color mode, loop, and playback controls options
3. Usage snippet shows correct OpenTUI import/render pattern
4. Exported `.tsx` file compiles without errors
5. Component renders correctly in opentui-test-cli project
6. `hasDarkBackground` prop switches between theme dictionaries
7. Playback controls API works when enabled
8. Both ANSI and Hex color modes produce valid output
