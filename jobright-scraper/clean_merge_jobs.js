const fs = require('fs');
const path = require('path');

const NEW_JOBS_FILE = 'newjobs.json';
const SCRAPER_FILE = 'job_links.json';
const OUTPUT_FILE = 'ready_to_apply.json';

// Helper to reliably parse potential NDJSON or concatenated JSON
function robustParse(content) {
    let jobs = [];
    content = content.trim();

    // Try standard JSON
    try {
        return JSON.parse(content);
    } catch (e) {
        // Continue to strategies
    }

    // Array repair: ][ -> ],[
    if (content.includes('][')) {
        try {
            return JSON.parse(content.replace(/\]\s*\[/g, ','));
        } catch (e) { }
    }

    // Object repair: }{ -> },{
    if (content.includes('}{')) {
        try {
            const fixed = content.replace(/}\s*{/g, '},{');
            return JSON.parse(`[${fixed}]`);
        } catch (e) { }
    }

    // NDJSON split
    const lines = content.split('\n');
    for (const line of lines) {
        try {
            const j = JSON.parse(line.trim());
            if (j) jobs.push(j);
        } catch (e) { }
    }

    return jobs;
}

function normalizeUrl(u) {
    if (!u) return '';
    u = u.trim();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
}

(async () => {
    console.log("🧹 Starting Job Cleanup & Merge...");

    let allJobs = [];

    // 1. Load newjobs.json
    if (fs.existsSync(NEW_JOBS_FILE)) {
        console.log(`Loading ${NEW_JOBS_FILE}...`);
        const raw = fs.readFileSync(NEW_JOBS_FILE, 'utf8');
        const parsed = robustParse(raw);
        console.log(`   Found ${parsed.length} entries.`);
        allJobs = allJobs.concat(parsed);
    }

    // 2. Load job_links.json
    if (fs.existsSync(SCRAPER_FILE)) {
        console.log(`Loading ${SCRAPER_FILE}...`);
        const raw = fs.readFileSync(SCRAPER_FILE, 'utf8');
        const parsed = robustParse(raw);
        console.log(`   Found ${parsed.length} entries.`);
        allJobs = allJobs.concat(parsed);
    }

    // 3. Deduplicate and Validation
    const unique = new Map();
    let validCount = 0;

    for (const job of allJobs) {
        if (!job || typeof job !== 'object') continue;

        // Must have URL
        if (!job.url || typeof job.url !== 'string') continue;

        // Must accept valid domains
        const u = job.url.toLowerCase();
        if (!u.startsWith('http')) continue;

        // Exclusion check (optional here, but good practice)
        if (u.includes('speechify')) continue;

        const norm = normalizeUrl(job.url);

        // Prioritize: if we have duplicate, maybe keep the one with more info?
        // for now just first one wins or overwrite?
        if (!unique.has(norm)) {
            unique.set(norm, job);
            validCount++;
        }
    }

    const finalJobs = Array.from(unique.values());
    console.log(`\n✅ Valid Unique Jobs: ${finalJobs.length}`);

    // 4. Save
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalJobs, null, 2));
    console.log(`💾 Saved to ${OUTPUT_FILE}`);

})();
