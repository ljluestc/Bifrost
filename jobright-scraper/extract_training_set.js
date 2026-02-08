const fs = require('fs');
const path = require('path');

const NEW_JOBS_FILE = path.join(__dirname, 'newjobs.json');
const OUTPUT_FILE = path.join(__dirname, 'training_jobs.json');

// KEYWORD CONFIG
const KEYWORDS_INCLUDE = [
    'software', 'engineer', 'developer', 'backend', 'frontend', 'full stack', 'full-stack',
    'web', 'system', 'infrastructure', 'sre', 'devops', 'data', 'machine learning', 'ai',
    'cloud', 'distributed', 'reliability', 'tech'
];

const KEYWORDS_EXCLUDE = [
    'sales', 'marketing', 'product manager', 'design', 'hr', 'recruiter',
    'support', 'legal', 'finance', 'account', 'executive', 'assistant',
    'coordinator', 'writer', 'content', 'social media', 'palo alto'
];

function normalizeUrl(url) {
    if (!url) return '';
    try {
        let u = url.trim();
        // Preserving Greenhouse Token for Embed URLs
        if (u.includes('boards.greenhouse.io') && u.includes('token=')) {
            return u.toLowerCase();
        }
        if (u.includes('?')) u = u.split('?')[0];
        return u.toLowerCase().replace(/\/$/, '');
    } catch (e) { return ''; }
}

function isSoftwareEngineering(title) {
    if (!title) return false;
    const t = title.toLowerCase();

    // EXCLUDES
    const hitExclude = KEYWORDS_EXCLUDE.find(k => t.includes(k));
    if (hitExclude) return false;

    // INCLUDES
    return KEYWORDS_INCLUDE.some(k => t.includes(k));
}

try {
    console.log("ℹ️  Loading jobs from newjobs.json for Training Set...");
    let rawData = fs.readFileSync(NEW_JOBS_FILE, 'utf8');
    let allJobs = [];

    // ROBUST PARSING
    try {
        allJobs = JSON.parse(rawData);
    } catch (e) {
        if (rawData.includes('][')) rawData = rawData.replace(/\]\s*\[/g, ',');
        if (rawData.includes('}{')) rawData = `[${rawData.replace(/}\s*{/g, '},{')}]`;
        try { allJobs = JSON.parse(rawData); } catch (e2) {
            const objectRegex = /\{.*?\}/gs;
            const matches = rawData.match(objectRegex);
            if (matches) matches.forEach(m => { try { allJobs.push(JSON.parse(m)); } catch (e3) { } });
        }
    }

    console.log(`ℹ️  Total Sources: ${allJobs.length}`);

    // BUCKETS
    const bucketWorkday = [];
    const bucketSmart = [];
    const bucketAshby = [];

    const seenUrls = new Set();

    // Shuffle array for randomness?
    allJobs.sort(() => Math.random() - 0.5);

    for (const job of allJobs) {
        if (!job.url || typeof job.url !== 'string') continue;
        const u = normalizeUrl(job.url);
        if (seenUrls.has(u)) continue;

        // TITLE CHECK (Permissive but exclude bad stuff/Palo Alto)
        const titleCandidate = (job.title || '') + ' ' + (job.company || '') + ' ' + (job.signature || '');
        if (!isSoftwareEngineering(titleCandidate)) continue;

        // BUCKETING - User Request: "10 SmartRecruiters jobs to learn pattern"
        if (u.includes('smartrecruiters') && bucketSmart.length < 10) {
            bucketSmart.push(job);
            seenUrls.add(u);
        }

        // Keep others at 0 since focus is SmartRecruiters pattern learning
        // else if (u.includes('myworkdayjobs') && bucketWorkday.length < 5) ...

        if (bucketSmart.length >= 10) break;
    }

    const finalList = [...bucketWorkday, ...bucketSmart, ...bucketAshby];

    console.log(`\n📊 Training Set Extraction:`);
    console.log(`   - Workday: ${bucketWorkday.length}/5`);
    console.log(`   - SmartRecruiters: ${bucketSmart.length}/5`);
    console.log(`   - Ashby: ${bucketAshby.length}/5`);
    console.log(`   - TOTAL: ${finalList.length}`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalList, null, 2));
    console.log(`\n✅ Saved Training Set to: ${OUTPUT_FILE}`);

} catch (e) {
    console.error("❌ Fatal Error:", e);
}
