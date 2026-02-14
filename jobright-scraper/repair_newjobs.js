const fs = require('fs');

const inFile = 'newjobs.json';
const outFile = 'clean_jobs.json';

try {
    console.log("Reading " + inFile);
    let raw = fs.readFileSync(inFile, 'utf8').trim();

    // Strategy 1: Direct Parse
    try {
        const data = JSON.parse(raw);
        console.log("✅ Strategy 1 (Direct) Worked! " + data.length + " items.");
        fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
        process.exit(0);
    } catch (e) { console.log("Strategy 1 Failed: " + e.message); }

    // Strategy 2: Append ']'
    try {
        const data = JSON.parse(raw + ']');
        console.log("✅ Strategy 2 (Append ']') Worked! " + data.length + " items.");
        fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
        process.exit(0);
    } catch (e) {
        console.log("Strategy 2 Failed: " + e.message);
        // Identify error position?
    }

    // Strategy 3: Remove trailing comma and Append ']'
    // Only if it ends with ','
    if (raw.endsWith(',')) {
        try {
            const data = JSON.parse(raw.slice(0, -1) + ']');
            console.log("✅ Strategy 3 (Pop Comma + ']') Worked! " + data.length + " items.");
            fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
            process.exit(0);
        } catch (e) { console.log("Strategy 3 Failed."); }
    }

    // Strategy 4: Aggressive Regex Extraction
    console.log("👉 Attempting Strategy 4: Regex Extraction...");
    // Look for objects starting with { "title": and ending with "timestamp": ... }
    // This is hard to get right with regex.
    // Better: Split by `},`
    // If the file looks like `[ { ... }, { ... }` or `[ { ... } { ... }`

    // Let's just try to parse linearly.
    // Remove leading '['
    if (raw.startsWith('[')) raw = raw.substring(1);

    // Split by `}\n` or `},\n` or just `}`
    // But `}` can be inside strings? "company": "Foo } Bar"
    // Heuristic: Split by `\n    },\n` (indentation!)
    // Looking at the file content, it seems pretty pretty-printed.

    const objects = [];
    const buffer = [];
    let openBraces = 0;

    // Simple char-by-char state machine to extract objects
    let currentObj = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < raw.length; i++) {
        const char = raw[i];
        currentObj += char;

        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (char === '"') { inString = !inString; continue; }

        if (!inString) {
            if (char === '{') openBraces++;
            if (char === '}') {
                openBraces--;
                if (openBraces === 0 && currentObj.trim().length > 2) {
                    // Potential Object found
                    // Try to parse it
                    try {
                        // Remove trailing comma if captured
                        let clean = currentObj.trim();
                        if (clean.endsWith(',')) clean = clean.slice(0, -1);
                        if (clean.startsWith(',')) clean = clean.substring(1); // Rare case

                        const obj = JSON.parse(clean);
                        objects.push(obj);
                        currentObj = ''; // Reset
                    } catch (e) {
                        // Not a valid object yet, or garbage between objects?
                        // If openBraces is 0, we should be done with an object.
                        // If parse fails, maybe we captured extra chars?
                    }
                }
            }
        }
    }

    console.log(`✅ Strategy 4 Extracted ${objects.length} valid objects.`);
    if (objects.length > 0) {
        fs.writeFileSync(outFile, JSON.stringify(objects, null, 2));
        process.exit(0);
    }

} catch (e) {
    console.error("Critical Error", e);
}
