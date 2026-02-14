const fs = require('fs');
const path = require('path');

const TARGET_FILE = 'jobs_applied.json';
const BACKUP_FILE = 'jobs_applied.backup.json';

function fixJobsApplied() {
    if (!fs.existsSync(TARGET_FILE)) {
        console.error(`File ${TARGET_FILE} not found!`);
        return;
    }

    console.log(`Reading ${TARGET_FILE}...`);
    const content = fs.readFileSync(TARGET_FILE, 'utf8');

    // Backup first
    fs.writeFileSync(BACKUP_FILE, content);
    console.log(`Backup created at ${BACKUP_FILE}`);

    const lines = content.split('\n');
    const validJobs = [];
    const seenUrls = new Set();
    let corruptedCount = 0;
    let duplicateCount = 0;

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
            const job = JSON.parse(trimmed);
            if (!job.url) {
                console.warn(`Line ${index + 1}: Missing URL, skipping.`);
                return;
            }

            // Normalize URL for deduplication
            const normalizedUrl = job.url.split('?')[0].toLowerCase().replace(/\/$/, '');

            if (seenUrls.has(normalizedUrl)) {
                duplicateCount++;
            } else {
                seenUrls.add(normalizedUrl);
                validJobs.push(trimmed); // Keep original formatting if possible, or we can standardise
            }
        } catch (e) {
            console.warn(`Line ${index + 1}: Invalid JSON, skipping. Content: "${trimmed.substring(0, 50)}..."`);
            corruptedCount++;
        }
    });

    console.log(`\nAnalysis complete:`);
    console.log(`- Total valid unique jobs: ${validJobs.length}`);
    console.log(`- Corrupted/Invalid lines: ${corruptedCount}`);
    console.log(`- Duplicates removed: ${duplicateCount}`);

    console.log(`Writing filtered content to ${TARGET_FILE}...`);
    fs.writeFileSync(TARGET_FILE, validJobs.join('\n') + '\n');
    console.log(`Done.`);
}

fixJobsApplied();
