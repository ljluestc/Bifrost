const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.resolve('./job_links.json');
const BACKUP_FILE = path.resolve('./job_links.backup.json');

function cleanJobs() {
    if (!fs.existsSync(OUTPUT_FILE)) {
        console.log("❌ No job_links.json found.");
        return;
    }

    console.log("📦 Reading job_links.json...");
    let jobs = [];
    try {
        jobs = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    } catch (e) {
        console.log(`❌ Error parsing JSON: ${e.message}`);
        return;
    }

    console.log(`📊 Total entries before cleanup: ${jobs.length}`);

    // Create backup
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(jobs, null, 2));
    console.log(`💾 Backup saved to ${BACKUP_FILE}`);

    const seenUrls = new Set();
    const uniqueJobs = [];
    let invalidCount = 0;
    let duplicateCount = 0;

    jobs.forEach(job => {
        let url = job.url;

        // 1. Filter out invalid links (JobRight tracking links that aren't useful)
        if (!url || url.includes('jobright.ai')) {
            // Check if there's an external link buried in 'raw' or other fields if we had them, 
            // but for now, we just drop pure jobright links if that's the user's wish.
            // checking if the user said "invlaid links like jobright.ai"
            invalidCount++;
            return;
        }

        // 2. Normalize URL for deduplication
        // Remove utm_ parameters and other tracking junk usually found after '?'
        // But some sites need query params (like greenhouse boards sometimes).
        // Safest is to strip commonly known tracking params or just strip everything after ? if we rely on canonical paths.
        // User example: https://jobs.ashbyhq.com/.../application?utm_source=...
        // We probably want to keep the base URL.

        let normalizedUrl = url;
        try {
            const u = new URL(url);
            // Remove common tracking params
            ['utm_source', 'utm_medium', 'utm_campaign', 'gh_src', 'lever-source', 'ref'].forEach(p => u.searchParams.delete(p));
            normalizedUrl = u.toString();
        } catch (e) {
            // If invalid URL, strict cleanup? or keep?
            // Let's rely on basic string split for robustness if URL construction fails
            normalizedUrl = url.split('?')[0];
        }

        if (seenUrls.has(normalizedUrl)) {
            duplicateCount++;
        } else {
            seenUrls.add(normalizedUrl);
            // Save the cleaned URL or the original? 
            // User wants "valid links", stripping tracking is usually good.
            // Let's update the job url to the cleaner one.
            job.url = normalizedUrl;
            uniqueJobs.push(job);
        }
    });

    console.log(`🗑️ Removed ${invalidCount} invalid (jobright.ai) links.`);
    console.log(`tas🗑️ Removed ${duplicateCount} duplicate links.`);
    console.log(`✅ Unique valid jobs reamining: ${uniqueJobs.length}`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueJobs, null, 2));
    console.log(`💾 Cleaned data saved to ${OUTPUT_FILE}`);
}

cleanJobs();
