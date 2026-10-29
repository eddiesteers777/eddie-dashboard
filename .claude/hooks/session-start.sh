#!/bin/bash
# Cloud sessions start with no dev packages, so the full test suite (and the
# accessibility check) could not run. Install them once per session.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}"
npm install --no-audit --no-fund --loglevel=error
