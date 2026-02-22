const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('/home/calelin/dev/jobright-scraper/config.js');

const args = process.argv.slice(2);
const jobUrl = args[0];

if (!jobUrl) {
    console.error("❌ No URL provided! Usage: node debug_single_job.js <URL>");
    process.exit(1);
}

(async () => {
    console.log(`🔍 Debugging URL: ${jobUrl}`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userManager: true,
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    try {
        await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log("✅ Page loaded.");
        await page.screenshot({ path: 'debug_initial.png' });

        // Auto-fill test
        console.log("📝 Attempting to fill form...");
        // (Copying simplified logic from unified_worker.js for Greenhouse)
        if (jobUrl.includes('greenhouse')) {
            if (config.FULL_NAME) {
                await page.locator('#first_name').fill(config.FULL_NAME.split(' ')[0]).catch(() => console.log("Failed to fill first_name"));
                await page.locator('#last_name').fill(config.FULL_NAME.split(' ').slice(1).join(' ')).catch(() => console.log("Failed to fill last_name"));
            }
            if (config.EMAIL) await page.locator('#email').fill(config.EMAIL).catch(() => console.log("Failed to fill email"));
            if (config.PHONE) await page.locator('#phone').fill(config.PHONE).catch(() => console.log("Failed to fill phone"));

            // Check for submit button
            const selectors = [
                '#submit_app',
                'button:has-text("Submit Application")',
                'button:has-text("Apply")',
                'button:has-text("Submit")'
            ];

            let found = false;
            for (const sel of selectors) {
                if (await page.locator(sel).first().isVisible()) {
                    console.log(`✅ Found submit button: ${sel}`);
                    found = true;
                    // Highlight it
                    await page.locator(sel).first().evaluate(el => el.style.border = '5px solid red');
                    await page.screenshot({ path: 'debug_found_button.png' });
                    break;
                }
            }

            if (!found) {
                console.error("❌ Submit button NOT found!");
                await page.screenshot({ path: 'debug_failed_button.png', fullPage: true });
                const body = await page.content();
                fs.writeFileSync('debug_failed_dom.html', body);
            }
        } else {
            console.log("⚠️ Not a Greenhouse URL, skipping specific checks.");
        }

    } catch (e) {
        console.error(`❌ Error: ${e.message}`);
        await page.screenshot({ path: 'debug_error.png' });
    } finally {
        await browser.close();
    }
})();
