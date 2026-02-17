#!/bin/bash
echo "🔪 Killing all chrome/node processes..."
pkill -f "chrome"
pkill -f "unified_worker.js"
sleep 2

echo "🧹 Wiping user data directories..."
rm -rf user_data_worker_*
mkdir -p user_data_worker_1
mkdir -p user_data_worker_2
mkdir -p user_data_worker_3
mkdir -p user_data_worker_4
mkdir -p user_data_worker_5

echo "✨ Cleanup complete."
