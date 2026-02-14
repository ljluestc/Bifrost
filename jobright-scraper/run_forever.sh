#!/bin/bash
# run_forever.sh — Keeps scraper, runner, and pusher alive forever.
# Usage: nohup ./run_forever.sh > forever.log 2>&1 &

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

SCRAPER_CMD="node jobright_scraper.js --target-new=500"
RUNNER_CMD="node autonomous_session_runner.js"
PUSHER_CMD="bash auto_pusher.sh"

SCRAPER_PID=""
RUNNER_PID=""
PUSHER_PID=""

RESTART_DELAY=10  # seconds between restart attempts
BROWSER_LOCK_DIR="$SCRIPT_DIR/user_data_learning_session"

cleanup() {
    echo "[$(date -Iseconds)] Shutting down all processes..."
    [ -n "$SCRAPER_PID" ] && kill "$SCRAPER_PID" 2>/dev/null
    [ -n "$RUNNER_PID" ] && kill "$RUNNER_PID" 2>/dev/null
    [ -n "$PUSHER_PID" ] && kill "$PUSHER_PID" 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

start_scraper() {
    $SCRAPER_CMD >> "$SCRIPT_DIR/scraper.log" 2>&1 &
    SCRAPER_PID=$!
    echo "[$(date -Iseconds)] ✅ Scraper started (PID $SCRAPER_PID)"
}

start_runner() {
    # Clear browser locks before starting
    rm -f "$BROWSER_LOCK_DIR/SingletonLock" \
          "$BROWSER_LOCK_DIR/SingletonCookie" \
          "$BROWSER_LOCK_DIR/SingletonSocket" 2>/dev/null
    $RUNNER_CMD >> "$SCRIPT_DIR/runner.log" 2>&1 &
    RUNNER_PID=$!
    echo "[$(date -Iseconds)] ✅ Runner started (PID $RUNNER_PID)"
}

start_pusher() {
    $PUSHER_CMD >> "$SCRIPT_DIR/pusher.log" 2>&1 &
    PUSHER_PID=$!
    echo "[$(date -Iseconds)] ✅ Pusher started (PID $PUSHER_PID)"
}

is_alive() {
    kill -0 "$1" 2>/dev/null
}

# Initial start
echo "[$(date -Iseconds)] 🚀 Starting all processes..."
start_scraper
start_runner
start_pusher

# Watchdog loop — check every 15 seconds
while true; do
    sleep 15

    if ! is_alive "$SCRAPER_PID"; then
        echo "[$(date -Iseconds)] ⚠️  Scraper died (was PID $SCRAPER_PID). Restarting in ${RESTART_DELAY}s..."
        sleep "$RESTART_DELAY"
        start_scraper
    fi

    if ! is_alive "$RUNNER_PID"; then
        echo "[$(date -Iseconds)] ⚠️  Runner died (was PID $RUNNER_PID). Restarting in ${RESTART_DELAY}s..."
        sleep "$RESTART_DELAY"
        start_runner
    fi

    if ! is_alive "$PUSHER_PID"; then
        echo "[$(date -Iseconds)] ⚠️  Pusher died (was PID $PUSHER_PID). Restarting in ${RESTART_DELAY}s..."
        sleep "$RESTART_DELAY"
        start_pusher
    fi
done
