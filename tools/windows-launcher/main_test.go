package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

type dir string

func (d dir) Name() string               { return string(d) }
func (d dir) IsDir() bool                { return true }
func (d dir) Type() fs.FileMode          { return fs.ModeDir }
func (d dir) Info() (fs.FileInfo, error) { return nil, nil }

func TestCandidatesFollowTheMacOSOrder(t *testing.T) {
	env := map[string]string{
		"CODEX_MCP_NODE_PATH":           `mcp`,
		"CODEX_BROWSER_USE_NODE_PATH":   `browser`,
		"CODEX_ELECTRON_RESOURCES_PATH": `res`,
		"CODEX_CLI_PATH":                filepath.Join(string(filepath.Separator)+"app", "codex.exe"),
		"XDG_CACHE_HOME":                `xdg`,
		"USERPROFILE":                   `home`,
		"LOCALAPPDATA":                  `local`,
	}
	readDir := func(string) ([]os.DirEntry, error) {
		return []os.DirEntry{dir("22.9.0"), dir(".tmp"), dir("24.1.0"), dir("22.10.0")}, nil
	}
	node := filepath.Join("bin", "node.exe")
	runtime := filepath.Join("codex-runtimes", "codex-primary-runtime", "dependencies", "node", node)
	runtimes := filepath.Join("local", "OpenAI", "Codex", "runtimes", "cua_node")
	want := []string{
		"mcp",
		"browser",
		filepath.Join("res", "cua_node", node),
		filepath.Join(string(filepath.Separator)+"app", "cua_node", node),
		filepath.Join("xdg", runtime),
		filepath.Join("home", ".cache", runtime),
		filepath.Join(runtimes, "24.1.0", node),
		filepath.Join(runtimes, "22.10.0", node),
		filepath.Join(runtimes, "22.9.0", node),
	}
	got := candidates(func(key string) string { return env[key] }, readDir)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("candidates:\n got %q\nwant %q", got, want)
	}
}

func TestCandidatesSkipARelativeCLIPath(t *testing.T) {
	got := candidates(func(key string) string {
		if key == "CODEX_CLI_PATH" {
			return "codex.exe"
		}
		return ""
	}, os.ReadDir)
	if !reflect.DeepEqual(got, []string{"", ""}) {
		t.Fatalf("candidates: %q", got)
	}
}

func TestNodeMajor(t *testing.T) {
	for input, want := range map[string]int{"v22.12.0\n": 22, "v18.0.0": 18, "v24": 24, "": 0, "junk": 0} {
		if got := nodeMajor(input); got != want {
			t.Errorf("nodeMajor(%q) = %d, want %d", input, got, want)
		}
	}
}
