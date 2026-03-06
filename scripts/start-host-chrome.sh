#!/bin/bash

# Configuration
PORT=9221       # Actual Chrome port (hidden behind proxy)
PROXY_PORT=9222 # Port exposed to Docker
USER_DATA_DIR="/tmp/remote-profile"

# Auto-detect Chrome path based on OS
detect_chrome() {
    case "$(uname -s)" in
        Darwin)
            echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            ;;
        Linux)
            for bin in google-chrome-stable google-chrome chromium-browser chromium; do
                if command -v "$bin" &>/dev/null; then
                    echo "$bin"
                    return
                fi
            done
            echo ""
            ;;
    esac
}

CHROME_PATH="$(detect_chrome)"

if [ -z "$CHROME_PATH" ] || ([ ! -f "$CHROME_PATH" ] && ! command -v "$CHROME_PATH" &>/dev/null); then
    echo "❌ Error: Google Chrome not found."
    echo "   macOS: Expected at /Applications/Google Chrome.app/"
    echo "   Linux: Install via 'apt install google-chrome-stable' or 'chromium-browser'"
    exit 1
fi

# Check if something is on the proxy port
if lsof -i :$PROXY_PORT >/dev/null 2>&1; then
    echo "⚠️  Port $PROXY_PORT is already in use. Attempting to restart..."
    # Kill whatever is using the port (works on Mac)
    lsof -ti :$PROXY_PORT | xargs kill -9 2>/dev/null
fi

echo "🚀 Launching Chrome on internal port $PORT..."
echo "📂 User Data Dir: $USER_DATA_DIR (Temporary profile)"

# Launch Chrome in background
"$CHROME_PATH" \
  --remote-debugging-port=$PORT \
  --remote-allow-origins=* \
  --no-first-run \
  --no-default-browser-check \
  --user-data-dir="$USER_DATA_DIR" >/dev/null 2>&1 &

CHROME_PID=$!

# Launch Proxy
echo "🌉 Starting CDP Proxy on port $PROXY_PORT..."
node "$(dirname "$0")/lib/cdp-proxy.js" &
PROXY_PID=$!

# Cleanup on exit
trap "kill $CHROME_PID $PROXY_PID 2>/dev/null" EXIT

echo "✅ System ready (Chrome: $CHROME_PID, Proxy: $PROXY_PID)"

# Wait for background processes
wait $CHROME_PID
