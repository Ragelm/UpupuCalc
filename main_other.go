//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
)

// Вне Windows программа работает в режиме браузера (используется для разработки и проверки).
func openBrowser(url string) {
	fmt.Println(url)
	if os.Getenv("GACHA_NO_OPEN") == "" {
		exec.Command("xdg-open", url).Start()
	}
}

func main() {
	s, url, err := startServer(true)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	runBrowser(s, url)
}
