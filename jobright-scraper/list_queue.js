const fs = require('fs');
const path = require('path');

// Re-use logic from extract_priority_jobs / runner
const JOBS_FILE = path.resolve('./job_links.json');
const NEW_JOBS_FILE = path.resolve('./newjobs.json');
const OUTPUT_FILE = path.resolve('./current_queue.json');

const normalizeUrl = (url) => {
    if (!url) return '';
    try {
        let u = url.trim();
        if (u.includes('?')) u = u.split('?')[0];
        if (u.endsWith('/')) u = u.slice(0, -1);
        return u;
    } catch (e) { return url; }
};

const run = () => {
    let allJobs = [];

    // Load Jobs (Robust loading logic)
    if (fs.existsSync(NEW_JOBS_FILE)) {
        console.log("ℹ️  Loading jobs from newjobs.json...");
        const rawData = fs.readFileSync(NEW_JOBS_FILE, 'utf8');
        try {
            allJobs = JSON.parse(rawData);
        } catch (jsonError) {
            console.log("⚠️ Standard JSON parse failed, attempting Recovery Strategies...");
            // Strategy 1: Concatenated Arrays
            if (rawData.includes('][')) {
                try {
                    const fixedData = rawData.replace(/\]\s*\[/g, ',');
                    allJobs = JSON.parse(fixedData);
                } catch (e1) { }
            }
            // Strategy 2: Concatenated Objects
            if (allJobs.length === 0 && rawData.includes('}{')) {
                try {
                    const fixedData = rawData.replace(/}\s*{/g, '},{');
                    allJobs = JSON.parse(`[${fixedData}]`);
                } catch (e2) { }
            }
            // Strategy 3: NDJSON
            if (allJobs.length === 0) {
                allJobs = rawData.split('\n').map(l => l.trim()).filter(l => l.length > 0)
                    .map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(j => j);
            }
        }
    } else if (fs.existsSync(JOBS_FILE)) {
        allJobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    }

    // Filter Logic
    const sr = [];
    const wd = [];
    const seen = new Set();
    const activeJobs = [];

    allJobs.forEach(job => {
        if (!job.url) return;
        const u = normalizeUrl(job.url);
        if (seen.has(u)) return;
        seen.add(u);

        const uLower = u.toLowerCase();
        const c = (job.company || '').toLowerCase();
        const t = (job.title || '').toLowerCase();
        const l = (job.location || '').toLowerCase();

        // 1. Palo Alto Exclusion
        if (uLower.includes('palo-alto') || uLower.includes('palo%20alto') ||
            t.includes('palo alto') || l.includes('palo alto') || c.includes('palo alto')) {
            return;
        }

        // 2. Platform Check
        if (uLower.includes('smartrecruiters')) {
            sr.push(job);
            activeJobs.push(job);
        } else if (uLower.includes('myworkdayjobs')) {
            wd.push(job);
            activeJobs.push(job);
        }
    });

    console.log(`\n📊 Queue Snapshot:`);
    console.log(`   🟡 SmartRecruiters: ${sr.length}`);
    console.log(`   🔵 Workday:        ${wd.length}`);
    console.log(`   Σ  Total:          ${activeJobs.length}`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(activeJobs, null, 2));
    console.log(`✅ Saved queue list to ${OUTPUT_FILE}`);
};

run();
