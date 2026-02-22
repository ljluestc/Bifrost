const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// CONFIG
const JOBS_SOURCE = 'newjobs.json';
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

        // Load permanent skips and deletes
        ['skipped_jobs.json', 'deleted_jobs.json'].forEach(file => {
            if (fs.existsSync(file)) {
                fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                    try { applied.add(normalizeUrl(JSON.parse(l).url)); } catch (e) { }
                });
            }
        });

    } catch (e) { console.error("History load error:", e.message); }
    return applied;
}

function loadJobsFromFile(filePath) {
    if (!fs.existsSync(filePath)) return [];

    let jobs = [];
    try {
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        try {
            jobs = JSON.parse(raw);
        } catch (e) {
            console.log(`⚠️ Standard JSON parse failed for ${filePath}. Attempting repair...`);

            // Strategy 1: Concatenated Arrays
            if (raw.includes('][')) {
                try {
                    const fixed = raw.replace(/\]\s*\[/g, ',');
                    jobs = JSON.parse(fixed);
                    console.log(`   ✅ Repaired concatenated arrays in ${filePath}.`);
                    return jobs;
                } catch (e) { }
            }

            // Strategy 2: Missing brackets
            if (raw.startsWith('[') && !raw.endsWith(']')) {
                try {
                    jobs = JSON.parse(raw + ']');
                    console.log(`   ✅ Repaired missing closing bracket in ${filePath}.`);
                    return jobs;
                } catch (e) { }
            }

            // Strategy 3: NDJSON / Line-based
            jobs = raw.split('\n')
                .filter(l => l.trim())
                .map(l => {
                    try { return JSON.parse(l); } catch (e) { return null; }
                })
                .filter(j => j);

            if (jobs.length > 0) {
                console.log(`   ✅ Recovered ${jobs.length} jobs via line-based parsing from ${filePath}.`);
                return jobs;
            }

            // Strategy 4: Robust "soup" parsing for really bad files (concatenated objects)
            if (raw.includes('}{')) {
                try {
                    const fixed = raw.replace(/}\s*{/g, '},{');
                    jobs = JSON.parse(`[${fixed}]`);
                    console.log(`   ✅ Recovered ${jobs.length} jobs via object-soup parsing from ${filePath}.`);
                    return jobs;
                } catch (e) { }
            }
        }
    } catch (e) {
        console.error(`❌ Failed to read/parse ${filePath}:`, e.message);
    }
    return jobs;
}

(async () => {
    console.log("🚀 STARTING PARALLEL DISPATCHER 🚀");

    // 1. Load Jobs
    let allJobs = [];

    console.log(`ℹ️  Loading ${JOBS_SOURCE}...`);
    allJobs = loadJobsFromFile(JOBS_SOURCE);

    console.log(`ℹ️  Total raw jobs loaded: ${allJobs.length}`);

    if (allJobs.length === 0) {
        console.error("❌ No jobs found in any source file!");
        process.exit(1);
    }

    // 2. Filter & Deduplicate
    const history = loadHistory();
    console.log(`ℹ️  History size: ${history.size} jobs applied.`);

    let droppedPlatform = 0;
    let droppedHistory = 0;
    let droppedInvalid = 0;

    const seenUrls = new Set();

    const pendingJobs = allJobs.filter(j => {
        if (!j.url) {
            droppedInvalid++;
            return false;
        }

        // Filter out garbage/metadata entries often found in newjobs.json
        if (j.title === "United States" || j.company === "Full-time" || j.title && j.title.includes("hours ago")) {
            droppedInvalid++;
            return false;
        }

        const u = normalizeUrl(j.url);

        // Deduplicate within current set
        if (seenUrls.has(u)) return false;
        seenUrls.add(u);

        // Platform check
        const isGh = j.url.includes('greenhouse.io') || j.url.includes('boards.greenhouse.io');
        const isSr = j.url.includes('smartrecruiters.com');
        const isLever = j.url.includes('lever.co');
        const isAshby = j.url.includes('ashbyhq');
        const isWorkday = j.url.includes('myworkdayjobs.com') || j.url.includes('workday.com');
        if (!isGh && !isSr && !isLever && !isAshby && !isWorkday) {
            droppedPlatform++;
            return false;
        }

        if (history.has(u)) {
            droppedHistory++;
            return false;
        }
        return true;
    });
    console.log(`Debug stats: Total=${allJobs.length}, DroppedInvalid=${droppedInvalid}, DroppedPlatform=${droppedPlatform}, DroppedHistory=${droppedHistory}`);

    console.log(`ℹ️  Pending Jobs: ${pendingJobs.length}`);

    if (pendingJobs.length === 0) {
        console.log("✅ No jobs to process!");
        process.exit(0);
    }

    // 3. Chunk
    // Distribute a large batch
    const BATCH_SIZE = Math.min(pendingJobs.length, 5000); // Increased batch size
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
