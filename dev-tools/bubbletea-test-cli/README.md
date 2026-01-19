# Bubbletea Test CLI

Test harness for ASCII Motion Bubbletea (Go) component exports.

## Prerequisites

- Go 1.21 or later
- Bubbletea and Lipgloss packages

## Quick Start

1. **Install dependencies:**
   ```bash
   cd dev-tools/bubbletea-test-cli
   go mod tidy
   ```

2. **Export an animation from ASCII Motion:**
   - Open ASCII Motion
   - Create or load an animation
   - Click Export → Bubbletea Component
   - Configure settings (color mode, playback style, loop)
   - Download the `.go` file

3. **Add your animation:**
   ```bash
   # Create a directory for your animation package
   mkdir -p animations/asciimotion
   
   # Move your exported file
   mv ~/Downloads/ascii_motion_anim.go animations/asciimotion/
   ```

4. **Update main.go:**
   ```go
   import (
       anim "bubbletea-test-cli/animations/asciimotion"
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

5. **Run the animation:**
   ```bash
   go run main.go
   ```

## Playback Styles

### Autoplay
Animation runs automatically with no user controls.

### Keyboard Controls
- `Space` - Play/Pause toggle
- `R` - Restart animation
- `Q` - Quit

### API-based
For embedding in larger applications:
```go
// In your parent model
type ParentModel struct {
    animation anim.Model
    // ... other fields
}

func (m ParentModel) Init() tea.Cmd {
    return m.animation.Init()
}

func (m ParentModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case anim.TickMsg:
        var cmd tea.Cmd
        m.animation, cmd = m.animation.Update(msg)
        return m, cmd
    }
    return m, nil
}

func (m ParentModel) View() string {
    return m.animation.View()
}

// API methods available on the model:
// m.animation.Play()       - Start playback (returns tea.Cmd)
// m.animation.Pause()      - Pause playback
// m.animation.Restart()    - Restart from frame 0 (returns tea.Cmd)
// m.animation.SetFrame(n)  - Jump to frame n
// m.animation.CurrentFrame() - Get current frame index
// m.animation.IsPlaying()  - Check if playing
// m.animation.FrameCount() - Get total frames
// m.animation.Width()      - Get animation width
// m.animation.Height()     - Get animation height
```

## Color Modes

### Hex (exact)
Uses true color hex values for precise color reproduction:
```go
var colors = map[string]lipgloss.Color{
    "c0": lipgloss.Color("#FF00FF"),
    "c1": lipgloss.Color("#00FFFF"),
}
```

### Semantic (ANSI 16)
Maps to terminal palette with human-readable comments:
```go
var colors = map[string]lipgloss.Color{
    "c0": lipgloss.Color("5"),  // magenta
    "c1": lipgloss.Color("6"),  // cyan
}
```

### Adaptive (light/dark)
Uses different colors for light vs dark terminal backgrounds:
```go
var colors = map[string]lipgloss.AdaptiveColor{
    "c0": {Light: "5", Dark: "13"},  // magenta
    "c1": {Light: "6", Dark: "14"},  // cyan
}
```

## Troubleshooting

### "package not found" error
Make sure your animation package directory matches the import path:
```
bubbletea-test-cli/
└── animations/
    └── asciimotion/      <- This must match "animations/asciimotion" in import
        └── ascii_motion_anim.go
```

### Colors don't look right
Try different color modes in the export dialog:
- **Hex** for exact colors (requires terminal with true color support)
- **Semantic** for maximum compatibility
- **Adaptive** for terminals that switch between light/dark modes

### Animation is choppy
The animation timing is based on frame durations from ASCII Motion. If frames have very short durations, you may see performance issues on some terminals.

## Project Structure

```
bubbletea-test-cli/
├── go.mod
├── go.sum (generated after go mod tidy)
├── main.go
├── README.md
└── animations/
    └── (your exported packages go here)
```
