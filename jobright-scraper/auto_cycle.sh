#!/bin/bash

# auto_cycle.sh
# Infinite loop to run scraper and parallel dispatcher in cycle to maintain 500 jobs/hr.

echo ">>> STARTING AUTO CYCLE <<<"

while true; do
    echo "---------------------------------------------------"
    echo "[$(date)] Starting Scraper (Background)..."
    # Run scraper in background to target 500 new jobs
    # Log to a separate file
    node jobright_scraper.js --target-new=500 >> scraper_cycle.log 2>&1 &
    SCRAPER_PID=$!
    
    echo "[$(date)] Starting Dispatcher (Foreground)..."
    # Run dispatcher. It will process pending jobs from job_links.json
    node parallel_dispatcher.js
    
    echo "[$(date)] Waiting for Scraper (PID $SCRAPER_PID)..."
    wait $SCRAPER_PID
    
    # Merge step removed as workers now write directly to jobs_applied.json
    # echo "[$(date)] Merging applied logs..."
    # cat applied_append_worker_*.jsonl >> jobs_applied.json 2>/dev/null
    # rm applied_append_worker_*.jsonl 2>/dev/null
    
    echo "[$(date)] Cycle complete. Resting 5s..."
    sleep 5
done
