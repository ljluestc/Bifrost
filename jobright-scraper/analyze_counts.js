const fs = require('fs');
const path = require('path');

const PRIORITY_FILE = './priority_jobs_extracted.json';
const NEW_JOBS_FILE = './newjobs.json';
const APPLIED_FILE = './jobs_applied.json';
const SKIPPED_FILE = './skipped_jobs.json';
const DELETED_FILE = './deleted_jobs.json';
const FAILED_FILE = './failed_jobs.json';
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

function analyzeFile(filePath, label) {
    let jobs = [];
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        // Try standard parse
        try {
            jobs = JSON.parse(raw);
        } catch (e) {
            // Try different strategies if needed, or just warn
            console.log(`Warning: Simple parse failed for ${label}, trying array fix...`);
            if (raw.includes('][')) {
                jobs = JSON.parse(raw.replace(/\]\s*\[/g, ','));
            }
        }
    } catch (e) {
        console.log(`Error loading ${label}:`, e.message);
        return;
    }

    console.log(`\n--- Analysis for ${label} ---`);
    console.log(`Total Jobs in file: ${jobs.length}`);

    let wdTotal = 0, srTotal = 0, ghTotal = 0, otherTotal = 0;
    let wdFiltered = 0, srFiltered = 0, ghFiltered = 0, otherFiltered = 0;

    jobs.forEach(j => {
        if (!j.url) return;
        const u = j.url.split('?')[0].toLowerCase().replace(/\/$/, '');
        const isApplied = allApplied.has(u);

        if (u.includes('myworkdayjobs')) {
            wdTotal++;
            if (isApplied) wdFiltered++;
        } else if (u.includes('smartrecruiters')) {
            srTotal++;
            if (isApplied) srFiltered++;
        } else if (u.includes('greenhouse')) {
            ghTotal++;
            if (isApplied) ghFiltered++;
        } else {
            otherTotal++;
            if (isApplied) otherFiltered++;
        }
    });

    console.log(`Workday: ${wdTotal} total, ${wdFiltered} filtered, ${wdTotal - wdFiltered} ready`);
    console.log(`SmartRecruiters: ${srTotal} total, ${srFiltered} filtered, ${srTotal - srFiltered} ready`);
    console.log(`Greenhouse: ${ghTotal} total, ${ghFiltered} filtered, ${ghTotal - ghFiltered} ready`);
    console.log(`Others: ${otherTotal} total, ${otherFiltered} filtered, ${otherTotal - otherFiltered} ready`);
}

if (fs.existsSync(PRIORITY_FILE)) analyzeFile(PRIORITY_FILE, 'PRIORITY_FILE (extracted)');
if (fs.existsSync(NEW_JOBS_FILE)) analyzeFile(NEW_JOBS_FILE, 'NEW_JOBS_FILE (source)');
