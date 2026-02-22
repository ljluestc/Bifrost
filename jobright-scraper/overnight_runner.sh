#!/usr/bin/env bash
# ============================================================
#  OVERNIGHT SCRAPE + APPLY LOOP
#  - Scrapes fresh jobs from top 50 tech companies every 2hrs
#  - Applies to all new jobs via high_throughput_runner
#  - Handles crashes, restarts, and rate limiting
#
#  Usage:
#    nohup bash overnight_runner.sh > overnight.log 2>&1 &
#    # or: screen -S overnight bash overnight_runner.sh
# ============================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/overnight.log"
SCRAPE_INTERVAL=7200  # 2 hours between scrapes
APPLY_TIMEOUT=1800    # 30 min max per apply cycle (then re-scrape)
APPLY_COOLDOWN=60     # 60s between apply cycles if queue empties fast

log() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1" | tee -a "$LOG"
}

cleanup() {
    log "🛑 Overnight runner stopping (PID $$)..."
    # Kill child processes
    kill $(jobs -p) 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

log "🌙 =============================================="
log "🌙  OVERNIGHT RUNNER STARTED (PID: $$)"
log "🌙  Scrape interval: ${SCRAPE_INTERVAL}s"
log "🌙  Apply timeout: ${APPLY_TIMEOUT}s"
log "🌙 =============================================="

CYCLE=0
while true; do
    CYCLE=$((CYCLE + 1))
    log ""
    log "🔄 ===== CYCLE $CYCLE ====="

    # --- STEP 1: SCRAPE FRESH JOBS ---
    log "📡 Step 1: Scraping fresh jobs from top 50 tech companies..."
    timeout 300 node "$DIR/direct_ats_scraper.js" 2>&1 | tee -a "$LOG"
    SCRAPE_EXIT=$?
    if [ $SCRAPE_EXIT -ne 0 ]; then
        log "⚠️ Scraper exited with code $SCRAPE_EXIT"
    fi

    # Count available jobs
    JOB_COUNT=$(node -e "
        const fs = require('fs');
        try {
            const jobs = JSON.parse(fs.readFileSync('$DIR/job_links.json', 'utf8'));
            console.log(jobs.length);
        } catch(e) { console.log(0); }
    " 2>/dev/null)
    log "📊 Jobs in queue: $JOB_COUNT"

    if [ "$JOB_COUNT" -eq 0 ] || [ -z "$JOB_COUNT" ]; then
        log "⏳ No new jobs found. Sleeping ${SCRAPE_INTERVAL}s before next scrape..."
        sleep $SCRAPE_INTERVAL
        continue
    fi

    # --- STEP 2: APPLY TO JOBS ---
    log "🚀 Step 2: Applying to $JOB_COUNT jobs..."
    timeout $APPLY_TIMEOUT node "$DIR/high_throughput_runner.js" 2>&1 | tee -a "$LOG"
    APPLY_EXIT=$?

    if [ $APPLY_EXIT -eq 124 ]; then
        log "⏰ Apply cycle timed out after ${APPLY_TIMEOUT}s — rotating to re-scrape"
    elif [ $APPLY_EXIT -ne 0 ]; then
        log "⚠️ Apply runner exited with code $APPLY_EXIT"
        log "⏳ Cooling down 30s before retry..."
        sleep 30
    fi

    # --- STEP 3: STATS ---
    APPLIED_COUNT=$(wc -l < "$DIR/jobs_applied.json" 2>/dev/null || echo 0)
    FAILED_COUNT=$(wc -l < "$DIR/failed_jobs.json" 2>/dev/null || echo 0)
    log "📊 Cumulative: $APPLIED_COUNT applied, $FAILED_COUNT failed"

    # --- STEP 4: WAIT BEFORE NEXT CYCLE ---
    log "⏳ Cycle $CYCLE complete. Sleeping ${APPLY_COOLDOWN}s before next cycle..."
    sleep $APPLY_COOLDOWN
done
