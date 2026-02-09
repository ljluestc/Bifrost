#!/bin/bash

# Configuration
TARGET_NEW=500
LOG_FILE="scraper_runner_optimized.log"

echo "=========================================="
echo "🚀 Starting Optimized Scraper Workflow"
echo "Target: $TARGET_NEW roles"
echo "=========================================="

# 1. Start Auto-Pusher in Background (if not running)
if pgrep -f "auto_pusher.sh" > /dev/null; then
    echo "✅ Auto-pusher is already running."
else
    echo "🚀 Starting auto_pusher.sh..."
    nohup ./auto_pusher.sh >> auto_pusher.log 2>&1 &
fi

# 2. Main Scraper Loop
while true; do
    echo "[$(date)] 🔄 Starting scraping cycle..." | tee -a $LOG_FILE
    
    # Run Scraper
    # We pass --target-new to control batch size per run if needed, but the node script also has internal logic.
    # We'll run it until it crashes or finishes, then restart.
    node jobright_scraper.js --target-new=$TARGET_NEW >> $LOG_FILE 2>&1
    EXIT_CODE=$?
    
    echo "[$(date)] 🛑 Scraper exited with code $EXIT_CODE." | tee -a $LOG_FILE

    # 3. Operations after each cycle
    echo "[$(date)] 🧹 Running Cleanup & Deduplication..." | tee -a $LOG_FILE
    node deduplicate_and_clean_jobs.js >> $LOG_FILE 2>&1

    # Check if we should exit (optional: infinite loop requested, so we keep going)
    echo "[$(date)] 💤 Resting for 10 seconds before next cycle..." | tee -a $LOG_FILE
    sleep 10
done
