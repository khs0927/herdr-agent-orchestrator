#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT="${1:-$PWD}"
LABEL="${2:-ai-team}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

for cmd in herdr jq claude codex opencode aside agy; do
  need "$cmd"
done

mkdir -p "$PROJECT"
if ! git -C "$PROJECT" rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "$PROJECT is not a Git repository. Initializing..."
  git -C "$PROJECT" init
fi

# Ensure Herdr daemon is running
if ! herdr status server >/dev/null 2>&1; then
  echo "Herdr server is not running. Starting in background..."
  nohup herdr server >/dev/null 2>&1 &
  sleep 2
fi

echo "Creating workspace for $PROJECT with label $LABEL..."
created="$(herdr workspace create \
  --cwd "$PROJECT" \
  --label "$LABEL" \
  --no-focus)"

workspace_id="$(printf '%s\n' "$created" | jq -r '.result.workspace.workspace_id')"
root_pane="$(printf '%s\n' "$created" | jq -r '.result.root_pane.pane_id')"

echo "Workspace created: $workspace_id (Root pane: $root_pane)"

split_right="$(herdr pane split "$root_pane" --direction right --no-focus)"
claude_pane="$(printf '%s\n' "$split_right" | jq -r '.result.pane.pane_id')"

split_down="$(herdr pane split "$root_pane" --direction down --no-focus)"
codex_pane="$(printf '%s\n' "$split_down" | jq -r '.result.pane.pane_id')"

split_agy="$(herdr pane split "$claude_pane" --direction down --no-focus)"
agy_pane="$(printf '%s\n' "$split_agy" | jq -r '.result.pane.pane_id')"

echo "Panes allocated:"
echo " - OpenCode (root): $root_pane"
echo " - Claude: $claude_pane"
echo " - Codex: $codex_pane"
echo " - Antigravity (agy): $agy_pane"

echo "Starting agents in their respective panes..."
herdr agent start opencode-builder --kind opencode --pane "$root_pane" --timeout 60000
herdr agent start claude-review --kind claude --pane "$claude_pane" --timeout 60000
herdr agent start codex-test --kind codex --pane "$codex_pane" --timeout 60000
herdr agent start agy-planner --kind agy --pane "$agy_pane" --timeout 60000

echo "All agents started successfully."
herdr agent list
