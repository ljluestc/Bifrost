const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// CONFIG
const JOBS_SOURCE = 'job_links.json';
const WORKER_SCRIPT = 'unified_worker.js';
const TOTAL_WORKERS = 5; // Target: 5 workers (approx 100 jobs/hr each -> 500/hr)
const CHUNK_PREFIX = 'jobs_chunk_';

// FILES TO MONITOR
const APPLIED_FILE = 'applied.json';
const APPLIED_APPEND_FILES = Array.from({ length: TOTAL_WORKERS }, (_, i) => `applied_append_worker_${i + 1}.jsonl`);
const FAILED_FILES = Array.from({ length: TOTAL_WORKERS }, (_, i) => `failed_worker_${i + 1}.json`);

function normalizeUrl(u) {
    if (!u) return '';
    u = u.trim();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
}

function loadHistory() {
    const applied = new Set();
    try {
        if (fs.existsSync(APPLIED_FILE)) JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf8')).forEach(a => applied.add(normalizeUrl(a.url)));

        // Load worker append files
        APPLIED_APPEND_FILES.forEach(f => {
            if (fs.existsSync(f)) {
                fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                    try { applied.add(normalizeUrl(JSON.parse(l).url)); } catch (e) { }
                });
            }
        });

        // Also check main log
        if (fs.existsSync('jobs_applied.json')) {
            fs.readFileSync('jobs_applied.json', 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                try { applied.add(normalizeUrl(JSON.parse(l).url)); } catch (e) { }
            });
        }

    } catch (e) { console.error("History load error:", e.message); }
    return applied;
}

(async () => {
    console.log("🚀 STARTING PARALLEL DISPATCHER 🚀");

    // 1. Load Jobs
    if (!fs.existsSync(JOBS_SOURCE)) {
        console.error(`❌ Source file ${JOBS_SOURCE} not found!`);
        process.exit(1);
    }

    let allJobs = [];
    try {
        const raw = fs.readFileSync(JOBS_SOURCE, 'utf8');
        try {
            allJobs = JSON.parse(raw);
        } catch (e) {
            console.log("⚠️ Standard JSON parse failed. Attempting repair...");
            if (raw.includes('][')) {
                try {
                    const fixed = raw.replace(/\]\s*\[/g, ',');
                    allJobs = JSON.parse(fixed);
                    console.log("   ✅ Repaired concatenated arrays (][).");
                } catch (e2) {
                    // Fallback: splitting by ][ and taking all
                    const parts = raw.split(/\]\s*\[/);
                    allJobs = parts.map(p => {
                        let s = p.trim();
                        if (!s.startsWith('[')) s = '[' + s;
                        if (!s.endsWith(']')) s = s + ']';
                        try { return JSON.parse(s); } catch (e) { return []; }
                    }).flat();
                    console.log(`   ✅ Fallback split recovered ${allJobs.length} jobs.`);
                }
            } else {
                // Try appending ']' if starts with '['
                const trimmed = raw.trim();
                if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
                    try {
                        allJobs = JSON.parse(trimmed + ']');
                        console.log("   ✅ Repaired missing closing bracket.");
                    } catch (e3) {
                        console.log("   ⚠️ Missing bracket repair failed.");
                    }
                }

                if (allJobs.length === 0) {
                    // Try NDJSON/Line-based as last resort
                    allJobs = raw.split('\n').filter(l => l.trim()).map(l => {
                        try { return JSON.parse(l); } catch (e) { return null; }
                    }).filter(j => j);
                }
            }
        }
    } catch (e) {
        console.error("❌ Failed to parse source JSON:", e.message);
        process.exit(1);
    }

    // 2. Filter
    const history = loadHistory();
    console.log(`ℹ️  History size: ${history.size} jobs applied.`);

    let droppedPlatform = 0;
    let droppedHistory = 0;
    const pendingJobs = allJobs.filter(j => {
        if (!j.url) return false;
        const u = normalizeUrl(j.url);
        // Platform check (optional, but worker does it too)
        const isGh = j.url.includes('greenhouse.io') || j.url.includes('boards.greenhouse.io');
        const isSr = j.url.includes('smartrecruiters.com');
        if (!isGh && !isSr) {
            droppedPlatform++;
            return false;
        }

        if (history.has(u)) {
            droppedHistory++;
            return false;
        }
        return true;
    });
    console.log(`Debug stats: Total=${allJobs.length}, DroppedPlatform=${droppedPlatform}, DroppedHistory=${droppedHistory}`);

    console.log(`ℹ️  Pending Jobs: ${pendingJobs.length}`);

    if (pendingJobs.length === 0) {
        console.log("✅ No jobs to process!");
        process.exit(0);
    }

    // 3. Chunk
    // We want to distribute all pending jobs or a subset?
    // Let's take up to 2000 jobs to process in this batch
    const BATCH_SIZE = Math.min(pendingJobs.length, 2500);
    const jobsToProcess = pendingJobs.slice(0, BATCH_SIZE);

    const chunkSize = Math.ceil(jobsToProcess.length / TOTAL_WORKERS);
    console.log(`ℹ️  Batch Size: ${jobsToProcess.length} | Workers: ${TOTAL_WORKERS} | Chunk Size: ~${chunkSize}`);

    const workers = [];

    for (let i = 0; i < TOTAL_WORKERS; i++) {
        const start = i * chunkSize;
        const end = start + chunkSize;
        const chunk = jobsToProcess.slice(start, end);

        if (chunk.length === 0) continue;

        const chunkFilename = `${CHUNK_PREFIX}${i + 1}.json`;
        fs.writeFileSync(chunkFilename, JSON.stringify(chunk, null, 2));
        console.log(`   📄 Created ${chunkFilename} with ${chunk.length} jobs.`);

        // Spawn Worker
        const workerId = i + 1;
        const logFile = fs.openSync(`worker_${workerId}.log`, 'a');

        console.log(`   🚀 Spawning Worker ${workerId}...`);

        // Check if worker is already running
        const pidFile = `worker_${workerId}.pid`;
        if (fs.existsSync(pidFile)) {
            try {
                const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
                // Check if process exists
                process.kill(pid, 0);
                console.log(`   ⚠️ Worker ${workerId} is already running (PID ${pid}). Skipping spawn.`);
                workers.push({ id: workerId, pid: pid });
                continue;
            } catch (e) {
                // Process not found or file invalid, proceed
                fs.unlinkSync(pidFile);
            }
        }

        const child = spawn('node', [WORKER_SCRIPT, `--worker=${workerId}`, `--chunk=${chunkFilename}`], {
            detached: true,
            stdio: ['ignore', logFile, logFile]
        });
        fs.writeFileSync(pidFile, child.pid.toString());

        workers.push({ id: workerId, pid: child.pid });

        child.unref(); // Allow dispatcher to exit if we want, but let's wait to monitor?
        // Actually, if we want to run "forever", we should keep dispatcher alive or use PM2.
        // For now, let's just spawn and exit, or maybe wait for them?
        // User asked for "continue apply", so a robust runner would handle restarts.
        // But for this step, let's just launch them.
    }

    console.log(`✅ Dispatched ${workers.length} workers.`);
    console.log(`ℹ️  Logs are being written to worker_X.log`);
    console.log(`ℹ️  To stop, run: pkill -f "unified_worker.js"`);

})();
