const fs = require('fs');

const JOBS_FILE = 'job_links.json';
const APPLIED_FILE = 'applied.json';
const APPLIED_APPEND_FILE = 'applied_append.jsonl';
const FAILED_FILE = 'failed-application.json';
const DELETED_JOBS_FILE = 'deleted_jobs.json';
const SKIPPED_JOBS_FILE = 'skipped_jobs.json';

const normalizeUrl = (u) => (u || '').split('?')[0].replace(/\/$/, '');

function loadSet(file, isJsonL = false) {
    const s = new Set();
    if (!fs.existsSync(file)) return s;
    const content = fs.readFileSync(file, 'utf8');
    if (isJsonL) {
        content.split('\n').filter(l => l.trim()).forEach(l => {
            try { s.add(normalizeUrl(JSON.parse(l).url)); } catch (e) { }
        });
    } else {
        try {
            const data = JSON.parse(content);
            if (Array.isArray(data)) data.forEach(d => s.add(normalizeUrl(d.url)));
        } catch (e) {
            // Try as JSONL if JSON parse fails (fallback)
            content.split('\n').filter(l => l.trim()).forEach(l => {
                try { s.add(normalizeUrl(JSON.parse(l).url)); } catch (e) { }
            });
        }
    }
    return s;
}

const applied = loadSet(APPLIED_FILE);
const appliedAppend = loadSet(APPLIED_APPEND_FILE, true); // JSONL
const failed = loadSet(FAILED_FILE);
const deleted = loadSet(DELETED_JOBS_FILE); // Hybrid check done in loadSet
const skipped = loadSet(SKIPPED_JOBS_FILE); // Hybrid check

const allExclusions = new Set([...applied, ...appliedAppend, ...failed, ...deleted, ...skipped]);

const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
const greenhouseJobs = jobs.filter(j => (j.url || '').toLowerCase().includes('greenhouse'));

console.log(`Total Jobs in File: ${jobs.length}`);
console.log(`Total Greenhouse Jobs: ${greenhouseJobs.length}`);
console.log(`\n--- Exclusion Breakdown (Greenhouse Only) ---`);

let excludedCount = 0;
let reasons = { applied: 0, appliedAppend: 0, failed: 0, deleted: 0, skipped: 0 };

greenhouseJobs.forEach(j => {
    const url = normalizeUrl(j.url);
    if (allExclusions.has(url)) {
        excludedCount++;
        if (applied.has(url)) reasons.applied++;
        else if (appliedAppend.has(url)) reasons.appliedAppend++;
        else if (failed.has(url)) reasons.failed++;
        else if (deleted.has(url)) reasons.deleted++;
        else if (skipped.has(url)) reasons.skipped++;
    }
});

console.log(`Excluded Greenhouse Jobs: ${excludedCount}`);
console.log(`Remaining Greenhouse Jobs: ${greenhouseJobs.length - excludedCount}`);
console.log(`\nReasons for Exclusion:`);
console.log(`- Applied (Old File):     ${reasons.applied}`);
console.log(`- Applied (New Log):      ${reasons.appliedAppend}`);
console.log(`- Failed:                 ${reasons.failed}`);
console.log(`- Deleted:                ${reasons.deleted}`);
console.log(`- Skipped:                ${reasons.skipped}`);
