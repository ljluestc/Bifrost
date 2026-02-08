#!/bin/bash

# Configuration
INTERVAL=300 # 5 minutes in seconds
BRANCH="backup/job-scraper"
REMOTE="origin"
FILE="job_links.json"

echo "🚀 Starting Auto-Pusher for $FILE every $INTERVAL seconds..."

while true; do
    echo "Check-in at $(date)..."
    
    if [[ -f "$FILE" ]]; then
        # Check if there are changes
        if ! git diff --quiet "$FILE"; then
            echo "📝 Changes detected. Committing..."
            git add "$FILE"
            git commit -m "update jobs: $(date)" || echo "⚠️ Commit failed (maybe nothing to commit?)"
            
            echo "⬆️ Pushing to $REMOTE $BRANCH..."
            if git push "$REMOTE" "$BRANCH"; then
                echo "✅ Push successful."
            else
                echo "❌ Push failed. Will retry next cycle."
            fi
        else
            echo "💤 No changes in $FILE."
        fi
    else
        echo "⚠️ $FILE not found!"
    fi

    echo "⏳ Sleeping for $INTERVAL seconds..."
    sleep $INTERVAL
done
