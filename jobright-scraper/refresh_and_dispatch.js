const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIR = __dirname;
const WORKER_SCRIPT = path.join(DIR, 'unified_worker.js');
const TOTAL_WORKERS = 5;

function normalizeUrl(u) {
    if (!u) return '';
    u = u.trim();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
}

function loadAppliedUrls() {
    const applied = new Set();
    // Load jobs_applied.json (NDJSON)
    const mainFile = path.join(DIR, 'jobs_applied.json');
    if (fs.existsSync(mainFile)) {
        fs.readFileSync(mainFile, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
            try { applied.add(normalizeUrl(JSON.parse(l).url)); } catch (e) {}
        });
    }
    // Load applied.json (JSON array)
    const appliedFile = path.join(DIR, 'applied.json');
    if (fs.existsSync(appliedFile)) {
        try {
            JSON.parse(fs.readFileSync(appliedFile, 'utf8')).forEach(a => applied.add(normalizeUrl(a.url)));
        } catch (e) {}
    }
    // Load worker append files
    for (let i = 1; i <= TOTAL_WORKERS; i++) {
        const f = path.join(DIR, `applied_append_worker_${i}.jsonl`);
        if (fs.existsSync(f)) {
            fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                try { applied.add(normalizeUrl(JSON.parse(l).url)); } catch (e) {}
            });
        }
    }
    // Load failed files to skip those too (NDJSON format)
    for (let i = 1; i <= TOTAL_WORKERS; i++) {
        const f = path.join(DIR, `failed_worker_${i}.json`);
        if (fs.existsSync(f)) {
            fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                try { applied.add(normalizeUrl(JSON.parse(l).url)); } catch (e) {}
            });
        }
    }
    // Load skipped_jobs.json (NDJSON)
    const skippedFile = path.join(DIR, 'skipped_jobs.json');
    if (fs.existsSync(skippedFile)) {
        fs.readFileSync(skippedFile, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
            try { applied.add(normalizeUrl(JSON.parse(l).url)); } catch (e) {}
        });
    }
    // Load deleted_jobs.json (NDJSON)
    const deletedFile = path.join(DIR, 'deleted_jobs.json');
    if (fs.existsSync(deletedFile)) {
        fs.readFileSync(deletedFile, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
            try { applied.add(normalizeUrl(JSON.parse(l).url)); } catch (e) {}
        });
    }
    return applied;
}

(async () => {
    console.log('🔄 REFRESH & DISPATCH - Loading all jobs...');

    // Load newjobs.json
    const newjobs = JSON.parse(fs.readFileSync(path.join(DIR, 'newjobs.json'), 'utf8'));
    console.log(`   Total in newjobs.json: ${newjobs.length}`);

    // Load already applied
    const applied = loadAppliedUrls();
    console.log(`   Already applied/failed: ${applied.size}`);

    // Filter to compatible + unapplied
    const pending = newjobs.filter(j => {
        if (!j.url) return false;
        const isGh = j.url.includes('greenhouse.io') || j.url.includes('boards.greenhouse.io');
        const isSr = j.url.includes('smartrecruiters.com');
        if (!isGh && !isSr) return false;
        return !applied.has(normalizeUrl(j.url));
    });

    console.log(`   Compatible & pending: ${pending.length}`);

    if (pending.length === 0) {
        console.log('✅ No pending jobs to process!');
        process.exit(0);
    }

    // Write to job_links.json for the dispatcher
    fs.writeFileSync(path.join(DIR, 'job_links.json'), JSON.stringify(pending, null, 2));
    console.log(`   ✅ Wrote ${pending.length} jobs to job_links.json`);

    // Now chunk and dispatch
    const BATCH_SIZE = Math.min(pending.length, 2500);
    const jobsToProcess = pending.slice(0, BATCH_SIZE);
    const chunkSize = Math.ceil(jobsToProcess.length / TOTAL_WORKERS);

    console.log(`\n🚀 DISPATCHING ${jobsToProcess.length} jobs across ${TOTAL_WORKERS} workers (~${chunkSize} each)`);

    const workers = [];
    for (let i = 0; i < TOTAL_WORKERS; i++) {
        const start = i * chunkSize;
        const chunk = jobsToProcess.slice(start, start + chunkSize);
        if (chunk.length === 0) continue;

        const chunkFile = path.join(DIR, `jobs_chunk_${i + 1}.json`);
        fs.writeFileSync(chunkFile, JSON.stringify(chunk, null, 2));

        const workerId = i + 1;
        const logFile = fs.openSync(path.join(DIR, `worker_${workerId}.log`), 'a');

        console.log(`   🚀 Worker ${workerId}: ${chunk.length} jobs`);

        const child = spawn('node', [WORKER_SCRIPT, `--worker=${workerId}`, `--chunk=${chunkFile}`], {
            detached: true,
            stdio: ['ignore', logFile, logFile],
            cwd: DIR
        });

        workers.push({ id: workerId, pid: child.pid });
        child.unref();
    }

    console.log(`\n✅ Dispatched ${workers.length} workers.`);
    workers.forEach(w => console.log(`   Worker ${w.id}: PID ${w.pid}`));
    console.log(`\n📊 Target: 500 jobs/hr (5 workers × ~100/hr each)`);
    console.log(`📝 Monitor: tail -f worker_*.log`);
    console.log(`🛑 Stop: pkill -f "unified_worker.js"`);
})();
