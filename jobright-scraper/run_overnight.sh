#!/bin/bash

# ==============================================
#  OVERNIGHT SCRAPE + APPLY LOOP
#  Continuously scrapes new jobs from JobRight.ai
#  and applies via high_throughput_runner.js
# ==============================================

LOG_FILE="overnight_run.log"
SCRAPE_TARGET=200
APPLY_COOLDOWN=30       # seconds between apply cycles
SCRAPE_COOLDOWN=300     # 5 min between scrape cycles
CYCLE_COUNT=0

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "  OVERNIGHT MODE STARTED"
log "  Scrape target per cycle: $SCRAPE_TARGET"
log "  Apply cooldown: ${APPLY_COOLDOWN}s"
log "  Scrape cooldown: ${SCRAPE_COOLDOWN}s"
log "=========================================="

# Start auto-pusher if not running
if pgrep -f "auto_pusher.sh" > /dev/null; then
    log "Auto-pusher already running."
else
    log "Starting auto_pusher.sh..."
    nohup ./auto_pusher.sh >> auto_pusher.log 2>&1 &
fi

while true; do
    CYCLE_COUNT=$((CYCLE_COUNT + 1))
    log ""
    log "============ CYCLE $CYCLE_COUNT ============"

    # --- PHASE 1: SCRAPE ---
    log "PHASE 1: Scraping $SCRAPE_TARGET new jobs..."
    timeout 600 node jobright_scraper.js --target-new=$SCRAPE_TARGET >> "$LOG_FILE" 2>&1
    SCRAPE_EXIT=$?

    if [ $SCRAPE_EXIT -eq 0 ]; then
        log "Scraper finished (target reached)."
    elif [ $SCRAPE_EXIT -eq 124 ]; then
        log "Scraper timed out (10 min). Moving to apply phase."
    else
        log "Scraper exited with code $SCRAPE_EXIT."
    fi

    # Count available jobs
    JOB_COUNT=$(node -e "
        const fs = require('fs');
        const applied = new Set();
        ['jobs_applied.json','failed_jobs.json','skipped_jobs.json','deleted_jobs.json'].forEach(f => {
            try {
                fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim()).forEach(l => {
                    try { const e=JSON.parse(l); if(e.url) applied.add(e.url.split('?')[0].replace(/\/$/,'').toLowerCase()); } catch(e){}
                });
            } catch(e){}
        });
        try {
            const jobs = JSON.parse(fs.readFileSync('job_links.json','utf8'));
            const fresh = jobs.filter(j => j.url && !applied.has(j.url.split('?')[0].replace(/\/$/,'').toLowerCase()));
            console.log(fresh.length);
        } catch(e) { console.log(0); }
    " 2>/dev/null)
    log "Jobs available in job_links.json: $JOB_COUNT"

    # --- PHASE 2: APPLY ---
    if [ "$JOB_COUNT" -gt 0 ]; then
        log "PHASE 2: Applying to $JOB_COUNT jobs..."
        timeout 1800 node high_throughput_runner.js >> "$LOG_FILE" 2>&1
        APPLY_EXIT=$?
        log "Apply runner exited with code $APPLY_EXIT."
    else
        log "PHASE 2: No fresh jobs in job_links.json. Trying newjobs.json..."

        # Check newjobs.json for retryable jobs (clear failed to retry)
        RETRY_COUNT=$(node -e "
            const fs = require('fs');
            const applied = new Set();
            ['jobs_applied.json','skipped_jobs.json','deleted_jobs.json'].forEach(f => {
                try {
                    fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim()).forEach(l => {
                        try { const e=JSON.parse(l); if(e.url) applied.add(e.url.split('?')[0].replace(/\/$/,'').toLowerCase()); } catch(e){}
                    });
                } catch(e){}
            });
            try {
                const jobs = JSON.parse(fs.readFileSync('newjobs.json','utf8'));
                const u = (s) => (s||'').split('?')[0].replace(/\/$/,'').toLowerCase();
                const fresh = jobs.filter(j => {
                    if(!j.url) return false;
                    const n = u(j.url);
                    if(applied.has(n)) return false;
                    if(!n.includes('greenhouse') && !n.includes('lever.co') && !n.includes('ashbyhq') && !n.includes('smartrecruiters')) return false;
                    return true;
                });
                console.log(fresh.length);
            } catch(e) { console.log(0); }
        " 2>/dev/null)

        if [ "$RETRY_COUNT" -gt 0 ]; then
            log "Found $RETRY_COUNT retryable jobs in newjobs.json. Clearing failed_jobs.json for retry..."
            cp failed_jobs.json "failed_jobs_backup_cycle${CYCLE_COUNT}.json" 2>/dev/null
            : > failed_jobs.json
            timeout 1800 node high_throughput_runner.js >> "$LOG_FILE" 2>&1
            log "Retry apply runner exited."
        else
            log "No retryable jobs found. Waiting for new listings..."
        fi
    fi

    # --- PHASE 3: CLEANUP ---
    log "PHASE 3: Dedup & cleanup..."
    node deduplicate_and_clean_jobs.js >> "$LOG_FILE" 2>&1

    # Stats
    APPLIED=$(wc -l < jobs_applied.json 2>/dev/null || echo 0)
    FAILED=$(wc -l < failed_jobs.json 2>/dev/null || echo 0)
    log "STATS: Applied=$APPLIED Failed=$FAILED Cycle=$CYCLE_COUNT"

    # --- COOLDOWN ---
    log "Sleeping ${SCRAPE_COOLDOWN}s before next cycle..."
    sleep $SCRAPE_COOLDOWN
done
