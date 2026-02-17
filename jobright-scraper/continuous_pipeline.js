const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const DIR = __dirname;
const NEWJOBS_FILE = path.join(DIR, 'newjobs.json');
const JOB_LINKS_FILE = path.join(DIR, 'job_links.json');
const WORKER_SCRIPT = path.join(DIR, 'unified_worker.js');
const SCRAPER_SCRIPT = path.join(DIR, 'jobright_scraper.js');
const TOTAL_WORKERS = 5;
const CHECK_INTERVAL_MS = 60000; // Check every 60s for new jobs
const MIN_BATCH = 10; // Min jobs to dispatch a batch

const SKIPPED_JOBS_FILE = path.join(DIR, 'skipped_jobs.json');

function normalizeUrl(u) {
    if (!u) return '';
    u = u.trim();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
}

const isExcluded = (job) => {
    const u = (job.url || '').toLowerCase();
    const c = (job.company || '').toLowerCase();
    const t = (job.title || '').toLowerCase();

    // 1. Speechify (Standard Exclusion)
    if (u.includes('speechify')) return true;

    // 2. Palo Alto Networks (User Request)
    if (u.includes('paloaltonetworks') || u.includes('palo-alto') || u.includes('palo%20alto')) return true;
    if (c.includes('palo alto') || c.includes('paloalto')) return true;
    if (t.includes('palo alto')) return true;

    return false;
};

function processExcludedJobs() {
    const processed = loadAllProcessedUrls();
    let allJobs = [];
    if (fs.existsSync(NEWJOBS_FILE)) {
        try { allJobs = JSON.parse(fs.readFileSync(NEWJOBS_FILE, 'utf8')); } catch (e) { }
    }

    const toSkip = [];
    for (const job of allJobs) {
        if (!job.url) continue;
        if (processed.has(normalizeUrl(job.url))) continue;
        if (isExcluded(job)) {
            toSkip.push(job);
        }
    }

    if (toSkip.length > 0) {
        console.log(`   🚫 Found ${toSkip.length} excluded jobs. Marking as SKIPPED...`);
        for (const job of toSkip) {
            const entry = { url: job.url, status: "SKIPPED_EXCLUDED", timestamp: new Date().toISOString() };
            fs.appendFileSync(SKIPPED_JOBS_FILE, JSON.stringify(entry) + '\n');
        }
    }
    return toSkip.length;
}

function loadAllProcessedUrls() {
    const urls = new Set();
    const ndjsonLoad = (file) => {
        if (fs.existsSync(file)) {
            fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                try { urls.add(normalizeUrl(JSON.parse(l).url)); } catch (e) { }
            });
        }
    };
    const jsonArrayLoad = (file) => {
        if (fs.existsSync(file)) {
            try { JSON.parse(fs.readFileSync(file, 'utf8')).forEach(a => urls.add(normalizeUrl(a.url))); } catch (e) { }
        }
    };

    // NDJSON files
    ndjsonLoad(path.join(DIR, 'jobs_applied.json'));
    ndjsonLoad(path.join(DIR, 'skipped_jobs.json'));
    ndjsonLoad(path.join(DIR, 'deleted_jobs.json'));
    for (let i = 1; i <= 10; i++) {
        ndjsonLoad(path.join(DIR, `applied_append_worker_${i}.jsonl`));
        ndjsonLoad(path.join(DIR, `failed_worker_${i}.json`));
    }
    // JSON array
    jsonArrayLoad(path.join(DIR, 'applied.json'));

    return urls;
}

function mergeJobLinksIntoNewjobs() {
    // Merge any new jobs from job_links.json into newjobs.json
    if (!fs.existsSync(JOB_LINKS_FILE)) return 0;
    let existing = [];
    const existingUrls = new Set();
    if (fs.existsSync(NEWJOBS_FILE)) {
        try {
            existing = JSON.parse(fs.readFileSync(NEWJOBS_FILE, 'utf8'));
            existing.forEach(j => existingUrls.add(j.url));
        } catch (e) { }
    }

    let newLinks = [];
    try {
        newLinks = JSON.parse(fs.readFileSync(JOB_LINKS_FILE, 'utf8'));
    } catch (e) { return 0; }

    let added = 0;
    for (const j of newLinks) {
        if (j.url && !existingUrls.has(j.url)) {
            existing.push(j);
            existingUrls.add(j.url);
            added++;
        }
    }

    if (added > 0) {
        fs.writeFileSync(NEWJOBS_FILE, JSON.stringify(existing, null, 2));
    }
    return added;
}

function getPendingJobs() {
    const processed = loadAllProcessedUrls();
    let allJobs = [];
    if (fs.existsSync(NEWJOBS_FILE)) {
        try { allJobs = JSON.parse(fs.readFileSync(NEWJOBS_FILE, 'utf8')); } catch (e) { }
    }
    return allJobs.filter(j => {
        if (!j.url) return false;
        const isGh = j.url.includes('greenhouse.io');
        const isSr = j.url.includes('smartrecruiters.com');
        if (!isGh && !isSr) return false;
        return !processed.has(normalizeUrl(j.url));
    });
}

function areWorkersRunning() {
    try {
        const out = execSync('pgrep -af "node.*unified_worker.js" 2>/dev/null || true', { encoding: 'utf8' });
        // Filter out false positives (VS Code, grep itself)
        const lines = out.trim().split('\n').filter(l => l.includes('unified_worker.js') && !l.includes('language_server') && !l.includes('pgrep'));
        return lines.length > 0;
    } catch (e) { return false; }
}

function dispatchWorkers(jobs) {
    const batchSize = Math.min(jobs.length, 2500);
    const batch = jobs.slice(0, batchSize);
    const chunkSize = Math.ceil(batch.length / TOTAL_WORKERS);

    console.log(`\n🚀 DISPATCHING ${batch.length} jobs across ${TOTAL_WORKERS} workers (~${chunkSize} each)`);

    const workers = [];
    for (let i = 0; i < TOTAL_WORKERS; i++) {
        const start = i * chunkSize;
        const chunk = batch.slice(start, start + chunkSize);
        if (chunk.length === 0) continue;

        const chunkFile = path.join(DIR, `jobs_chunk_${i + 1}.json`);
        fs.writeFileSync(chunkFile, JSON.stringify(chunk, null, 2));

        const workerId = i + 1;
        const logFile = fs.openSync(path.join(DIR, `worker_${workerId}.log`), 'a');

        const child = spawn('node', [WORKER_SCRIPT, `--worker=${workerId}`, `--chunk=${chunkFile}`], {
            detached: true,
            stdio: ['ignore', logFile, logFile],
            cwd: DIR
        });

        workers.push({ id: workerId, pid: child.pid, count: chunk.length });
        child.unref();
    }

    workers.forEach(w => console.log(`   Worker ${w.id}: PID ${w.pid} (${w.count} jobs)`));
    return workers;
}

function startScraper() {
    console.log('🔍 Starting scraper in background...');
    const logFile = fs.openSync(path.join(DIR, 'scraper_pipeline.log'), 'a');
    const child = spawn('node', [SCRAPER_SCRIPT], {
        detached: true,
        stdio: ['ignore', logFile, logFile],
        cwd: DIR
    });
    child.unref();
    console.log(`   Scraper PID: ${child.pid}`);
    return child.pid;
}

function isScraperRunning() {
    try {
        const out = execSync('pgrep -af "node.*jobright_scraper.js" 2>/dev/null || true', { encoding: 'utf8' });
        const lines = out.trim().split('\n').filter(l => l.includes('jobright_scraper.js') && !l.includes('language_server') && !l.includes('pgrep'));
        return lines.length > 0;
    } catch (e) { return false; }
}

(async () => {
    console.log('=== CONTINUOUS PIPELINE ===');
    console.log(`Target: 500 jobs/hr | Workers: ${TOTAL_WORKERS} | Check interval: ${CHECK_INTERVAL_MS / 1000}s\n`);

    // Start scraper if not running
    if (!isScraperRunning()) {
        startScraper();
    } else {
        console.log('ℹ️  Scraper already running.');
    }

    // Main loop
    let round = 0;
    while (true) {
        round++;
        console.log(`\n--- Round ${round} [${new Date().toISOString()}] ---`);

        // 1. Merge any newly scraped jobs
        const merged = mergeJobLinksIntoNewjobs();
        if (merged > 0) console.log(`   📥 Merged ${merged} new jobs from scraper`);

        // 1.5 Auto-skip excluded jobs
        processExcludedJobs();

        // 2. Check workers
        const workersActive = areWorkersRunning();
        if (workersActive) {
            console.log('   ⏳ Workers still running. Waiting...');
            await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
            continue;
        }

        // 3. Find pending jobs
        const pending = getPendingJobs();
        const processed = loadAllProcessedUrls();
        console.log(`   📊 Processed: ${processed.size} | Pending compatible: ${pending.length}`);

        if (pending.length >= MIN_BATCH) {
            dispatchWorkers(pending);
        } else if (pending.length > 0) {
            console.log(`   ℹ️  Only ${pending.length} pending (< ${MIN_BATCH}). Dispatching small batch...`);
            dispatchWorkers(pending);
        } else {
            console.log('   ⏳ No pending jobs. Waiting for scraper to find more...');
            // Restart scraper if it died
            if (!isScraperRunning()) {
                console.log('   🔄 Scraper not running. Restarting...');
                startScraper();
            }
        }

        // 4. Wait
        await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
    }
})();
