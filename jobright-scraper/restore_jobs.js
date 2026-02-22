const fs = require('fs');

function norm(u) {
    if (!u) return '';
    u = u.trim().toLowerCase();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
}

// Load applied history
const ap = new Set();
['jobs_applied.json', 'deleted_jobs.json', 'skipped_jobs.json', 'failed_jobs.json'].forEach(f => {
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
        try { ap.add(norm(JSON.parse(l).url)); } catch (e) { }
    });
});
console.log('Applied history:', ap.size);

// Load newjobs.json
let nj = [];
try {
    let raw = fs.readFileSync('newjobs.json', 'utf8');
    try { nj = JSON.parse(raw); } catch (e) { nj = JSON.parse(raw.replace(/\]\s*\[/g, ',')); }
} catch (e) { console.log('newjobs parse error:', e.message); }
console.log('newjobs.json:', nj.length);

// Load backup
let bk = [];
try {
    let raw = fs.readFileSync('job_links.json.bak_pre_fix', 'utf8');
    try { bk = JSON.parse(raw); } catch (e) { bk = JSON.parse(raw.replace(/\]\s*\[/g, ',')); }
} catch (e) { console.log('backup parse error:', e.message); }
console.log('backup:', bk.length);

// Merge and dedup
const seen = new Set();
const merged = [];
[...nj, ...bk].forEach(j => {
    if (!j || !j.url) return;
    const u = norm(j.url);
    if (seen.has(u)) return;
    seen.add(u);
    merged.push(j);
});
console.log('Merged unique:', merged.length);

// Filter out already applied
const remaining = merged.filter(j => !ap.has(norm(j.url)));
console.log('After removing applied:', remaining.length);

// Count by platform
const gh = remaining.filter(x => x.url.toLowerCase().includes('greenhouse')).length;
const lv = remaining.filter(x => x.url.toLowerCase().includes('lever.co')).length;
const ab = remaining.filter(x => x.url.toLowerCase().includes('ashbyhq')).length;
const sr = remaining.filter(x => x.url.toLowerCase().includes('smartrecruiters')).length;
console.log('GH:', gh, 'Lever:', lv, 'Ashby:', ab, 'SR:', sr, 'Auto-total:', gh + lv + ab + sr);

// Write restored job_links.json
fs.writeFileSync('job_links.json', JSON.stringify(remaining, null, 2));
console.log('Wrote', remaining.length, 'jobs to job_links.json');
