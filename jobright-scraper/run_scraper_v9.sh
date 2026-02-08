#!/bin/bash

# Infinite loop to keep scraper v9 running
while true; do
    echo "[$(date)] Starting scraper v9..." >> scraper_runner_v9.log
    # Pass arguments if needed, e.g. --target-new=500
    # The script itself has a default target of 500 or uses --target-new
    node jobright_scraper.js --target-new=500 >> scraper_runner_v9.log 2>&1
    
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "[$(date)] Scraper v9 finished (target reached?). Resting for 60 seconds..." >> scraper_runner_v9.log
        sleep 60
    else
        echo "[$(date)] Scraper v9 crashed/exited with code $EXIT_CODE. Restarting in 60 seconds..." >> scraper_runner_v9.log
        sleep 60
    fi
done
