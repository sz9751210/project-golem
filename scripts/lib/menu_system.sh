#!/bin/bash

show_header() {
    check_status
    clear; echo ""
    box_top
    box_line_colored "  ${BOLD}${CYAN}🤖 Project Golem v${GOLEM_VERSION}${NC} ${DIM}(Titan Chronos)${NC}              "
    box_sep
    box_line_colored "  ${BOLD}📊 系統狀態${NC}                                          "
    box_line_colored "  Node.js: $STATUS_NODE   npm: ${DIM}v$NPM_VER${NC}               "
    box_line_colored "  Config:  $STATUS_ENV   Mode:      ${BOLD}${CYAN}$CURRENT_GOLEM_MODE${NC}           "
    box_line_colored "  Docker: $STATUS_DOCKER  Dashboard: $STATUS_DASH            "
    box_bottom; echo ""
}

show_menu() {
    show_header
    echo -e "  ${DIM}$(pick_tagline)${NC}"
    echo ""
    echo -e "  ${BOLD}${YELLOW}⚡ 核心指令${NC}"
    echo -e "  ${CYAN}───────────────────────────────────────────────${NC}"

    local options=()
    options+=("Start|🚀 啟動系統 (Start Golem & Dashboard)")
    options+=("Stop|🛑 停止系統 (Stop All Processes)")
    options+=("Install|📦 安裝與更新 (Install Deps & Build)")
    options+=("Init|🧹 完全初始化 (Reset System)")
    options+=("Docker|🐳 Docker 啟動模式 (Run with Docker)")
    options+=("DockerClean|🧹 Docker 環境清理 (Down & Prune)")
    options+=("Quit|🚪 退出")

    prompt_singleselect "" "${options[@]}"
    local choice="$SINGLESELECT_RESULT"

    case "$choice" in
        "Start")   launch_system ;;
        "Stop")    stop_system; show_menu ;;
        "Install") run_full_install ;;
        "Init")        run_clean_init; show_menu ;;
        "Docker")      launch_docker ;;
        "DockerClean") clean_docker ;;
        "Quit")        echo -e "  ${GREEN}👋 再見！${NC}"; exit 0 ;;
        *)         show_menu ;;
    esac
}

# toggle_dashboard and view_logs are now handled via Web Dashboard

stop_system() {
    local interactive="${1:-true}"
    echo ""
    echo -e "  ${YELLOW}🛑 正在停止 Golem 與 Web Dashboard...${NC}"
    local killed=0

    # 1. Kill via .golem.pid
    local pid_file="$SCRIPT_DIR/.golem.pid"
    if [ -f "$pid_file" ]; then
        local gpid
        gpid=$(cat "$pid_file")
        if kill -0 "$gpid" 2>/dev/null; then
            kill "$gpid" 2>/dev/null
            echo -e "  ${GREEN}✅ Golem 主程序已停止 (PID: $gpid)${NC}"
            killed=1
        else
            echo -e "  ${DIM}   PID $gpid 已不存在${NC}"
        fi
        rm -f "$pid_file"
    fi

    # 2. Kill anything on Dashboard port (default 3000)
    local dash_port="${DASHBOARD_PORT:-3000}"
    local dash_pids
    dash_pids=$(lsof -ti tcp:"$dash_port" 2>/dev/null)
    if [ -n "$dash_pids" ]; then
        echo "$dash_pids" | xargs kill 2>/dev/null
        echo -e "  ${GREEN}✅ Dashboard (port $dash_port) 已停止${NC}"
        killed=1
    fi

    # 3. Also kill any lingering 'node index.js' / 'npm start' spawned by setup
    local golem_pids
    golem_pids=$(pgrep -f 'node.*index\.js' 2>/dev/null)
    if [ -n "$golem_pids" ]; then
        echo "$golem_pids" | xargs kill 2>/dev/null
        echo -e "  ${GREEN}✅ 殘留 Node.js 程序已終止${NC}"
        killed=1
    fi

    # 4. Docker Cleanup
    if [ -f "$SCRIPT_DIR/docker-compose.yml" ] && command -v docker &>/dev/null; then
        if docker compose ps --format json | grep -q '"State":"running"'; then
            echo ""
            if confirm_action "偵測到 Docker 容器正在運行，是否要停止 Docker 服務?"; then
                local down_args=""
                if confirm_action "是否要一併移除 Docker Volumes (清除持久化資料)?"; then
                    down_args="-v"
                fi
                echo -e "  ${CYAN}正在關閉 Docker 容器...${NC}"
                if docker compose down $down_args; then
                    echo -e "  ${GREEN}✅ Docker 容器已停止${NC}"
                    killed=1
                else
                    echo -e "  ${RED}❌ Docker 關閉失敗${NC}"
                fi
            fi
        fi
    fi

    if [ "$killed" -eq 0 ]; then
        echo -e "  ${DIM}   找不到正在執行的 Golem 程序${NC}"
    fi

    log "System stopped via stop_system"
    echo ""

    if [ "$interactive" = true ]; then
        read -r -p "  按 Enter 返回主選單..."
    fi
}

launch_system() {
    local bg_mode=false
    local mode=""
    local auth_mode=""

    while [[ $# -gt 0 ]]; do
        case "${1:-}" in
            --bg)     bg_mode=true ;;
            --single) mode="SINGLE" ;;
            --multi)  mode="MULTI" ;;
            --admin)  auth_mode="ADMIN" ;;
            --chat)   auth_mode="CHAT" ;;
        esac
        shift
    done

    check_status

    if [ "$bg_mode" = true ]; then
        echo -e "  ${GREEN}🚀 正在以背景模式啟動 Golem v${GOLEM_VERSION}...${NC}"
        [ -n "$mode" ] && echo -e "  ${DIM}   模式: $mode${NC}"
        [ -n "$auth_mode" ] && echo -e "  ${DIM}   權限: $auth_mode${NC}"
        echo -e "  ${DIM}   所有輸出將重新導向至 logs/golem.log${NC}"
        
        mkdir -p "$SCRIPT_DIR/logs"
        
        # 建立環境變數前綴
        local env_cmd="env"
        [ -n "$mode" ] && env_cmd="$env_cmd GOLEM_MODE=$mode"
        [ -n "$auth_mode" ] && env_cmd="$env_cmd TG_AUTH_MODE=$auth_mode"
        
        nohup $env_cmd npm start > "$SCRIPT_DIR/logs/golem.log" 2>&1 &
        local pid=$!
        echo "$pid" > "$SCRIPT_DIR/.golem.pid"
        echo -e "  ${CYAN}✅ 系統已在背景啟動 (PID: $pid)${NC}"
        echo -e "  ${DIM}   你可以使用 'tail -f logs/golem.log' 查看日誌${NC}"
        log "System launched in background (PID: $pid, Mode: $mode, Auth: $auth_mode)"
        sleep 1
        return
    fi
    
    clear
    show_header

    # Pre-launch health check
    run_health_check

    if [ "$IsDashEnabled" = true ]; then
        if [ ! -d "$SCRIPT_DIR/web-dashboard/out" ] && [ ! -d "$SCRIPT_DIR/web-dashboard/node_modules" ]; then
            echo -e "  ${YELLOW}⚠️  Dashboard 已啟用但尚未建置${NC}"
            echo -e "  ${DIM}   請先執行 [4] 重建 Web Dashboard${NC}"
            echo ""
        else
            echo -e "  ${GREEN}🌐 Web Dashboard → http://localhost:${DASHBOARD_PORT:-3000}${NC}"
        fi
    fi

    echo -e "  ${CYAN}🚀 正在啟動 Golem v${GOLEM_VERSION} 控制台...${NC}"
    echo -e "  ${DIM}   正在載入 Neural Memory 與戰術介面...${NC}"
    echo -e "  ${DIM}   若要離開，請按 'q' 或 Ctrl+C${NC}"
    echo ""
    sleep 1
    log "System launched (Mode: $mode, Auth: $auth_mode)"

    # 建立環境變數前綴
    local env_cmd="env"
    [ -n "$mode" ] && env_cmd="$env_cmd GOLEM_MODE=$mode"
    [ -n "$auth_mode" ] && env_cmd="$env_cmd TG_AUTH_MODE=$auth_mode"

    $env_cmd npm run dashboard

    echo ""
    echo -e "  ${YELLOW}[INFO] 系統已停止。${NC}"
    log "System stopped"
    read -r -p "  按 Enter 返回主選單..."
    show_menu
}