const fs = require('fs');

const APPLIED_FILE = 'jobs_applied.json';
const WORKER_FILES = Array.from({ length: 5 }, (_, i) => `applied_append_worker_${i + 1}.jsonl`);

console.log(`Merging worker files into ${APPLIED_FILE}...`);

let newCount = 0;
WORKER_FILES.forEach(f => {
    if (fs.existsSync(f)) {
        const content = fs.readFileSync(f, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
            console.log(`  ${f}: ${lines.length} entries`);
            fs.appendFileSync(APPLIED_FILE, '\n' + lines.join('\n'));
            // Optional: clear worker file after merge to avoid duplicates?
            // fs.writeFileSync(f, ''); 
            // Better to keep them for safety? But then we duplicate if we run merge again.
            // Let's rename them or delete them.
            // Safe approach: Rename to .processed
            fs.renameSync(f, f + '.processed.' + Date.now());
            newCount += lines.length;
        }
    }
});

console.log(`✅ Merged ${newCount} new applications to ${APPLIED_FILE}`);
