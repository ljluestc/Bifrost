const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    const USER_DATA_DIR = path.resolve('./user_data_scraper_fresh_v4');
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, { headless: true, args: ['--no-sandbox'] });
    const page = await context.newPage();
    const url = 'https://jobright.ai/jobs/info/698d2e0ff64d441a164f2599?utm_source=1014';

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const content = await page.content();
    fs.writeFileSync('job_page.html', content);
    console.log('Saved job_page.html');

    await context.close();
})();
