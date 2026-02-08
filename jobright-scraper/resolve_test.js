const { chromium } = require('playwright');

async function resolve() {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' }); // match scraper
    const context = await browser.newContext();
    const page = await context.newPage();
    const target = "https://jobright.ai/jobs/info/68cccd86fa466330fef9162d?utm_source=1014"; // From logs

    console.log(`Navigating to ${target}...`);

    // We want to see if it redirects or if we need to click something.
    try {
        const response = await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
        console.log(`Initial Final URL: ${page.url()}`);

        // Check if we are still on jobright
        if (page.url().includes('jobright.ai')) {
            console.log("Still on JobRight. Looking for 'Apply' button or meta refresh...");

            // Look for an apply button
            try {
                const applyBtn = await page.$('a[href^="http"]:not([href*="jobright.ai"]), button:has-text("Apply")');
                if (applyBtn) {
                    const href = await applyBtn.getAttribute('href');
                    if (href) {
                        console.log(`Found Apply Link/Button href: ${href}`);
                    } else {
                        console.log("Found Apply button but no direct href. Clicking...");
                        // If it's a button that triggers a window.open
                        const [newPage] = await Promise.all([
                            context.waitForEvent('page'),
                            applyBtn.click()
                        ]);
                        await newPage.waitForLoadState();
                        console.log(`New Page URL: ${newPage.url()}`);
                    }
                } else {
                    console.log("No obvious Apply button found.");
                }
            } catch (e) {
                console.log("Error searching for apply button:", e.message);
            }
        }
    } catch (e) {
        console.error("Error:", e.message);
    }

    await browser.close();
}

resolve();
