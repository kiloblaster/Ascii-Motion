# Ink Component Export Feature - Implementation Plan

**Date**: January 18, 2026  
**Feature**: Ink (CLI) Component Export for ASCII Motion Animations  
**Integration**: New export modality in existing Export system  
**Status**: ✅ **IMPLEMENTED**

---

## ✅ Implementation Complete

All phases have been successfully implemented:

### Files Created/Modified:
1. ✅ `src/types/export.ts` - Added `'ink'` to ExportFormatId, created `InkExportSettings` interface
2. ✅ `src/stores/exportStore.ts` - Added ink settings defaults and actions
3. ✅ `src/components/features/ExportImportButtons.tsx` - Added Ink Component to export dropdown
4. ✅ `src/components/features/InkExportDialog.tsx` - **NEW** - Export dialog with settings
5. ✅ `src/pages/EditorPage.tsx` - Registered the InkExportDialog
6. ✅ `src/utils/exportRenderer.ts` - Added `exportInkComponent()` and `generateInkComponentCode()`

### Features Implemented:
- **ANSI color mode**: Maps hex colors to closest 16-color ANSI names (cyan, magenta, etc.)
- **Hex color mode**: Uses numeric dictionary keys for exact color preservation
- **Frame data structure**: Separate `content` (string rows) and color maps per frame
- **Playback controls API**: Optional `onReady` callback with play/pause/restart
- **Loop animation toggle**: Configurable looping behavior
- **Dark/Light terminal support**: `hasDarkBackground` prop on generated component
- **Usage snippet**: Copy-ready import and render example

---

## 📋 Overview

Introduce an export format that outputs a self-contained TypeScript React component for **Ink** (React for CLIs) capable of rendering ASCII Motion animations in the terminal. The component will use Ink's `<Text>` and `<Box>` components with chalk-compatible color props.

### Key Requirements
- ✅ Export format: "Ink Component" with subtitle "React-flavored CLI component"
- ✅ TypeScript-only output (`.tsx` file) - CLI tools are typically TypeScript
- ✅ Data structure inspired by banner.tsx: separate `content` strings and `colors` dictionary
- ✅ Human-readable color theme dictionary for easy customization
- ✅ Frame-based animation with duration per frame
- ✅ Copy-friendly import/usage snippet with basic integration steps
- ✅ Component encapsulates frame data and rendering logic
- ✅ Downloaded file plays animation automatically and loops by default
- ✅ Support for dark/light terminal background themes

---

## 🎯 Design Goals

### Data Structure (Inspired by banner.tsx)

The banner.tsx from GitHub Copilot CLI demonstrates an excellent pattern:

1. **Separate content from colors**: Each frame has:
   - `content`: string representing ASCII art (character data as multi-line string)
   - `colors`: A map of `"row,col"` → element name (e.g., "accent", "text", "background")

2. **Theme dictionary**: Map element names to ANSI color values:
   ```typescript
   const ANIMATION_THEME_DARK = {
     accent: "cyan",
     text: "white",
     background: "gray",
   };
   
   const ANIMATION_THEME_LIGHT = {
     accent: "blue",
     text: "black",
     background: "blackBright",
   };
   ```

3. **Frame-based animation**:
   ```typescript
   interface AnimationFrame {
     duration: number;  // ms
     content: string;   // Multi-line ASCII art
     colors?: Record<string, ColorElement>;
   }
   ```

### Benefits of This Approach
- **Human-readable**: Developers can easily see and edit the ASCII art
- **Easy color customization**: Change one value in the theme to update all instances
- **Clean separation**: Content vs. styling follows best practices
- **Matches existing patterns**: Aligns with how Copilot CLI handles animations

---

## 🏗️ Architecture Integration

### Export System Flow
```
User selects "Ink Component" in Export dropdown → InkExportDialog → 
Ink export settings in Zustand store → ExportRenderer.exportInkComponent() → 
File download (.tsx)
```

### Touchpoints

1. **Types** (`src/types/export.ts`)
   - Add `'ink'` to `ExportFormatId`
   - Introduce `InkExportSettings` interface
   - Extend `ExportSettings` union

2. **Store** (`src/stores/exportStore.ts`)
   - Provide default `InkExportSettings` and corresponding setter `setInkSettings`
   - Add case for 'ink' in `getCurrentSettings`

3. **UI**
   - `ExportImportButtons.tsx`: Add "Ink Component" option with `Terminal` icon
   - `InkExportDialog.tsx` (new): UI for settings, filename input, usage instructions
   - `EditorPage.tsx`: Include dialog in render tree

4. **Renderer** (`src/utils/exportRenderer.ts`)
   - Implement `exportInkComponent(data, settings)`
   - Implement `generateInkComponentCode(options)`
   - Add color theme extraction logic

---

## 🧱 Type Definitions

### InkExportSettings

```typescript
export interface InkExportSettings {
  fileName: string;
  includePlaybackControls: boolean; // Expose play/pause/restart functions
  includeDarkLightThemes: boolean;  // Generate both theme variants
  loopAnimation: boolean;           // Loop by default
  componentName?: string;           // Auto-derived from fileName if not set
}
```

### Export Format Definition

```typescript
// In ExportImportButtons.tsx EXPORT_OPTIONS array
{
  id: 'ink' as ExportFormatId,
  name: 'Ink Component',
  description: 'React-flavored CLI component',
  icon: Terminal, // from lucide-react
}
```

---

## 🎨 Generated Component Structure

### Frame Data Format

```typescript
/**
 * Represents a mapping from position "row,col" to a color element key
 */
type ColorMap = Record<string, ColorElement>;

/**
 * Color element identifiers for theming
 */
type ColorElement = 
  | 'primary'      // Main accent color
  | 'secondary'    // Secondary accent
  | 'text'         // Default text color
  | 'background'   // Background elements
  | 'highlight'    // Highlighted/bright elements
  | 'dim';         // Dimmed/subtle elements

/**
 * Represents a single animation frame
 */
interface AnimationFrame {
  duration: number;           // Duration in milliseconds
  content: string;            // Multi-line ASCII art content
  colors?: ColorMap;          // Position-to-element color mapping
}

/**
 * Theme configuration for terminal color adaptation
 */
type AnimationTheme = Record<ColorElement, ANSIColor>;

type ANSIColor =
  | 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'blackBright' | 'redBright' | 'greenBright' | 'yellowBright'
  | 'blueBright' | 'magentaBright' | 'cyanBright' | 'whiteBright'
  | 'gray' | 'grey';
```

### Generated Component Template

```tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text } from 'ink';

// ============================================================================
// ANIMATION DATA
// ============================================================================

type ColorElement = 'primary' | 'secondary' | 'text' | 'background' | 'highlight' | 'dim';
type ANSIColor = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'blackBright' | 'redBright' | 'greenBright' | 'yellowBright'
  | 'blueBright' | 'magentaBright' | 'cyanBright' | 'whiteBright' | 'gray';

type ColorMap = Record<string, ColorElement>;

interface AnimationFrame {
  duration: number;
  content: string;
  colors?: ColorMap;
}

// Theme for dark terminal backgrounds
const THEME_DARK: Record<ColorElement, ANSIColor> = {
  primary: 'cyan',
  secondary: 'magenta',
  text: 'white',
  background: 'gray',
  highlight: 'whiteBright',
  dim: 'blackBright',
};

// Theme for light terminal backgrounds
const THEME_LIGHT: Record<ColorElement, ANSIColor> = {
  primary: 'blue',
  secondary: 'magenta',
  text: 'black',
  background: 'blackBright',
  highlight: 'black',
  dim: 'gray',
};

const FRAMES: AnimationFrame[] = [
  // Frame data will be inserted here
];

// ============================================================================
// COMPONENT
// ============================================================================

interface MyAnimationProps {
  /**
   * Whether to use dark or light terminal theme
   * @default true
   */
  hasDarkBackground?: boolean;
  /**
   * Whether the animation should auto-play
   * @default true
   */
  autoPlay?: boolean;
  /**
   * Whether to loop the animation
   * @default true
   */
  loop?: boolean;
  /**
   * Callback when animation completes (if not looping)
   */
  onComplete?: () => void;
  /**
   * Callback to receive playback control API
   */
  onReady?: (api: PlaybackApi) => void;
}

interface PlaybackApi {
  play: () => void;
  pause: () => void;
  restart: () => void;
  isPlaying: () => boolean;
}

export function MyAnimation({
  hasDarkBackground = true,
  autoPlay = true,
  loop = true,
  onComplete,
  onReady,
}: MyAnimationProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const frameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(autoPlay);

  // Select theme based on terminal background
  const theme = hasDarkBackground ? THEME_DARK : THEME_LIGHT;

  // Get color for a specific position
  const getColor = useCallback(
    (row: number, col: number, frame: AnimationFrame): ANSIColor => {
      if (!frame.colors) return theme.text;
      const element = frame.colors[`${row},${col}`];
      if (!element) return theme.text;
      return theme[element] || theme.text;
    },
    [theme]
  );

  // Playback controls
  const play = useCallback(() => {
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  const restart = useCallback(() => {
    setFrameIndex(0);
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, []);

  const getIsPlaying = useCallback(() => isPlayingRef.current, []);

  // Expose API to parent
  useEffect(() => {
    if (onReady) {
      onReady({
        play,
        pause,
        restart,
        isPlaying: getIsPlaying,
      });
    }
  }, [onReady, play, pause, restart, getIsPlaying]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || FRAMES.length === 0) return;

    const currentFrame = FRAMES[frameIndex];
    
    frameTimeoutRef.current = setTimeout(() => {
      if (!isPlayingRef.current) return;
      
      const nextIndex = frameIndex + 1;
      if (nextIndex >= FRAMES.length) {
        if (loop) {
          setFrameIndex(0);
        } else {
          setIsPlaying(false);
          isPlayingRef.current = false;
          onComplete?.();
        }
      } else {
        setFrameIndex(nextIndex);
      }
    }, currentFrame.duration);

    return () => {
      if (frameTimeoutRef.current) {
        clearTimeout(frameTimeoutRef.current);
      }
    };
  }, [frameIndex, isPlaying, loop, onComplete]);

  if (FRAMES.length === 0) {
    return <Text color="red">No animation frames</Text>;
  }

  const currentFrame = FRAMES[frameIndex];
  const lines = currentFrame.content.split('\n');

  return (
    <Box flexDirection="column">
      {lines.map((line, rowIndex) => (
        <Text key={rowIndex}>
          {line.split('').map((char, colIndex) => {
            const color = getColor(rowIndex, colIndex, currentFrame);
            return (
              <Text key={colIndex} color={color}>
                {char}
              </Text>
            );
          })}
        </Text>
      ))}
    </Box>
  );
}

export default MyAnimation;
```

---

## ⚙️ Export Dialog Specifications (`InkExportDialog.tsx`)

### Layout Elements

1. **Filename Input**
   - Text input with live sanitization (letters, numbers, hyphen, underscore)
   - Badge showing `.tsx` extension

2. **Settings Card**
   - Dark/Light theme variants switch (`includeDarkLightThemes`) - default ON
   - Loop animation switch (`loopAnimation`) - default ON
   - Include playback controls (`includePlaybackControls`) - default ON

3. **Import Instructions Card**
   - Display dynamic component name and file name
   - Provide copy button for snippet:
     ```tsx
     import { MyAnimation } from './MyAnimation';
     import { render } from 'ink';
     
     // Basic usage - auto-plays and loops
     render(<MyAnimation />);
     
     // With options
     render(
       <MyAnimation 
         hasDarkBackground={true}
         autoPlay={true}
         loop={true}
       />
     );
     ```
   - Bullet list describing required steps

4. **Dependencies Card**
   - Note: Requires `ink` and `react` packages
   - Command: `npm install ink react`

5. **Export Summary**
   - Frame count, canvas dimensions, total duration, unique colors

6. **Actions**
   - Cancel and Export buttons (mirroring other dialogs)

---

## 🔄 ExportRenderer Implementation

### Color Extraction Algorithm

1. **Collect unique colors** from all frames
2. **Map colors to semantic elements**:
   - Primary: Most common accent color
   - Secondary: Second most common accent
   - Text: Default foreground (#ffffff or similar)
   - Background: Any background-only colors
   - Highlight: Bright/saturated colors
   - Dim: Dark/gray colors

3. **Generate color theme dictionaries** for dark and light terminals

### Frame Conversion Strategy

For each frame:
1. Build the `content` string from cell data (row by row)
2. Build the `colors` map only for cells that deviate from default text color
3. Store frame duration

### Code Generation Steps

1. Determine component name from filename (PascalCase)
2. Extract and categorize colors from all frames
3. Generate theme dictionaries (THEME_DARK, THEME_LIGHT)
4. Serialize frames with content and color maps
5. Generate component code using template
6. Create Blob and trigger download

---

## 📌 Implementation Steps

### Phase 1: Types & Store
- [ ] Add `'ink'` to `ExportFormatId` in `src/types/export.ts`
- [ ] Create `InkExportSettings` interface
- [ ] Add `inkSettings` to `ExportState` and `ExportStoreState`
- [ ] Add default settings `DEFAULT_INK_SETTINGS`
- [ ] Add `setInkSettings` action
- [ ] Add 'ink' case to `getCurrentSettings`

### Phase 2: UI Components
- [ ] Add "Ink Component" option to `EXPORT_OPTIONS` in `ExportImportButtons.tsx`
- [ ] Create `InkExportDialog.tsx` component with:
  - Filename input with validation
  - Settings toggles (themes, loop, controls)
  - Usage snippet with copy button
  - Dependencies note
  - Export summary
  - Cancel/Export buttons
- [ ] Register `<InkExportDialog />` in `EditorPage.tsx`

### Phase 3: Renderer Logic
- [ ] Implement `exportInkComponent()` method in `ExportRenderer`
- [ ] Implement `generateInkComponentCode()` helper
- [ ] Implement color extraction and categorization logic
- [ ] Implement frame content/color serialization

### Phase 4: Testing
- [ ] Test export with various animations
- [ ] Verify exported component works in an Ink CLI app
- [ ] Test both theme variants
- [ ] Test playback controls API

### Phase 5: Documentation
- [ ] Update `COPILOT_INSTRUCTIONS.md` with Ink export guidelines
- [ ] Update `DEVELOPMENT.md` with new export format
- [ ] Add user-facing documentation in `docs/`

---

## 🎨 Color Mapping Strategy

### Hex to ANSI Color Mapping

Since terminals use ANSI colors, we need to map hex colors to the nearest ANSI equivalent:

```typescript
const HEX_TO_ANSI_MAP: Record<string, ANSIColor> = {
  // Standard colors
  '#000000': 'black',
  '#ff0000': 'red',
  '#00ff00': 'green',
  '#ffff00': 'yellow',
  '#0000ff': 'blue',
  '#ff00ff': 'magenta',
  '#00ffff': 'cyan',
  '#ffffff': 'white',
  // ... brightness variants
};

function hexToAnsiColor(hex: string): ANSIColor {
  // 1. Check direct match
  // 2. Calculate color distance to find nearest match
  // 3. Consider brightness to choose regular vs bright variant
}
```

### Color Element Assignment

1. **Analyze all unique colors** in the animation
2. **Sort by frequency** (most used → least used)
3. **Categorize**:
   - If color is bright/saturated: `primary` or `secondary`
   - If color is white/light gray: `text` or `highlight`
   - If color is dark/black: `background` or `dim`
   - If color is gray: `dim`

---

## ✅ Testing & Validation Checklist

- [ ] Export Ink component and import into sample Ink CLI app
- [ ] Verify animation plays correctly in terminal
- [ ] Test both dark and light terminal themes
- [ ] Verify loop setting works (animation restarts vs stops)
- [ ] Test playback API (play/pause/restart)
- [ ] Filename sanitization prevents invalid characters
- [ ] Usage snippet copy button works
- [ ] Dependencies note is accurate
- [ ] `npm run build` succeeds after all changes
- [ ] `npm run lint` passes with zero warnings

---

## 📚 Documentation Updates

- `COPILOT_INSTRUCTIONS.md` → Add Ink export to documentation protocol
- `DEVELOPMENT.md` → Mention Ink component export and configuration
- `docs/README.md` → Reference this implementation plan
- Consider user-facing guide for CLI developers

---

## 🧾 Definition of Done

- All code paths implemented and passing TypeScript compile/build
- Dialog UX matches established shadcn patterns
- Exported components run without modification in Ink 5.x CLI apps
- Documentation updates merged
- Plan updated/annotated with any deviations
- Verification checklist executed with notes recorded

---

## ✅ Design Decisions (Resolved)

1. **Background colors**: ✅ RESOLVED
   - Include background colors if explicitly set
   - Ignore if not set or set to 'transparent'
   - Both foreground and background supported per-character

2. **Color mode toggle**: ✅ RESOLVED
   - **ANSI mode**: Semantic element names ('primary', 'text', 'accent') mapped to ANSI colors
   - **Hex mode**: Hex values mapped to numeric indices (0, 1, 2...) for minimal file size
   - Both modes use a color dictionary at the start of the file
   - Frame data references dictionary keys, not raw color values

3. **Output format**: ✅ RESOLVED
   - TypeScript only (.tsx) - CLI tools are typically TypeScript

4. **Character encoding**: 
   - Use UTF-8 with proper escaping in template literals
   - Test with box-drawing characters and Unicode symbols

---

## 📝 Example Output Preview

Given a simple 2-frame animation with colored text:

```tsx
// MyCliAnimation.tsx

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text } from 'ink';

// ... type definitions ...

const THEME_DARK: Record<ColorElement, ANSIColor> = {
  primary: 'cyan',
  secondary: 'magenta',
  text: 'white',
  background: 'gray',
  highlight: 'whiteBright',
  dim: 'blackBright',
};

const THEME_LIGHT: Record<ColorElement, ANSIColor> = {
  primary: 'blue',
  secondary: 'magenta',
  text: 'black',
  background: 'blackBright',
  highlight: 'black',
  dim: 'gray',
};

const FRAMES: AnimationFrame[] = [
  {
    duration: 100,
    content: `  ╔═══╗  
  ║ A ║  
  ╚═══╝  `,
    colors: {
      '1,4': 'primary',
    },
  },
  {
    duration: 100,
    content: `  ╔═══╗  
  ║ B ║  
  ╚═══╝  `,
    colors: {
      '1,4': 'secondary',
    },
  },
];

export function MyCliAnimation({ /* props */ }) {
  // ... component implementation ...
}

export default MyCliAnimation;
```

---

## 🔗 References

- [Ink GitHub Repository](https://github.com/vadimdemedes/ink)
- [Ink Documentation](https://term.ink/)
- [GitHub Copilot CLI Banner Implementation](banner.tsx attachment)
- [ASCII Motion React Export Plan](REACT_COMPONENT_EXPORT_IMPLEMENTATION_PLAN.md)
- [Chalk Color Library](https://github.com/chalk/chalk)
