const fs = require('fs');

const FAILED_FILE = './failed_jobs.json';
const FAILED_APP_FILE = './failed-application.json';

function scanFailures(file) {
    if (!fs.existsSync(file)) return 0;
    const content = fs.readFileSync(file, 'utf8');
    let count = 0;
    // Simple regex for SR urls
    const regex = /"url"\s*:\s*"[^"]*smartrecruiters[^"]*"/gi;
    const matches = content.match(regex);
    if (matches) count = matches.length;
    return count;
}

const f1 = scanFailures(FAILED_FILE);
const f2 = scanFailures(FAILED_APP_FILE);

console.log(`SmartRecruiters jobs in failed_jobs.json: ${f1}`);
console.log(`SmartRecruiters jobs in failed-application.json: ${f2}`);
