const fs = require('fs');
const path = require('path');

const NEW_JOBS_FILE = path.resolve(__dirname, 'newjobs.json');
const JOB_LINKS_FILE = path.resolve(__dirname, 'job_links.json');

function normalizeUrl(u) {
    if (!u) return '';
    try {
        u = u.trim();
        if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
        return u.split('?')[0].replace(/\/$/, '');
    } catch (e) { return ''; }
}

function loadJobs(filePath) {
    if (!fs.existsSync(filePath)) return [];
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        try {
            return JSON.parse(raw);
        } catch (e) {
            // Try line-based
            return raw.split('\n').filter(l => l.trim()).map(l => {
                try { return JSON.parse(l); } catch (e) { return null; }
            }).filter(j => j);
        }
    } catch (e) {
        console.error(`Error reading ${filePath}: ${e.message}`);
        return [];
    }
}

console.log(`[Merge] Starting merge of ${JOB_LINKS_FILE} into ${NEW_JOBS_FILE}...`);

// 1. Load Existing Jobs
const existingJobs = loadJobs(NEW_JOBS_FILE);
const existingUrls = new Set(existingJobs.map(j => normalizeUrl(j.url)).filter(u => u));
console.log(`[Merge] Loaded ${existingJobs.length} existing jobs.`);

// 2. Load New Jobs
const newJobsBuffer = loadJobs(JOB_LINKS_FILE);
console.log(`[Merge] Loaded ${newJobsBuffer.length} fresh jobs from scraper buffer.`);

if (newJobsBuffer.length === 0) {
    console.log(`[Merge] No new jobs to merge. Exiting.`);
    process.exit(0);
}

// 3. Merge
let addedCount = 0;
newJobsBuffer.forEach(job => {
    const u = normalizeUrl(job.url);
    if (u && !existingUrls.has(u)) {
        existingJobs.push(job);
        existingUrls.add(u);
        addedCount++;
    }
});

// 4. Save
if (addedCount > 0) {
    console.log(`[Merge] Adding ${addedCount} unique new jobs...`);
    fs.writeFileSync(NEW_JOBS_FILE, JSON.stringify(existingJobs, null, 2));
    console.log(`[Merge] Saved ${NEW_JOBS_FILE} (Total: ${existingJobs.length})`);

    // 5. Clear Buffer
    fs.writeFileSync(JOB_LINKS_FILE, '[]');
    console.log(`[Merge] Cleared ${JOB_LINKS_FILE}`);
} else {
    console.log(`[Merge] All ${newJobsBuffer.length} incoming jobs were duplicates.`);
    // Optional: Clear buffer anyway if we want to avoid re-processing same dupes? 
    // Yes, better to clear so we don't keep checking them.
    fs.writeFileSync(JOB_LINKS_FILE, '[]');
    console.log(`[Merge] Cleared ${JOB_LINKS_FILE}`);
}
