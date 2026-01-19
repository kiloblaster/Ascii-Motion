package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	
	// Import your exported animation package here
	// Example: anim "bubbletea-test-cli/animations/asciimotion"
)

/*
Bubbletea Test CLI

This is a test harness for ASCII Motion Bubbletea component exports.

Usage:
1. Export an animation from ASCII Motion using "Bubbletea Component" export
2. Create a directory under animations/ with your package name
3. Move the exported .go file into that directory
4. Update the import statement above
5. Run: go run main.go

Example directory structure:
  bubbletea-test-cli/
  ├── go.mod
  ├── main.go
  └── animations/
      └── asciimotion/
          └── ascii_motion_anim.go
*/

func main() {
	fmt.Println("Bubbletea Test CLI")
	fmt.Println("==================")
	fmt.Println("")
	fmt.Println("To use this test harness:")
	fmt.Println("1. Export an animation from ASCII Motion")
	fmt.Println("2. Create a directory under animations/ (e.g., animations/asciimotion/)")
	fmt.Println("3. Move your .go file there")
	fmt.Println("4. Uncomment and update the import in main.go")
	fmt.Println("5. Uncomment the model creation code below")
	fmt.Println("6. Run: go run main.go")
	fmt.Println("")
	fmt.Println("See README.md for more details.")
	
	// Uncomment this code after adding your animation:
	/*
	// Pass true for dark background terminals, false for light
	model := anim.New(true) // true = dark terminal background
	
	// Or use the convenience function for dark backgrounds:
	// model := anim.NewWithDefaults()

	p := tea.NewProgram(model, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	*/
	
	// Suppress unused import warning
	_ = tea.Quit
	_ = os.Exit
}
