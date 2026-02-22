const fs = require('fs');
const path = require('path');
const DIR = __dirname;

function norm(u) {
    if (!u) return '';
    u = u.trim();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
}

const urls = new Set();

function ndjsonLoad(file) {
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
        try { urls.add(norm(JSON.parse(l).url)); } catch (e) {}
    });
}

function jsonArrayLoad(file) {
    if (!fs.existsSync(file)) return;
    try { JSON.parse(fs.readFileSync(file, 'utf8')).forEach(a => urls.add(norm(a.url))); } catch (e) {}
}

// Load all processed
ndjsonLoad(path.join(DIR, 'jobs_applied.json'));
ndjsonLoad(path.join(DIR, 'skipped_jobs.json'));
ndjsonLoad(path.join(DIR, 'deleted_jobs.json'));
for (let i = 1; i <= 10; i++) {
    ndjsonLoad(path.join(DIR, `applied_append_worker_${i}.jsonl`));
    ndjsonLoad(path.join(DIR, `failed_worker_${i}.json`));
}
jsonArrayLoad(path.join(DIR, 'applied.json'));

console.log('Total processed URLs:', urls.size);

// Check newjobs.json
const nj = JSON.parse(fs.readFileSync(path.join(DIR, 'newjobs.json'), 'utf8'));
console.log('newjobs.json total:', nj.length);

const compat = nj.filter(j => j.url && (j.url.includes('greenhouse.io') || j.url.includes('smartrecruiters.com')));
console.log('Compatible (GH+SR):', compat.length);

const pending = compat.filter(j => !urls.has(norm(j.url)));
console.log('Pending:', pending.length);

// Check job_links.json
let jl = [];
try { jl = JSON.parse(fs.readFileSync(path.join(DIR, 'job_links.json'), 'utf8')); } catch (e) {}
console.log('job_links.json total:', jl.length);

const jlPending = jl.filter(j => j.url && (j.url.includes('greenhouse.io') || j.url.includes('smartrecruiters.com')) && !urls.has(norm(j.url)));
console.log('job_links.json pending compatible:', jlPending.length);
