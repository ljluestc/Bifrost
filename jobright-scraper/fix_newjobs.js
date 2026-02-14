const fs = require('fs');

const file = 'newjobs.json';
console.log(`Reading ${file}...`);
let content = fs.readFileSync(file, 'utf8');

// Fix: [...] { ... } -> [ ... , { ... } ... ]
// 1. Replace ] { with , {
if (content.match(/\]\s*\{/)) {
    console.log("Found '] {' pattern (Array followed by unexpected Object). Fixing...");
    content = content.replace(/\]\s*\{/g, ', {');
} else if (content.includes('][')) {
    console.log("Found '][' pattern.");
    content = content.replace(/\]\[/g, ',');
}

// 1.5 Replace missing commas between objects: } { -> }, {
if (content.match(/\}\s*\{/)) {
    console.log("Found '} {' pattern (Missing comma between objects). Fixing...");
    content = content.replace(/\}\s*\{/g, '}, {');
}

// 2. Ensure it ends with ]
content = content.trim();
if (!content.endsWith(']')) {
    console.log("File does not end with ]. Appending ].");
    content += ']';
}

try {
    const jobs = JSON.parse(content);
    console.log(`✅ Fixed! Count: ${jobs.length}`);
    fs.writeFileSync(file, JSON.stringify(jobs, null, 2));
    console.log(`Saved fixed file to ${file}`);
} catch (e) {
    console.log(`❌ Fix failed: ${e.message}`);
    const position = parseInt(e.message.match(/position (\d+)/)?.[1] || 0);
    if (position) {
        console.log(`Context at ${position}:`);
        console.log(content.substring(Math.max(0, position - 50), Math.min(content.length, position + 50)));
    }
}
