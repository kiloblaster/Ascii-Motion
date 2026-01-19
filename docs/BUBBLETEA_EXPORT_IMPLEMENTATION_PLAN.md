# Bubbletea Export Implementation Plan

## Overview

This document outlines the implementation plan for exporting ASCII Motion animations as embeddable **Bubbletea** (Go) components. The export will generate a Go package that can be imported into any Bubbletea application.

## Target Framework

- **Bubbletea**: Go framework for building terminal UIs with Model-View-Update architecture
- **Lipgloss**: Companion styling library for colors and formatting
- **Go Version**: 1.21+ (for modern module support)

## Export Options

### Color Mode

| Mode | Description | Lipgloss Output |
|------|-------------|-----------------|
| **Hex (exact)** | Preserves original colors | `lipgloss.Color("#FF00FF")` |
| **Semantic (ANSI 16)** | Maps to terminal palette with inline comments | `lipgloss.Color("5") // magenta` |
| **Adaptive (light/dark)** | Different colors for light vs dark terminals | `lipgloss.AdaptiveColor{Light: "5", Dark: "13"}` |

### Playback Style

| Style | Description | Use Case |
|-------|-------------|----------|
| **Autoplay** | Animation starts immediately on Init, no user controls | Splash screens, loading indicators |
| **Keyboard Controls** | Space=pause/play, R=restart, Q=quit | Standalone demos, interactive previews |
| **API-based** | Exposes `Play()`, `Pause()`, `Restart()`, `SetFrame(n)` methods | Embedding in larger apps with programmatic control |

### Loop Animation

- **Enabled**: Animation restarts after last frame
- **Disabled**: Animation stops on last frame, can be restarted via controls/API

## Generated File Structure

### Single File Export: `ascii_motion_animation.go`

```go
package asciimotion

import (
    "time"
    tea "github.com/charmbracelet/bubbletea"
    "github.com/charmbracelet/lipgloss"
)

// --- Color Dictionary ---
// (Hex mode: map of hex strings to lipgloss.Color)
// (Semantic mode: ANSI numbers with comments)
var colors = map[string]lipgloss.Color{
    "c0": lipgloss.Color("5"),  // magenta
    "c1": lipgloss.Color("6"),  // cyan
    "c2": lipgloss.Color("2"),  // green
    // ...
}

// --- Frame Data ---
type frameData struct {
    Duration time.Duration
    Content  []string
    FgColors map[string]string // "x,y" -> color key
    BgColors map[string]string
}

var frames = []frameData{
    // Compressed frame data...
}

// --- Animation Model ---
type Model struct {
    currentFrame int
    playing      bool
    loop         bool
    width        int
    height       int
}

// Config options for the animation
type Config struct {
    AutoPlay bool
    Loop     bool
    // ... playback style options
}

// New creates a new animation model
func New(cfg Config) Model { ... }

// API methods (when API-based playback is enabled)
func (m *Model) Play() tea.Cmd { ... }
func (m *Model) Pause() { ... }
func (m *Model) Restart() tea.Cmd { ... }
func (m *Model) SetFrame(n int) { ... }
func (m *Model) CurrentFrame() int { ... }
func (m *Model) IsPlaying() bool { ... }

// Bubbletea interface
func (m Model) Init() tea.Cmd { ... }
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) { ... }
func (m Model) View() string { ... }
```

## Semantic Color Mapping (ANSI 16)

The semantic mode maps hex colors to ANSI 16-color palette with human-readable comments:

```go
var semanticColors = map[string]struct {
    code string
    name string
}{
    "#000000": {"0", "black"},
    "#800000": {"1", "red"},
    "#008000": {"2", "green"},
    "#808000": {"3", "yellow"},
    "#000080": {"4", "blue"},
    "#800080": {"5", "magenta"},
    "#008080": {"6", "cyan"},
    "#c0c0c0": {"7", "white"},
    "#808080": {"8", "bright black (gray)"},
    "#ff0000": {"9", "bright red"},
    "#00ff00": {"10", "bright green"},
    "#ffff00": {"11", "bright yellow"},
    "#0000ff": {"12", "bright blue"},
    "#ff00ff": {"13", "bright magenta"},
    "#00ffff": {"14", "bright cyan"},
    "#ffffff": {"15", "bright white"},
}
```

## Implementation Tasks

### Phase 1: Types & Store

1. **Add `BubbleteaExportSettings` interface** to `src/types/export.ts`:
   ```typescript
   export interface BubbleteaExportSettings {
     fileName: string;
     packageName: string;
     colorMode: 'hex' | 'semantic' | 'adaptive';
     playbackStyle: 'autoplay' | 'keyboard' | 'api';
     loopAnimation: boolean;
   }
   ```

2. **Update `ExportFormatId`** to include `'bubbletea'`

3. **Add store state and actions** in `src/stores/exportStore.ts`

### Phase 2: Export Renderer

1. **Add `exportBubbleteaComponent()` method** to `ExportRenderer`
2. **Add `generateBubbleteaCode()` helper** for Go code generation
3. **Implement semantic color mapping with comments**

### Phase 3: UI Dialog

1. **Create `BubbleteaExportDialog.tsx`** component
2. **Add playback style selector** (autoplay/keyboard/api)
3. **Add color mode selector** (hex/semantic)
4. **Add loop toggle**
5. **Show Go import snippet**

### Phase 4: Menu Integration

1. **Add Bubbletea to export format list** in `ExportImportButtons.tsx`
2. **Register dialog** in `EditorPage.tsx`

### Phase 5: Test Project

1. **Create `dev-tools/bubbletea-test-cli/`** directory
2. **Add `go.mod`** with dependencies
3. **Add `main.go`** test harness
4. **Add README** with usage instructions

## Test Project Structure

```
dev-tools/bubbletea-test-cli/
├── go.mod
├── go.sum
├── main.go
├── README.md
└── animations/
    └── (exported .go files go here)
```

### main.go (Test Harness)

```go
package main

import (
    "fmt"
    "os"
    
    tea "github.com/charmbracelet/bubbletea"
    anim "bubbletea-test-cli/animations"
)

func main() {
    model := anim.New(anim.Config{
        AutoPlay: true,
        Loop:     true,
    })
    
    p := tea.NewProgram(model, tea.WithAltScreen())
    if _, err := p.Run(); err != nil {
        fmt.Printf("Error: %v\n", err)
        os.Exit(1)
    }
}
```

## Dialog UI Mockup

```
┌─────────────────────────────────────────────────────────┐
│ Export Bubbletea Component                              │
├─────────────────────────────────────────────────────────┤
│ Package Name: [ascii_motion_anim    ] .go               │
│                                                         │
│ ─── Component Options ───                               │
│                                                         │
│ Playback Style:                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ○ Autoplay - Animation runs automatically           │ │
│ │ ○ Keyboard - Space=pause, R=restart, Q=quit         │ │
│ │ ● API-based - Exposes Play(), Pause(), Restart()    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [✓] Loop animation                                      │
│                                                         │
│ ─── Color Mode ───                                      │
│                                                         │
│ [Hex colors (exact)          ▼]                         │
│ Preserves original #rrggbb values.                      │
│                                                         │
│ ─── Animation Info ───                                  │
│ 24 frames • 80×24 • 2.40s duration • 8 unique colors    │
│                                                         │
│ ─── Import & Usage ───                                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ import anim "yourproject/animations"                │ │
│ │                                                     │ │
│ │ model := anim.New(anim.Config{                      │ │
│ │     AutoPlay: true,                                 │ │
│ │     Loop: true,                                     │ │
│ │ })                                                  │ │
│ │                                                     │ │
│ │ // In your parent model's Update:                   │ │
│ │ case anim.TickMsg:                                  │ │
│ │     m.animation, cmd = m.animation.Update(msg)      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                    [📋] │
│                                                         │
│              [Cancel]              [Download .go]       │
└─────────────────────────────────────────────────────────┘
```

## Dependencies

The exported Go file requires:

```
require (
    github.com/charmbracelet/bubbletea v1.2.0
    github.com/charmbracelet/lipgloss v1.0.0
)
```

## Success Criteria

1. ✅ Export generates valid, compilable Go code
2. ✅ Animation plays correctly in standalone test
3. ✅ Animation can be embedded in parent Bubbletea app
4. ✅ All three playback styles work correctly
5. ✅ Colors render correctly in both hex and semantic modes
6. ✅ Loop behavior works as expected
7. ✅ API methods work for programmatic control

## Open Questions - RESOLVED

1. ~~Should we support embedding multiple animations in one export?~~ → **No, single animation per export**
2. ~~Should we add a "dark/light background" adaptive color option?~~ → **Yes, add adaptive color mode**
3. ~~Should we include a standalone `main()` wrapper option for quick testing?~~ → **Use dev-tools test project instead**

---

*Implementation follows the same patterns as Ink and OpenTUI exports for consistency.*
