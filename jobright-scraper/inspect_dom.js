const { chromium } = require('playwright');

async function inspect() {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    const url = "https://jobright.ai/jobs/info/698815fa8ca8121a3a6a96be?utm_source=1014"; // One of the failed ones

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Dump apply button html
    const btn = await page.$('a:has-text("Apply"), button:has-text("Apply")');
    if (btn) {
        console.log("Button HTML:", await btn.evaluate(el => el.outerHTML));
        // Check event listeners? hard in playwright/puppeteer without checks
    } else {
        console.log("No apply button found");
        // Dump body
        // console.log(await page.content());
    }

    await browser.close();
}
inspect();
