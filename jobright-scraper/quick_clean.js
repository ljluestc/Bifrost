const fs = require('fs');
const path = require('path');
const FILE = path.resolve('./job_links.json');
const jobs = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const clean = jobs.filter(j => !j.url.includes('jobright.ai'));
console.log(`Original: ${jobs.length}, Clean: ${clean.length}, Removed: ${jobs.length - clean.length}`);
fs.writeFileSync(FILE, JSON.stringify(clean, null, 2));
