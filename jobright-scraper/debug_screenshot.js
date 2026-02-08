const { chromium } = require('playwright');

async function debug() {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    const url = "https://jobright.ai/jobs/info/6988cb1f8da7a6120463d4e8?utm_source=1014"; // From latest json

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'debug_job_page.png', fullPage: true });
    console.log("Screenshot saved to debug_job_page.png");

    const content = await page.content();
    if (content.includes("This job has expired")) {
        console.log("DETECTED: Job is expired.");
    }

    // Check for apply button
    const btn = await page.$('a:has-text("Apply"), button:has-text("Apply")');
    if (btn) {
        console.log("Apply button found.");
        console.log("Button text:", await btn.innerText());
        const href = await btn.getAttribute('href');
        console.log("Button href:", href);
    } else {
        console.log("No apply button found.");
    }

    await browser.close();
}

debug();
