#!/bin/bash

# Infinite loop to keep scraper running
while true; do
    echo "[$(date)] Starting scraper..." >> scraper_runner.log
    node jobright_scraper.js --target-new=500 >> scraper_runner.log 2>&1
    
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "[$(date)] Scraper finished 500 jobs. Resting for 60 seconds..." >> scraper_runner.log
        sleep 60
    else
        echo "[$(date)] Scraper crashed/exited with code $EXIT_CODE. Restarting in 60 seconds..." >> scraper_runner.log
        sleep 60
    fi
done
