//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	launcher, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, "DOCX Editor could not find its launcher:", err)
		os.Exit(1)
	}
	server := filepath.Join(filepath.Dir(launcher), "..", "dist", "cli.js")

	candidates := []string{os.Getenv("CODEX_MCP_NODE_PATH")}
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		runtimes, _ := os.ReadDir(filepath.Join(local, "OpenAI", "Codex", "runtimes", "cua_node"))
		for _, runtime := range runtimes {
			if runtime.IsDir() && !strings.HasPrefix(runtime.Name(), ".") {
				candidates = append(candidates, filepath.Join(local, "OpenAI", "Codex", "runtimes", "cua_node", runtime.Name(), "bin", "node.exe"))
			}
		}
	}
	for _, key := range []string{"XDG_CACHE_HOME", "USERPROFILE"} {
		if cache := os.Getenv(key); cache != "" {
			if key == "USERPROFILE" {
				cache = filepath.Join(cache, ".cache")
			}
			candidates = append(candidates, filepath.Join(cache, "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", "node.exe"))
		}
	}
	candidates = append(candidates, os.Getenv("CODEX_BROWSER_USE_NODE_PATH"))
	if resources := os.Getenv("CODEX_ELECTRON_RESOURCES_PATH"); resources != "" {
		candidates = append(candidates, filepath.Join(resources, "cua_node", "bin", "node.exe"))
	}

	for _, node := range candidates {
		if !filepath.IsAbs(node) {
			continue
		}
		command := exec.Command(node, server, "stdio")
		command.Stdin = os.Stdin
		command.Stdout = os.Stdout
		command.Stderr = os.Stderr
		err := command.Run()
		if err == nil {
			return
		}
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			os.Exit(exit.ExitCode())
		}
	}
	fmt.Fprintln(os.Stderr, "DOCX Editor could not start the desktop app's Node.js runtime.")
	os.Exit(1)
}
