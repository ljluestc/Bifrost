const fs = require('fs');
const path = require('path');

const NEW_JOBS_FILE = path.join(__dirname, 'newjobs.json');
const OUTPUT_FILE = path.join(__dirname, 'priority_jobs_extracted.json');

// KEYWORD CONFIG
const KEYWORDS_INCLUDE = [
    'software', 'engineer', 'developer', 'backend', 'frontend', 'full stack', 'full-stack',
    'web', 'system', 'infrastructure', 'sre', 'devops', 'data', 'machine learning', 'ai',
    'cloud', 'distributed', 'reliability', 'tech', 'programmer', 'coding', 'computing'
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

    // NOTE: Excludes are handled in the main loop with stricter logic
    return KEYWORDS_INCLUDE.some(k => t.includes(k));
}

try {
    console.log("ℹ️  Loading jobs from newjobs.json...");
    let rawData = fs.readFileSync(NEW_JOBS_FILE, 'utf8');
    let allJobs = [];

    // ROBUST PARSING STRATEGIES
    try {
        allJobs = JSON.parse(rawData);
    } catch (e) {
        console.log("⚠️ Standard JSON parse failed, attempting repairs...");
        if (rawData.includes('][')) {
            rawData = rawData.replace(/\]\s*\[/g, ',');
        }
        if (rawData.includes('}{')) {
            rawData = `[${rawData.replace(/}\s*{/g, '},{')}]`;
        }
        try {
            allJobs = JSON.parse(rawData);
        } catch (e2) {
            console.log("⚠️ Parsing failed. Attempting regex extraction as fallback...");
            const objectRegex = /\{.*?\}/gs;
            const matches = rawData.match(objectRegex);
            if (matches) {
                matches.forEach(m => {
                    try { allJobs.push(JSON.parse(m)); } catch (e3) { }
                });
            }
        }
    }

    console.log(`ℹ️  Total Loaded Records: ${allJobs.length}`);

    // FILTERING
    const greenhouse = [];
    const smartrecruiters = [];
    const workday = [];
    const lever = [];

    const seenUrls = new Set();
    let qualifiedCount = 0;
    let matchedDebugCount = 0;

    allJobs.forEach(job => {
        if (!job.url || typeof job.url !== 'string') return;

        // 1. Normalize & Dedupe
        const u = normalizeUrl(job.url);
        if (seenUrls.has(u)) return;

        // 2. Platform Filter (Greenhouse + SmartRecruiters + Workday + Lever)
        const isGreenhouse = u.includes('greenhouse');
        const isSmart = u.includes('smartrecruiters');
        const isWorkday = u.includes('myworkdayjobs');
        const isLever = u.includes('lever.co');

        if (!isGreenhouse && !isSmart && !isWorkday && !isLever) return; // Drop others

        // 3. RELAXED Title Filter with SAFER EXCLUSIONS
        const titleCandidate = (job.title || '') + ' ' + (job.company || '') + ' ' + (job.signature || '');
        const t = titleCandidate.toLowerCase();

        // BETTER EXCLUSION LOGIC
        // Loose Match (Substring is fine for long unique words)
        const EXCLUDE_LOOSE = ['recruiter', 'marketing', 'product manager', 'account executive', 'social media', 'palo alto'];
        // Strict Match (Word Boundaries necessary for short words like "hr", "sales")
        const EXCLUDE_STRICT = ['hr', 'sales', 'legal', 'finance', 'design', 'support', 'writer', 'content', 'assistant'];

        let hitExclude = EXCLUDE_LOOSE.find(k => t.includes(k));

        if (!hitExclude) {
            // Strict check
            hitExclude = EXCLUDE_STRICT.find(k => {
                const regex = new RegExp(`\\b${k}\\b`, 'i');
                return regex.test(t);
            });
        }

        if (hitExclude) {
            if (matchedDebugCount < 10) {
                console.log(`❌ Excluded [${isGreenhouse ? 'GH' : (isSmart ? 'SR' : 'WD')}]: "${hitExclude}" in "${titleCandidate.substring(0, 50)}..."`);
                matchedDebugCount++;
            }
            return;
        }

        // INCLUDE EVERYTHING ELSE ON THESE PLATFORMS
        seenUrls.add(u);
        qualifiedCount++;

        if (isSmart) smartrecruiters.push(job);
        else if (isGreenhouse) greenhouse.push(job);
        else if (isWorkday) workday.push(job);
        else if (isLever) lever.push(job);
    });

    // PRIORITIZE: SmartRecruiters -> Greenhouse -> Lever -> Workday
    const finalList = [...smartrecruiters, ...greenhouse, ...lever, ...workday];

    console.log(`\n📊 Extraction Summary:`);
    console.log(`   - SmartRecruiters (All Accepted): ${smartrecruiters.length}`);
    console.log(`   - Greenhouse (All Accepted): ${greenhouse.length}`);
    console.log(`   - Lever (All Accepted): ${lever.length}`);
    console.log(`   - Workday (All Accepted): ${workday.length}`);
    console.log(`   - Total Qualified: ${finalList.length}`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalList, null, 2));
    console.log(`\n✅ Saved extracted list to: ${OUTPUT_FILE}`);

} catch (e) {
    console.error("❌ Fatal Error:", e);
}
