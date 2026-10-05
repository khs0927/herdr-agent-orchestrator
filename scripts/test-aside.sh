#!/usr/bin/env bash
set -Eeuo pipefail
command -v aside >/dev/null || { echo "aside is missing" >&2; exit 1; }
echo "Checking aside version and account status..."
aside --version
aside account status

echo "Testing aside mcp subprocess..."
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
python3 -c "
import subprocess, time, sys
p = subprocess.Popen(['aside', 'mcp'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(2)
if p.poll() is None:
    print('Aside MCP process started and running cleanly.')
    p.terminate()
    sys.exit(0)
else:
    print('Aside MCP exited with code', p.returncode)
    out, err = p.communicate()
    print('stdout:', out.decode())
    print('stderr:', err.decode())
    sys.exit(1)
"
