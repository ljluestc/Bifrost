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

// Analyze newjobs.json
const nj = JSON.parse(fs.readFileSync(path.join(DIR, 'newjobs.json'), 'utf8'));
const platforms = {};
const pendingByPlatform = {};

nj.forEach(j => {
    if (!j || !j.url) return;
    const u = j.url.toLowerCase();
    let p = 'other';
    if (u.includes('greenhouse')) p = 'greenhouse';
    else if (u.includes('smartrecruiters')) p = 'smartrecruiters';
    else if (u.includes('lever.co')) p = 'lever';
    else if (u.includes('ashbyhq')) p = 'ashby';
    else if (u.includes('myworkdayjobs') || u.includes('workday')) p = 'workday';
    else if (u.includes('icims')) p = 'icims';

    platforms[p] = (platforms[p] || 0) + 1;

    if (!processed.has(norm(j.url))) {
        pendingByPlatform[p] = (pendingByPlatform[p] || 0) + 1;
    }
});

console.log('\nPlatform breakdown (total):');
Object.entries(platforms).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

console.log('\nPending by platform:');
Object.entries(pendingByPlatform).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

// Also check job_links.json
let jl = [];
try { jl = JSON.parse(fs.readFileSync(path.join(DIR, 'job_links.json'), 'utf8')); } catch (e) {}
const jlPending = {};
jl.forEach(j => {
    if (!j || !j.url) return;
    const u = j.url.toLowerCase();
    let p = 'other';
    if (u.includes('greenhouse')) p = 'greenhouse';
    else if (u.includes('smartrecruiters')) p = 'smartrecruiters';
    else if (u.includes('lever.co')) p = 'lever';
    else if (u.includes('ashbyhq')) p = 'ashby';
    else if (u.includes('myworkdayjobs') || u.includes('workday')) p = 'workday';

    if (!processed.has(norm(j.url))) {
        jlPending[p] = (jlPending[p] || 0) + 1;
    }
});

console.log('\njob_links.json pending by platform:');
Object.entries(jlPending).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
