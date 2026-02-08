const { chromium } = require('playwright');
const path = require('path');

(async () => {
    // 1. Cleanup Locks first
    try {
        const fs = require('fs');
        const lockFile = path.resolve('./user_data_nvidia_sequential/SingletonLock');
        if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    } catch (e) { }

    const userDataDir = path.resolve('./user_data_nvidia_sequential');
    console.log(`Launching Setup Browser in: ${userDataDir}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        channel: 'chrome',
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
        ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
        viewport: null
    });

    // 2. Open Extension Page
    const page1 = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    await page1.goto('https://chromewebstore.google.com/detail/jobright-autofill-%E2%80%93-insta/odcnpipkhjegpefkfplmedhmk', { waitUntil: 'domcontentloaded' });

    // 3. Open Ashby Job (User Verification)
    const page2 = await context.newPage();
    // Navigate main tab to the requested Ashby URL
    await page2.goto('https://jobs.ashbyhq.com/strider-technologies/c23d747e-f558-4cb3-9d2f-b77741a61fe0?LyJbpzwrRw=LinkedIn&jr_id=6960a2dca1bbea1d9a7b65b3', { waitUntil: 'domcontentloaded' });

    console.log('>>> SETUP WINDOW LAUNCHED <<<');
    console.log('Please install the extension in the first tab.');
    console.log('Then verify it works in the second tab (Ashby).');
    console.log('Close the browser when done.');

    // Keep alive
    context.on('close', () => process.exit(0));
    await new Promise(() => { });
})();
