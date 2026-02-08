const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve('./job_links.json');
const BACKUP_PATH = path.resolve('./job_links.json.bak');

function fixJson() {
    console.log(`Reading ${FILE_PATH}...`);
    let content = fs.readFileSync(FILE_PATH, 'utf8');

    // Create backup
    fs.writeFileSync(BACKUP_PATH, content);
    console.log(`Backup created at ${BACKUP_PATH}`);

    try {
        JSON.parse(content);
        console.log("JSON is already valid.");
        return;
    } catch (e) {
        console.log("JSON is invalid. Attempting repair...");
    }

    // Attempt 1: Find the last closing bracket of the main array
    const lastBracketIndex = content.lastIndexOf(']');
    if (lastBracketIndex !== -1) {
        const truncated = content.substring(0, lastBracketIndex + 1);
        try {
            const json = JSON.parse(truncated);
            console.log(`Repair successful! Found ${json.length} items.`);
            fs.writeFileSync(FILE_PATH, JSON.stringify(json, null, 2));
            console.log("File saved.");
            return;
        } catch (e) {
            console.log("Truncation failed to produce valid JSON.");
        }
    }

    // Attempt 2: If the end is messed up, maybe it missed the closing bracket entirely
    // Try adding a closing bracket if it looks like an array
    if (content.trim().startsWith('[')) {
        console.log("Attempting to close array...");
        // Remove trailing commas or whitespace from the end of valid data
        // This is a bit risky/complex without a stream parser, but let's try a simple approach
        // Find the last "}" which should be the end of the last object
        const lastBraceIndex = content.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
            const truncated = content.substring(0, lastBraceIndex + 1) + "\n]";
            try {
                const json = JSON.parse(truncated);
                console.log(`Repair successful (Appended ']')! Found ${json.length} items.`);
                fs.writeFileSync(FILE_PATH, JSON.stringify(json, null, 2));
                console.log("File saved.");
                return;
            } catch (e) {
                console.log("Appending ']' failed.");
            }
        }
    }

    console.error("Could not auto-repair the file. Please inspect manually.");
}

fixJson();
