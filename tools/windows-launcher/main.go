// Command launch-desktop-mcp starts the MCP server on Windows with a Node.js
// that the desktop app provides. It follows scripts/launch-desktop-mcp, the
// macOS launcher: host variables first, then guessed runtimes, then PATH.
package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// minNodeMajor is the oldest Node.js that runs dist/cli.js.
const minNodeMajor = 22

func main() {
	launcher, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, "DOCX Editor could not find its launcher:", err)
		os.Exit(1)
	}
	server := filepath.Join(filepath.Dir(launcher), "..", "dist", "cli.js")

	nodes := candidates(os.Getenv, os.ReadDir)
	// PATH comes last: an old Node.js there must not win over the app's own.
	if node, err := exec.LookPath("node"); err == nil {
		nodes = append(nodes, node)
	}
	tried := map[string]bool{}
	for _, node := range nodes {
		key := strings.ToLower(filepath.Clean(node))
		if tried[key] || !filepath.IsAbs(node) || !usable(node) {
			continue
		}
		tried[key] = true
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
		// The process did not start, so the server read no input. Try the next one.
	}
	// The host log keeps stderr. Say why, instead of exiting with no tools.
	fmt.Fprintf(os.Stderr, "DOCX Editor could not find Node.js %d or later. Update ChatGPT or install Node.js.\n", minNodeMajor)
	os.Exit(127)
}

// candidates lists Node.js paths in the order the macOS launcher tries them.
func candidates(getenv func(string) string, readDir func(string) ([]os.DirEntry, error)) []string {
	node := filepath.Join("bin", "node.exe")
	list := []string{getenv("CODEX_MCP_NODE_PATH"), getenv("CODEX_BROWSER_USE_NODE_PATH")}
	if resources := getenv("CODEX_ELECTRON_RESOURCES_PATH"); resources != "" {
		list = append(list, filepath.Join(resources, "cua_node", node))
	}
	if cli := getenv("CODEX_CLI_PATH"); filepath.IsAbs(cli) {
		list = append(list, filepath.Join(filepath.Dir(cli), "cua_node", node))
	}
	// Directory installs can omit the host's variables, so the app's runtimes follow.
	runtime := filepath.Join("codex-runtimes", "codex-primary-runtime", "dependencies", "node", node)
	if cache := getenv("XDG_CACHE_HOME"); cache != "" {
		list = append(list, filepath.Join(cache, runtime))
	}
	if profile := getenv("USERPROFILE"); profile != "" {
		list = append(list, filepath.Join(profile, ".cache", runtime))
	}
	if local := getenv("LOCALAPPDATA"); local != "" {
		dir := filepath.Join(local, "OpenAI", "Codex", "runtimes", "cua_node")
		entries, _ := readDir(dir)
		var names []string
		for _, entry := range entries {
			if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
				names = append(names, entry.Name())
			}
		}
		// Newest first: an app update leaves older runtimes behind.
		sort.SliceStable(names, func(i, j int) bool { return newer(names[i], names[j]) })
		for _, name := range names {
			list = append(list, filepath.Join(dir, name, node))
		}
	}
	return list
}

// newer orders version-like names by their numbers, highest first.
func newer(a, b string) bool {
	x, y := numbers(a), numbers(b)
	for i := 0; i < len(x) && i < len(y); i++ {
		if x[i] != y[i] {
			return x[i] > y[i]
		}
	}
	if len(x) != len(y) {
		return len(x) > len(y)
	}
	return a > b
}

func numbers(name string) []int {
	var out []int
	for _, field := range strings.FieldsFunc(name, func(r rune) bool { return r < '0' || r > '9' }) {
		n, err := strconv.Atoi(field)
		if err != nil {
			n = 0
		}
		out = append(out, n)
	}
	return out
}

// usable runs the candidate once, so a stale or broken runtime does not end the search.
func usable(node string) bool {
	info, err := os.Stat(node)
	if err != nil || !info.Mode().IsRegular() {
		return false
	}
	out, err := exec.Command(node, "--version").Output()
	if err != nil {
		return false
	}
	return nodeMajor(string(out)) >= minNodeMajor
}

// nodeMajor reads the major version from `node --version` output such as "v22.12.0".
func nodeMajor(version string) int {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	major, _, _ := strings.Cut(version, ".")
	n, err := strconv.Atoi(major)
	if err != nil {
		return 0
	}
	return n
}
