const fs = require('fs');

const html = fs.readFileSync('job_page.html', 'utf8');
const searchString = "Apply on Employer Site";
const index = html.indexOf(searchString);

if (index !== -1) {
    const start = Math.max(0, index - 500);
    const end = Math.min(html.length, index + 500);
    console.log("Context around 'Apply on Employer Site':");
    console.log(html.substring(start, end));
} else {
    console.log("String not found!");
    // Try "APPLY NOW"
    const index2 = html.indexOf("APPLY NOW");
    if (index2 !== -1) {
        const start = Math.max(0, index2 - 500);
        const end = Math.min(html.length, index2 + 500);
        console.log("Context around 'APPLY NOW':");
        console.log(html.substring(start, end));
    } else {
        console.log("'APPLY NOW' not found either.");
    }
}
