const fs = require('fs');
const path = require('path');
const DIR = __dirname;

function norm(u) {
    if (!u) return '';
    u = u.trim();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
}

// Load all processed URLs
const processed = new Set();
function ndjsonLoad(file) {
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
        try { processed.add(norm(JSON.parse(l).url)); } catch (e) {}
    });
}
ndjsonLoad(path.join(DIR, 'jobs_applied.json'));
ndjsonLoad(path.join(DIR, 'skipped_jobs.json'));
ndjsonLoad(path.join(DIR, 'deleted_jobs.json'));
ndjsonLoad(path.join(DIR, 'failed_jobs.json'));
for (let i = 1; i <= 10; i++) {
    ndjsonLoad(path.join(DIR, `applied_append_worker_${i}.jsonl`));
    ndjsonLoad(path.join(DIR, `failed_worker_${i}.json`));
}
try { JSON.parse(fs.readFileSync(path.join(DIR, 'applied.json'), 'utf8')).forEach(a => processed.add(norm(a.url))); } catch (e) {}

console.log('Total processed URLs:', processed.size);

// Load newjobs.json
const nj = JSON.parse(fs.readFileSync(path.join(DIR, 'newjobs.json'), 'utf8'));

// Filter to automatable platforms (greenhouse, lever, ashby, smartrecruiters) + not processed
const automatable = nj.filter(j => {
    if (!j || !j.url) return false;
    const u = j.url.toLowerCase();
    const isGh = u.includes('greenhouse');
    const isSr = u.includes('smartrecruiters');
    const isLever = u.includes('lever.co');
    const isAshby = u.includes('ashbyhq');
    if (!isGh && !isSr && !isLever && !isAshby) return false;
    return !processed.has(norm(j.url));
});

console.log('Pending automatable jobs:', automatable.length);

// Write to job_links.json
fs.writeFileSync(path.join(DIR, 'job_links.json'), JSON.stringify(automatable, null, 2));
console.log('✅ Wrote', automatable.length, 'jobs to job_links.json');

// Show breakdown
const breakdown = {};
automatable.forEach(j => {
    const u = j.url.toLowerCase();
    let p = 'other';
    if (u.includes('greenhouse')) p = 'greenhouse';
    else if (u.includes('smartrecruiters')) p = 'smartrecruiters';
    else if (u.includes('lever.co')) p = 'lever';
    else if (u.includes('ashbyhq')) p = 'ashby';
    breakdown[p] = (breakdown[p] || 0) + 1;
});
console.log('Breakdown:', JSON.stringify(breakdown));
