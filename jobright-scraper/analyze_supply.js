const fs = require('fs');
const DIR = __dirname;

// Load all history files
const applied = new Set();
['jobs_applied.json', 'skipped_jobs.json', 'deleted_jobs.json'].forEach(f => {
    try {
        fs.readFileSync(DIR + '/' + f, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
            try {
                const u = JSON.parse(l).url;
                if (u) applied.add(u.split('?')[0].replace(/\/$/, ''));
            } catch (e) { }
        });
    } catch (e) { }
});
console.log('History (unique URLs):', applied.size);

// Check job_links.json
function loadFile(name) {
    const raw = fs.readFileSync(DIR + '/' + name, 'utf8');
    try { return JSON.parse(raw); } catch (e) {
        try { return JSON.parse(raw.replace(/\]\s*\[/g, ',')); } catch (e2) { return []; }
    }
}

function countPending(jobs, label) {
    let pending = 0;
    const platforms = {};
    const seen = new Set();
    for (const j of jobs) {
        if (!j || !j.url) continue;
        const u = String(j.url).split('?')[0].replace(/\/$/, '');
        if (seen.has(u) || applied.has(u)) continue;
        seen.add(u);
        const s = String(j.url);
        let p = 'other';
        if (s.includes('greenhouse')) p = 'gh';
        else if (s.includes('smartrecruiters')) p = 'sr';
        else if (s.includes('lever.co')) p = 'lever';
        else if (s.includes('ashbyhq')) p = 'ashby';
        else if (s.includes('workday')) p = 'workday';
        platforms[p] = (platforms[p] || 0) + 1;
        if (p !== 'other') pending++;
    }
    console.log(label + ' pending (automatable):', pending, platforms);
}

countPending(loadFile('newjobs.json'), 'newjobs.json');
countPending(loadFile('job_links.json'), 'job_links.json');

// Top unsupported platforms
const jobs2 = loadFile('newjobs.json');
const otherPlatforms = {};
for (const j of jobs2) {
    if (!j || !j.url) continue;
    const s = String(j.url);
    if (!s.includes('greenhouse') && !s.includes('smartrecruiters') && !s.includes('lever.co') && !s.includes('ashbyhq')) {
        try {
            const host = new URL(s).hostname;
            otherPlatforms[host] = (otherPlatforms[host] || 0) + 1;
        } catch (e) { }
    }
}
const sorted = Object.entries(otherPlatforms).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('\nTop unsupported platforms:', JSON.stringify(sorted, null, 2));
