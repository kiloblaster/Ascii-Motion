/**
 * MCP Resource: LLM Best Practices Guide
 * 
 * This resource provides learned patterns and best practices for LLMs
 * using the ASCII Motion MCP tools. LLMs can read this resource before
 * starting complex animation tasks to improve their effectiveness.
 * 
 * Add this to: ascii-motion-mcp/src/resources/guide.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// The guide content - kept inline so it's bundled with the package
const LLM_BEST_PRACTICES_GUIDE = `
# ASCII Motion MCP - LLM Best Practices

## 🎯 Critical Rule: Always Inspect Before Animating

Before placing ANY animated elements, you MUST:
1. Use \`get_canvas_ascii\` to see the full layout
2. Use \`get_canvas_preview\` with a region to get exact coordinates
3. Place elements ON connection line characters, not near them

## 📍 Coordinate Discovery

1. Call \`get_canvas_ascii(frameIndex=0)\` for overview
2. Call \`get_canvas_preview(region={x,y,width,height})\` for exact cell coords
3. Look for box-drawing chars: │ ─ ┬ ┴ ├ ┤ ┼ ▼ ▲
4. Use those exact x,y values for animation elements

## 🔄 Frame Insertion Order

IMPORTANT: \`copy_frame_and_modify\` inserts at index 1, so frames end up REVERSED.

If you create frames for steps 1→2→3→4→5:
- Index 0: Base
- Index 1: Step 5 (last created)
- Index 2: Step 4
- ... and so on

Solutions:
- Create frames in reverse order (step 5 first)
- Or accept reverse order - loops anyway

## 🎨 Braille Spinner Sequence

Use this sequence for smooth rotation:
⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏

Unicode: \\u280b \\u2819 \\u2839 \\u2838 \\u283c \\u2834 \\u2826 \\u2827 \\u2807 \\u280f

## 🎭 Color Conventions

| Color | Hex | Meaning |
|-------|-----|---------|
| Cyan | #00FFFF | Data flowing |
| Green | #00FF00 | Active/Ready |
| Yellow | #FFFF00 | Processing |
| Orange | #FF6600 | Receiving |
| Magenta | #FF00FF | Key junction |
| Gray | #444444 | Inactive |

## ⚠️ Common Mistakes

1. Guessing coordinates - ALWAYS inspect first
2. Elements off connection lines - looks disconnected
3. Wrong frame order - animation plays backwards
4. Not activating tools - call activate_* functions if tools disabled
5. Indicators in empty space - put inside/adjacent to boxes
`;

export function registerGuideResources(server: McpServer): void {
  // Register the LLM best practices guide as a resource
  server.resource(
    "guide://llm-best-practices",
    "LLM Usage Best Practices",
    async () => ({
      contents: [{
        uri: "guide://llm-best-practices",
        mimeType: "text/markdown",
        text: LLM_BEST_PRACTICES_GUIDE
      }]
    })
  );

  // Register a quick reference for tool categories
  server.resource(
    "guide://tool-categories",
    "Tool Category Reference",
    async () => ({
      contents: [{
        uri: "guide://tool-categories",
        mimeType: "text/markdown",
        text: `
# ASCII Motion MCP Tool Categories

## Canvas Editing
- set_cell, get_cell, clear_cell
- get_canvas_ascii, get_canvas_preview
- paste_ascii_block, fill_region, clear_canvas

## Animation
- add_frame, copy_frame_and_modify, delete_frame
- list_frames, set_frame_duration, set_frame_name
- duplicate_frame, go_to_frame, describe_animation

## Project Management
- new_project, save_project, load_project
- get_project_info, set_project_name

## Effects & Colors
- batch_recolor, batch_replace_char
- get_color_stats, apply_effect

## Selection
- select_rectangle, select_by_color
- get_selection, clear_selection

## Import/Export
- import_image, import_video, import_ascii_text
- export_text, export_json, export_html, export_react
- export_image, export_video
`
      }]
    })
  );
}

/**
 * Usage in index.ts:
 * 
 * import { registerGuideResources } from "./resources/guide.js";
 * 
 * // After creating server:
 * registerGuideResources(server);
 */
