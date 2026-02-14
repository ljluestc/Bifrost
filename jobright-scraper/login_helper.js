const { chromium } = require('playwright');
const path = require('path');

const USER_DATA_DIR = path.resolve('./user_data_scraper_fresh_v4');

(async () => {
    console.log("🚀 Launching Browser for Manual Login...");
    console.log(`📂 Profile: ${USER_DATA_DIR}`);
    console.log("👉 Please log in to JobRight.ai in the opened window.");
    console.log("❌ Close the browser window when you are done to exit this script.");

    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        channel: 'chrome',
        viewport: null,
        args: ['--start-maximized']
    });

    const page = await context.newPage();
    await page.goto('https://jobright.ai/login', { waitUntil: 'domcontentloaded' });

    // Keep open until closed
    context.on('close', () => {
        console.log("✅ Browser closed. Exiting...");
        process.exit(0);
    });
})();
