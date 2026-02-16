const fs = require('fs');

const JOBS_SOURCE = 'newjobs.json';
const HISTORY_FILES = ['jobs_applied.json', 'applied.json'];

console.log('--- Debugging Filters ---');

// 1. Load Jobs
console.log(`Reading ${JOBS_SOURCE}...`);
const allJobs = JSON.parse(fs.readFileSync(JOBS_SOURCE, 'utf8'));
console.log(`Total jobs loaded: ${allJobs.length}`);

// 2. Mock History (or load real)
function normalizeUrl(u) {
    if (!u) return '';
    u = u.trim();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
}

const history = new Set();
// Load basic history if available
if (fs.existsSync('jobs_applied.json')) {
    const lines = fs.readFileSync('jobs_applied.json', 'utf8').split('\n');
    lines.forEach(l => {
        try {
            if (l.trim()) {
                const j = JSON.parse(l);
                if (j.url) history.add(normalizeUrl(j.url));
            }
        } catch (e) { }
    });
}
console.log(`History size: ${history.size}`);

// 3. Filter Analysis
let hasUrl = 0;
let isPlatform = 0;
let notInHistory = 0;

allJobs.forEach(job => {
    if (job.url) {
        hasUrl++;
        if (job.url.includes('greenhouse.io') || job.url.includes('smartrecruiters.com')) {
            isPlatform++;
            if (!history.has(normalizeUrl(job.url))) {
                notInHistory++;
            }
        }
    }
});

console.log(`Jobs with URL: ${hasUrl}`);
console.log(`Jobs on GH/SR: ${isPlatform}`);
console.log(`Jobs NOT in History (Pending): ${notInHistory}`);

if (notInHistory < 100) {
    console.log("Dumping sample pending jobs:");
    allJobs.filter(j => j.url && (j.url.includes('greenhouse.io') || j.url.includes('smartrecruiters.com')) && !history.has(j.url))
        .slice(0, 5).forEach(j => console.log(j.url));
}
