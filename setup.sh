#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
if [ "${1:-}" = '--help' ]; then
    echo 'Usage: bash setup.sh [--package /path/to/ACS.pkg]'
    echo 'Installs native reader prerequisites and app dependencies. Does not install the legacy server.'
    exit 0
fi
if [ "$#" -ne 0 ]; then
    if [ "$#" -ne 2 ] || [ "$1" != '--package' ]; then
        echo 'Usage: bash setup.sh [--package /path/to/ACS.pkg]' >&2
        echo 'For a check without installation, use scripts/install-reader-driver.sh --check.' >&2
        exit 2
    fi
fi
echo 'RFID Scanner Setup - ACR122 (native PC/SC)'
for dependency in node npm cargo; do
    command -v "$dependency" >/dev/null 2>&1 || {
        echo "Missing prerequisite: $dependency. Install Node.js and Rust before setup." >&2
        exit 1
    }
done
bash scripts/install-reader-driver.sh "$@"
npm install
echo 'Setup finished. Connect the reader, run npm run dev, and select Device test.'
