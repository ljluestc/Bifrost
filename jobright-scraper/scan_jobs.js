const fs = require('fs');

const NEW_JOBS_FILE = './newjobs.json';
const PRIORITY_FILE = './priority_jobs_extracted.json';
const APPLIED_FILE = './jobs_applied.json';
const SKIPPED_FILE = './skipped_jobs.json';
const DELETED_FILE = './deleted_jobs.json';
const APPLIED_OLD = './applied.json';

function loadSet(file) {
    const s = new Set();
    if (!fs.existsSync(file)) return s;
    try {
        const content = fs.readFileSync(file, 'utf8');
        content.split('\n').filter(l => l.trim()).forEach(l => {
            try {
                const j = JSON.parse(l);
                if (j.url) s.add(j.url.split('?')[0].toLowerCase().replace(/\/$/, ''));
            } catch (e) { }
        });
        try {
            JSON.parse(content).forEach(j => {
                if (j.url) s.add(j.url.split('?')[0].toLowerCase().replace(/\/$/, ''));
            });
        } catch (e) { }
    } catch (e) { }
    return s;
}

const applied = loadSet(APPLIED_FILE);
const skipped = loadSet(SKIPPED_FILE);
const deleted = loadSet(DELETED_FILE);
const appliedOld = loadSet(APPLIED_OLD);
const allApplied = new Set([...applied, ...skipped, ...deleted, ...appliedOld]);

function scanFile(filePath) {
    console.log(`\nScanning ${filePath} using Regex...`);
    if (!fs.existsSync(filePath)) {
        console.log("File not found.");
        return;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Regex to find "url": "..."
    const urlRegex = /"url"\s*:\s*"([^"]+)"/g;
    let match;

    let wdCount = 0;
    let srCount = 0;
    let totalUrls = 0;

    let wdFiltered = 0;
    let srFiltered = 0;
    let ghCount = 0;
    let ghFiltered = 0;

    while ((match = urlRegex.exec(content)) !== null) {
        const url = match[1];
        if (!url || url === 'null') continue;

        totalUrls++;
        const u = url.split('?')[0].toLowerCase().replace(/\/$/, '');

        if (u.includes('myworkdayjobs')) {
            wdCount++;
            if (allApplied.has(u)) wdFiltered++;
        } else if (u.includes('smartrecruiters')) {
            srCount++;
            if (allApplied.has(u)) srFiltered++;
        } else if (u.includes('greenhouse')) {
            ghCount++;
            if (allApplied.has(u)) ghFiltered++;
        }
    }

    console.log(`Total URLs found: ${totalUrls}`);
    console.log(`Workday: ${wdCount} (Filtered: ${wdFiltered}, Net: ${wdCount - wdFiltered})`);
    console.log(`SmartRecruiters: ${srCount} (Filtered: ${srFiltered}, Net: ${srCount - srFiltered})`);
    console.log(`Greenhouse: ${ghCount} (Filtered: ${ghFiltered}, Net: ${ghCount - ghFiltered})`);
}

scanFile(NEW_JOBS_FILE);
scanFile(PRIORITY_FILE);
