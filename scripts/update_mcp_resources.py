#!/usr/bin/env python3
"""Updates the resources/index.ts to include the guide resources."""

import re

# Read the file
filepath = '/Users/cameronfoxly/GitHubRepos/ascii-motion-mcp/src/resources/index.ts'
with open(filepath, 'r') as f:
    content = f.read()

# Add import at the top (after the existing imports)
import_line = "import { registerGuideResources } from './guide.js';"
if import_line not in content:
    content = content.replace(
        "import { getProjectManager } from '../state.js';",
        "import { getProjectManager } from '../state.js';\n" + import_line
    )
    print("Added import statement")

# Add the guide registration call at the end of registerResources function
if 'registerGuideResources(server)' not in content:
    # Find the last closing brace
    content = content.rstrip()
    if content.endswith('}'):
        content = content[:-1] + "\n\n  // Register LLM guide resources\n  registerGuideResources(server);\n}\n"
        print("Added registerGuideResources call")

with open(filepath, 'w') as f:
    f.write(content)

print(f"Updated: {filepath}")
