const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const PROJECT_DIR = path.resolve(__dirname);
const NEWJOBS_FILE = path.join(PROJECT_DIR, 'newjobs.json');
const JOBS_APPLIED_FILE = path.join(PROJECT_DIR, 'jobs_applied.json');
const APPLIED_FILE = path.join(PROJECT_DIR, 'applied.json');
const DELETED_FILE = path.join(PROJECT_DIR, 'deleted_jobs.json');
const SKIPPED_FILE = path.join(PROJECT_DIR, 'skipped_jobs.json');
const NUM_WORKERS = 5;

const normalizeUrl = (u) => {
    if (!u) return '';
    u = u.trim();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
};

const isExcluded = (job) => {
    const u = (job.url || '').toLowerCase();
    const c = (job.company || '').toLowerCase();
    const t = (job.title || '').toLowerCase();
    if (u.includes('speechify')) return true;
    if (u.includes('paloaltonetworks') || u.includes('palo-alto') || u.includes('palo%20alto')) return true;
    if (c.includes('palo alto') || c.includes('paloalto')) return true;
    if (t.includes('palo alto')) return true;
    return false;
};

// 1. Load all applied/processed URLs
console.log('📦 Loading applied history...');
const appliedUrls = new Set();

function loadNDJSON(filepath) {
    if (!fs.existsSync(filepath)) return;
    const lines = fs.readFileSync(filepath, 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) {
        try {
            const obj = JSON.parse(line);
            if (obj.url) appliedUrls.add(normalizeUrl(obj.url));
        } catch (e) { }
    }
}

// jobs_applied.json (NDJSON)
loadNDJSON(JOBS_APPLIED_FILE);

// applied.json (JSON array)
if (fs.existsSync(APPLIED_FILE)) {
    try {
        const arr = JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf8'));
        arr.forEach(a => { if (a.url) appliedUrls.add(normalizeUrl(a.url)); });
    } catch (e) { }
}

// Per-worker append files
for (let i = 1; i <= 10; i++) {
    loadNDJSON(path.join(PROJECT_DIR, `applied_append_worker_${i}.jsonl`));
}

// deleted + skipped
loadNDJSON(DELETED_FILE);
loadNDJSON(SKIPPED_FILE);

// Per-worker failed files
for (let i = 1; i <= 10; i++) {
    loadNDJSON(path.join(PROJECT_DIR, `failed_worker_${i}.json`));
}

console.log(`   ✅ ${appliedUrls.size} already-processed URLs loaded.`);

// 2. Load newjobs.json
console.log('📦 Loading newjobs.json...');
let allJobs = [];
try {
    allJobs = JSON.parse(fs.readFileSync(NEWJOBS_FILE, 'utf8'));
} catch (e) {
    console.error(`❌ Failed to parse newjobs.json: ${e.message}`);
    process.exit(1);
}
console.log(`   ✅ ${allJobs.length} total jobs loaded.`);

// 3. Filter for Greenhouse + SmartRecruiters, exclude applied
const queue = allJobs.filter(j => {
    if (!j.url) return false;
    const isGh = j.url.includes('greenhouse.io') || j.url.includes('boards.greenhouse.io');
    const isSr = j.url.includes('smartrecruiters.com');
    if (!isGh && !isSr) return false;
    if (isExcluded(j)) return false;
    return !appliedUrls.has(normalizeUrl(j.url));
});

console.log(`   ✅ ${queue.length} compatible & unapplied jobs in queue.`);

if (queue.length === 0) {
    console.log('⚠️  No jobs to process. Exiting.');
    process.exit(0);
}

// 4. Split into chunks
const chunkSize = Math.ceil(queue.length / NUM_WORKERS);
for (let i = 0; i < NUM_WORKERS; i++) {
    const chunk = queue.slice(i * chunkSize, (i + 1) * chunkSize);
    const chunkPath = path.join(PROJECT_DIR, `jobs_chunk_${i + 1}.json`);
    fs.writeFileSync(chunkPath, JSON.stringify(chunk, null, 2));
    console.log(`   📄 Chunk ${i + 1}: ${chunk.length} jobs → ${chunkPath}`);
}

// 5. Launch workers
console.log(`\n🚀 Launching ${NUM_WORKERS} workers...`);
for (let i = 1; i <= NUM_WORKERS; i++) {
    const chunkPath = path.join(PROJECT_DIR, `jobs_chunk_${i}.json`);
    const logPath = path.join(PROJECT_DIR, `worker_${i}.log`);
    const logFd = fs.openSync(logPath, 'a');

    const child = spawn('node', [
        path.join(PROJECT_DIR, 'unified_worker.js'),
        `--worker=${i}`,
        `--chunk=${chunkPath}`
    ], {
        cwd: PROJECT_DIR,
        detached: true,
        stdio: ['ignore', logFd, logFd]
    });
    child.unref();
    console.log(`   ✅ Worker ${i} launched (PID: ${child.pid}) → ${logPath}`);
}

console.log(`\n🎯 All ${NUM_WORKERS} workers dispatched. Target: 500 jobs/hr.`);
console.log(`   Monitor: tail -f worker_*.log`);
console.log(`   Results: jobs_applied.json`);
