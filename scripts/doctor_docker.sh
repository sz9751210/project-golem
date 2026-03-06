#!/bin/bash

# ==========================================
# 🩺 Golem Docker-to-Host Connectivity Doctor
# ==========================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}--- Golem Docker Connectivity Diagnostic ---${NC}"

# 1. Check if running inside Docker
if [ ! -f "/.dockerenv" ]; then
    echo -e "${YELLOW}ℹ  Note: This script is intended to be run INSIDE the Golem Docker container.${NC}"
    echo -e "   Run: ${BOLD}docker exec -it golem-core /app/scripts/doctor_docker.sh${NC}\n"
fi

# 2. Test Host Resolution
REMOTE_HOST=${PUPPETEER_REMOTE_HOST:-host.docker.internal}
REMOTE_PORT=${PUPPETEER_REMOTE_DEBUGGING_PORT:-9222}

echo -e "🔍 Testing resolution of '${BOLD}$REMOTE_HOST${NC}'..."
HOST_IP=$(getent hosts "$REMOTE_HOST" | awk '{ print $1 }')

if [ -n "$HOST_IP" ]; then
    echo -e "   ${GREEN}✅ Resolved to $HOST_IP${NC}"
else
    echo -e "   ${RED}❌ Failed to resolve $REMOTE_HOST${NC}"
    echo -e "   💡 Fix: Check 'extra_hosts' in your docker-compose.yml"
fi

# 3. Test Port Connectivity
echo -e "🔍 Testing connection to $REMOTE_HOST:$REMOTE_PORT..."
if command -v timeout &>/dev/null; then
    if timeout 2 bash -c "</dev/tcp/$REMOTE_HOST/$REMOTE_PORT" 2>/dev/null; then
        echo -e "   ${GREEN}✅ Port $REMOTE_PORT is accessible!${NC}"
    else
        echo -e "   ${RED}❌ Port $REMOTE_PORT is NOT accessible.${NC}"
        echo -e "   💡 Fix: Ensure './scripts/start-host-chrome.sh' is running on host."
        echo -e "   💡 Fix: Ensure host firewall allows connections to port $REMOTE_PORT."
    fi
else
    echo -e "   ${YELLOW}⚠️  'timeout' command not found, skipping TCP test.${NC}"
fi

# 4. JSON Version Check
echo -e "🔍 Fetching Browser Version from http://$REMOTE_HOST:$REMOTE_PORT/json/version..."
RESPONSE=$(curl -s -H "Host: localhost" --max-time 3 "http://$REMOTE_HOST:$REMOTE_PORT/json/version")

if [ $? -eq 0 ] && echo "$RESPONSE" | grep -q "webSocketDebuggerUrl"; then
    echo -e "   ${GREEN}✅ Successfully retrieved browser metadata!${NC}"
    echo -e "   ${DIM}$RESPONSE${NC}"
else
    echo -e "   ${RED}❌ Failed to retrieve metadata.${NC}"
    [ -n "$RESPONSE" ] && echo -e "   Output: $RESPONSE"
fi

echo -e "\n${CYAN}--- Diagnostic Complete ---${NC}"
