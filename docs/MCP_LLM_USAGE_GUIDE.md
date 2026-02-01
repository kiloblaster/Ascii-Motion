# ASCII Motion MCP - LLM Best Practices Guide

This guide documents learned patterns for effectively using the ASCII Motion MCP tools. It can be exposed as an MCP Resource (`guide://llm-best-practices`) so LLMs can access it during tool invocation.

---

## 🎯 Critical Rule: Always Inspect Before Animating

Before placing ANY animated elements (circles, indicators, data flow particles), you MUST:

1. **Get the exact canvas layout** using `get_canvas_ascii` 
2. **Inspect specific regions** using `get_canvas_preview` with a region parameter
3. **Identify exact coordinates** of connection lines, boxes, and text

### Why This Matters

ASCII diagrams use box-drawing characters (`│`, `─`, `┬`, `┼`, `▼`, etc.) at specific x,y coordinates. Animated elements like data flow particles (`●`, `○`) must be placed EXACTLY on these coordinates, not approximated.

**Wrong approach:**
```
"I'll place a circle at approximately x=15, y=10 where the line should be"
```

**Correct approach:**
```
1. Call get_canvas_preview with region around the connection area
2. Find cells with char="│" or char="─" 
3. Use those exact x,y coordinates for animation
```

---

## 📍 Coordinate Discovery Workflow

### Step 1: Get Overall Layout
```json
{
  "tool": "get_canvas_ascii",
  "params": { "frameIndex": 0 }
}
```
This shows the full diagram as text. Identify areas of interest.

### Step 2: Inspect Specific Regions
```json
{
  "tool": "get_canvas_preview",
  "params": {
    "frameIndex": 0,
    "region": { "x": 10, "y": 10, "width": 40, "height": 15 },
    "maxCells": 200
  }
}
```
This returns exact cell data with coordinates:
```json
{"x": 12, "y": 11, "char": "│", "color": "#00CCFF"},
{"x": 27, "y": 12, "char": "┬", "color": "#00CCFF"},
{"x": 27, "y": 13, "char": "│", "color": "#00CCFF"}
```

### Step 3: Map the Data Flow Path
From the preview, extract coordinates for:
- **Vertical pipes**: `│` characters - data flows down these
- **Horizontal pipes**: `─` characters - data flows across these  
- **Junctions**: `┬`, `┴`, `├`, `┤`, `┼` - data merges/splits here
- **Arrows**: `▼`, `▲`, `◀`, `▶` - data direction indicators
- **Box corners**: `┌`, `┐`, `└`, `┘` - component boundaries

---

## 🔄 Frame Insertion Order

**Critical**: When using `copy_frame_and_modify` multiple times, frames are inserted at index 1 (after current frame). This means:

```
Frame 0: Base (original)
Call copy_frame_and_modify → creates Frame 1
Call copy_frame_and_modify → creates Frame 1 (pushes previous to index 2)
Call copy_frame_and_modify → creates Frame 1 (pushes previous to index 3)
...
```

**Result**: Frames end up in REVERSE order!

If you create frames for steps 1→2→3→4→5, the final order will be:
- Index 0: Base
- Index 1: Step 5 (last created)
- Index 2: Step 4
- Index 3: Step 3
- Index 4: Step 2
- Index 5: Step 1 (first created)

**Solutions:**
1. Create frames in reverse order (step 5 first, step 1 last)
2. Or accept reverse order - animation loops anyway
3. Or use `atIndex` parameter if available to insert at specific position

---

## 🎨 Animation Element Placement

### Status Indicators
Place indicators INSIDE component boxes or AT connection endpoints:

```
Good positions:
┌──────────┐
│ SERVICE  │
│  STATUS: ●   ← Inside the box, after label
└──────────┘

┌──────────┐
│ SERVICE  │ ●  ← Adjacent to box edge
└──────────┘
```

### Data Flow Particles
Place particles EXACTLY on connection characters:

```
     │         ← particle at this │ position
     ●         ← particle replaces │ temporarily
     │
     ▼
```

### Braille Loader Spinner
Use this character sequence for smooth rotation:
```
⠋ → ⠙ → ⠹ → ⠸ → ⠼ → ⠴ → ⠦ → ⠧ → ⠇ → ⠏ (loop)
```

Unicode values:
- `⠋` = \u280b
- `⠙` = \u2819
- `⠹` = \u2839
- `⠸` = \u2838
- `⠼` = \u283c
- `⠴` = \u2834
- `⠦` = \u2826
- `⠧` = \u2827
- `⠇` = \u2807
- `⠏` = \u280f

---

## 🎭 Color Coding Conventions

Use consistent colors to convey meaning:

| Color | Hex | Meaning |
|-------|-----|---------|
| Cyan | `#00FFFF` | Data in transit / flowing |
| Green | `#00FF00` | Active / OK / Ready |
| Yellow | `#FFFF00` | Processing / Working |
| Orange | `#FF6600` | Receiving data / Attention |
| Magenta | `#FF00FF` | Data at key junction |
| Gray | `#444444` | Inactive / Standby / Dimmed |
| White | `#FFFFFF` | Neutral / Default |

---

## 🔧 Tool Activation

Tools are organized into categories that may need activation:

| Category | Activation Tool | Tools Included |
|----------|-----------------|----------------|
| Canvas editing | `activate_canvas_editing_tools` | set_cell, get_cell, clear_cell, get_canvas_ascii, get_canvas_preview, paste_ascii_block, fill_region |
| Animation | `activate_animation_editing_tools` | add_frame, copy_frame_and_modify, delete_frame, list_frames, set_frame_duration, duplicate_frame |
| Project | `activate_project_management_tools` | new_project, save_project, load_project, get_project_info |
| Selection | `activate_selection_tools` | select_rectangle, select_by_color, clear_selection |
| Colors | `activate_color_management_tools` | batch_recolor, get_color_stats |
| Canvas resize | `activate_canvas_summary_and_resizing` | resize_canvas, get_canvas_summary |

If a tool returns "disabled", call the appropriate activation function.

---

## 📝 Complete Animation Workflow Example

### Task: Create a technical diagram with animated data flow

```
Step 1: Create project
  → new_project(name="My Diagram", width=60, height=30)

Step 2: Draw the diagram
  → paste_ascii_block(text="...", x=0, y=0, color="#00CCFF")

Step 3: Inspect the layout
  → get_canvas_ascii() 
  → Review the output, identify connection line areas

Step 4: Get exact coordinates
  → get_canvas_preview(region={x:10, y:10, width:40, height:15})
  → Note coordinates of │, ─, ┬, ▼ characters

Step 5: Add base indicators  
  → set_cell(x=17, y=29, char="●", color="#00FF00")  // Use exact coords!
  → set_cell(x=30, y=19, char="⠋", color="#FFFF00")  // Braille loader

Step 6: Create animation frames (in reverse order for correct playback)
  → copy_frame_and_modify(sourceIndex=0, name="Final", modifications=[...])
  → copy_frame_and_modify(sourceIndex=0, name="Step 3", modifications=[...])
  → copy_frame_and_modify(sourceIndex=0, name="Step 2", modifications=[...])
  → copy_frame_and_modify(sourceIndex=0, name="Step 1", modifications=[...])

Step 7: Verify
  → describe_animation()
  → list_frames()
```

---

## ⚠️ Common Mistakes to Avoid

1. **Guessing coordinates** - Always inspect first
2. **Placing elements off the connection lines** - They look disconnected
3. **Forgetting frame order reversal** - Animation plays backwards
4. **Using wrong braille sequence** - Spinner looks jerky
5. **Not activating tool categories** - Tools fail silently
6. **Placing indicators in empty space** - Should be inside/adjacent to boxes
7. **Inconsistent colors** - Confuses the visual meaning
8. **Not checking cell contents before modifying** - May overwrite important characters

---

## 🔗 Exposing This as an MCP Resource

To make this guide available to LLMs during tool invocation, add it as an MCP resource:

```typescript
// In the MCP server's resource registration:
server.registerResource({
  uri: "guide://llm-best-practices",
  name: "LLM Usage Best Practices",
  description: "Learned patterns and best practices for effectively using ASCII Motion MCP tools",
  mimeType: "text/markdown",
  async read() {
    // Return this document's contents
    return {
      contents: [{
        uri: "guide://llm-best-practices",
        mimeType: "text/markdown",
        text: LLM_BEST_PRACTICES_GUIDE  // The content of this file
      }]
    };
  }
});
```

LLMs can then request this resource before starting complex tasks:
```json
{
  "method": "resources/read",
  "params": { "uri": "guide://llm-best-practices" }
}
```

---

## 📚 Additional Resources

- `project://state` - Current project state snapshot
- `project://canvas` - Current frame canvas data
- `project://frames` - Frame list with metadata
- `project://ascii` - Plain text ASCII preview
- `guide://llm-best-practices` - This document (when implemented)
