#!/bin/bash

# Configuration
TARGET_NEW=500
LOG_FILE="overnight_supervisor.log"
BACKUP_BRANCH="backup/job-scraper"

echo "[$(date)] 🚀 Starting Overnight Supervisor Pipeline" | tee -a $LOG_FILE

while true; do
  echo "===================================================" | tee -a $LOG_FILE
  echo "[$(date)] 🔄 STARTING NEW CYCLE" | tee -a $LOG_FILE
  
  # 1. Scrape 500 new jobs
  echo "[$(date)] 🔗 Scraping 500 new jobs..." | tee -a $LOG_FILE
  node jobright_scraper.js --target-new=$TARGET_NEW >> $LOG_FILE 2>&1
  
  # 2. Deduplicate and merge into backlog
  echo "[$(date)] 🧹 Deduplicating and merging into backlog..." | tee -a $LOG_FILE
  node deduplicate_and_clean_jobs.js >> $LOG_FILE 2>&1
  
  # 3. Apply to jobs in parallel
  echo "[$(date)] 🚀 Spawning parallel workers for application..." | tee -a $LOG_FILE
  node parallel_dispatcher.js >> $LOG_FILE 2>&1
  
  # 4. Periodic Git Push for persistence
  echo "[$(date)] ⬆️ Pushing updates to git..." | tee -a $LOG_FILE
  git add job_links.json newjobs.json jobs_applied.json
  git commit -m "overnight update: $(date)" || echo "No changes to commit" | tee -a $LOG_FILE
  
  if git push origin "$BACKUP_BRANCH"; then
    echo "✅ Git push successful." | tee -a $LOG_FILE
  else
    echo "❌ Git push failed. Re-trying rebase..." | tee -a $LOG_FILE
    git pull --rebase origin "$BACKUP_BRANCH"
    git push origin "$BACKUP_BRANCH"
  fi
  
  echo "[$(date)] ✅ CYCLE COMPLETE. Resting for 60 seconds..." | tee -a $LOG_FILE
  sleep 60
done
