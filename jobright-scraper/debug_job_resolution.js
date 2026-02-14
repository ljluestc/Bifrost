const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // URL from logs
    const url = 'https://jobright.ai/jobs/info/697b15d71423772304eb29d9';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    console.log('--- Page Text ---');
    const text = await page.innerText('body');
    console.log(text.substring(0, 500));

    console.log('--- HTML Dump of potential buttons ---');
    // Dump anything that looks like a button or link with "Apply"
    const elements = await page.$$eval('a, button, div[role="button"]', els =>
        els.filter(el => el.innerText.includes('Apply') || el.innerText.includes('APPLY'))
            .map(el => ({
                tagName: el.tagName,
                text: el.innerText,
                class: el.className,
                href: el.href || null,
                outerHTML: el.outerHTML // careful, might be large
            }))
    );

    console.log(JSON.stringify(elements, null, 2));

    console.log('--- Clicking APPLY NOW ---');

    // Monitor all requests
    page.on('request', req => console.log(`>> Request: ${req.method()} ${req.url()}`));

    const applyBtn = await page.$('button#index_expired-job-apply-button__sJX_T, button:has-text("APPLY NOW")');
    if (applyBtn) {
        console.log('Found button. Clicking...');

        const popupPromise = page.context().waitForEvent('page', { timeout: 10000 }).catch(() => null);
        await applyBtn.click();

        const newPage = await popupPromise;
        if (newPage) {
            console.log(`Open new page: ${await newPage.url()}`);
        } else {
            console.log(`No new page. Current URL: ${page.url()}`);
        }
    } else {
        console.log('Button not found!');
    }

    await page.waitForTimeout(5000);
    await browser.close();
})();
