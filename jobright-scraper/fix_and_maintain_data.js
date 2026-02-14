const fs = require('fs');
const path = require('path');

const APPLIED_FILE = 'jobs_applied.json';
const LINKS_FILE = 'job_links.json';

// Helper to sanitize URL
const normalizeUrl = (u) => {
    if (!u) return '';
    try {
        const urlObj = new URL(u);
        return urlObj.origin + urlObj.pathname;
    } catch (e) {
        return u.split('?')[0];
    }
};

function backupFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const backupPath = `${filePath}.bak_${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    console.log(`📦 Backup created: ${backupPath}`);
}

function fixJobsApplied() {
    console.log(`\n🔧 Fixing ${APPLIED_FILE} (JSONL)...`);
    if (!fs.existsSync(APPLIED_FILE)) {
        console.log(`⚠️ ${APPLIED_FILE} not found. Skipping.`);
        return new Set();
    }

    backupFile(APPLIED_FILE);

    const content = fs.readFileSync(APPLIED_FILE, 'utf8');
    const lines = content.split('\n');
    const validJobs = [];
    const seenUrls = new Set();
    let corruptedCount = 0;
    let duplicateCount = 0;

    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
            const job = JSON.parse(trimmed);
            if (!job.url) {
                console.warn(`   ⚠️ Line ${i + 1}: Missing URL. Skipping.`);
                corruptedCount++;
                return;
            }

            const url = normalizeUrl(job.url);
            if (seenUrls.has(url)) {
                duplicateCount++;
            } else {
                seenUrls.add(url);
                validJobs.push(job);
            }
        } catch (e) {
            console.warn(`   ⚠️ Line ${i + 1}: Invalid JSON. Skipping.`);
            corruptedCount++;
        }
    });

    // Write back
    const output = validJobs.map(j => JSON.stringify(j)).join('\n') + '\n';
    fs.writeFileSync(APPLIED_FILE, output);

    console.log(`   ✅ Fixed ${APPLIED_FILE}:`);
    console.log(`      - Valid Unique Jobs: ${validJobs.length}`);
    console.log(`      - Corrupted Lines Removed: ${corruptedCount}`);
    console.log(`      - Duplicates Removed: ${duplicateCount}`);

    return seenUrls;
}

function fixJobLinks(appliedUrls) {
    console.log(`\n🔧 Fixing ${LINKS_FILE} (JSON Array)...`);
    if (!fs.existsSync(LINKS_FILE)) {
        console.log(`⚠️ ${LINKS_FILE} not found. Skipping.`);
        return;
    }

    backupFile(LINKS_FILE);

    let raw = fs.readFileSync(LINKS_FILE, 'utf8').trim();
    let jobs = [];

    // Robust Parsing
    try {
        jobs = JSON.parse(raw);
    } catch (e) {
        console.log(`   ⚠️ Robust parsing requirement detected...`);
        // Strategy 1: Concatenated Arrays
        if (raw.includes('][')) {
            try {
                jobs = JSON.parse(raw.replace(/\]\s*\[/g, ','));
            } catch (e2) { }
        }
        // Strategy 2: NDJSON masquerading as array
        if (jobs.length === 0) {
            const lines = raw.split('\n');
            lines.forEach(l => {
                try {
                    const j = JSON.parse(l);
                    if (j.url) jobs.push(j);
                } catch (e3) { }
            });
        }
    }

    if (!Array.isArray(jobs)) {
        console.error(`   ❌ Failed to parse ${LINKS_FILE} as array. Aborting fix for this file.`);
        return;
    }

    const validJobs = [];
    const seenUrls = new Set();
    let duplicateCount = 0;
    let alreadyAppliedCount = 0;

    jobs.forEach(job => {
        if (!job.url) return;
        const url = normalizeUrl(job.url);

        if (seenUrls.has(url)) {
            duplicateCount++;
        } else if (appliedUrls.has(url)) {
            alreadyAppliedCount++;
        } else {
            seenUrls.add(url);
            validJobs.push(job);
        }
    });

    fs.writeFileSync(LINKS_FILE, JSON.stringify(validJobs, null, 2));

    console.log(`   ✅ Fixed ${LINKS_FILE}:`);
    console.log(`      - Valid Unique Jobs (Ready to apply): ${validJobs.length}`);
    console.log(`      - Duplicates Removed: ${duplicateCount}`);
    console.log(`      - Already Applied Removed: ${alreadyAppliedCount}`);
}

const appliedUrls = fixJobsApplied();
fixJobLinks(appliedUrls);

console.log(`\n🎉 Data Maintenance Complete.`);
