const fs = require('fs');

const file = 'newjobs.json';
console.log(`Reading ${file}...`);
const content = fs.readFileSync(file, 'utf8');
console.log(`Length: ${content.length}`);

try {
    const jobs = JSON.parse(content);
    console.log(`✅ JSON.parse success! Count: ${jobs.length}`);
} catch (e) {
    console.log(`❌ JSON.parse failed: ${e.message}`);
    const position = parseInt(e.message.match(/position (\d+)/)?.[1] || 0);
    if (position) {
        console.log(`Context at ${position}:`);
        console.log(content.substring(Math.max(0, position - 50), Math.min(content.length, position + 50)));
    }
}
