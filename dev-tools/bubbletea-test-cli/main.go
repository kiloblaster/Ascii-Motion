package main

import (
	"fmt"
	"os"

	anim "bubbletea-test-cli/animations/effects3"

	tea "github.com/charmbracelet/bubbletea"
)

func main() {
	// Pass true for dark background terminals, false for light
	model := anim.New(true) // true = dark terminal background

	p := tea.NewProgram(model, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
}
