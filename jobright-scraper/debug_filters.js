const fs = require('fs');

const JOBS_FILE = 'job_links.json';
const APPLIED_FILE = 'applied.json';
const APPLIED_APPEND_FILE = 'applied_append.jsonl';
const FAILED_FILE = 'failed-application.json';
const DELETED_JOBS_FILE = 'deleted_jobs.json';
const SKIPPED_JOBS_FILE = 'skipped_jobs.json';

const normalizeUrl = (u) => (u || '').split('?')[0].replace(/\/$/, '');

let appliedUrls = new Set();
let debugStats = { jobs: 0, applied: 0, skipped: 0, deleted: 0, failed: 0 };

try {
    const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    debugStats.jobs = jobs.length;
    console.log(`Total Jobs: ${jobs.length}`);

    // Applied Append
    if (fs.existsSync(APPLIED_APPEND_FILE)) {
        fs.readFileSync(APPLIED_APPEND_FILE, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
            try {
                const u = JSON.parse(l).url;
                appliedUrls.add(normalizeUrl(u));
                debugStats.applied++;
            } catch (e) { }
        });
    }

    // Skipped
    if (fs.existsSync(SKIPPED_JOBS_FILE)) {
        const content = fs.readFileSync(SKIPPED_JOBS_FILE, 'utf8');
        content.split('\n').filter(l => l.trim()).forEach(l => {
            try {
                const u = JSON.parse(l).url;
                appliedUrls.add(normalizeUrl(u));
                debugStats.skipped++;
            } catch (e) { }
        });
    }

    // Deleted
    if (fs.existsSync(DELETED_JOBS_FILE)) {
        const content = fs.readFileSync(DELETED_JOBS_FILE, 'utf8');
        content.split('\n').filter(l => l.trim()).forEach(l => {
            try {
                const u = JSON.parse(l).url;
                appliedUrls.add(normalizeUrl(u));
                debugStats.deleted++;
            } catch (e) { }
        });
    }

    console.log(`Unique Filter URLs: ${appliedUrls.size}`);
    console.log("Stats:", debugStats);

    // Check first 5 matches
    console.log("\nSample Filtered Jobs:");
    let sampleCount = 0;
    jobs.forEach(j => {
        if (appliedUrls.has(normalizeUrl(j.url)) && sampleCount < 5) {
            console.log(`FILTERED: ${j.url} -> ${normalizeUrl(j.url)}`);
            sampleCount++;
        }
    });

} catch (e) { console.error(e); }
