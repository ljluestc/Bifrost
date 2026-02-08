const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const userDataDir = path.resolve('./user_data_learning_session');
    console.log(`Launching Setup Browser in: ${userDataDir}`);

    // Launch Persistent Context (Headed)
    // We do NOT load the extension by path because we want the USER to install it from the Store.
    // The profile will persist this installation.
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        channel: 'chrome', // Try to use genuine Chrome if available, else Chromium
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled'
        ],
        ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'], // ALLOW extensions
        viewport: null
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log('Navigating to Chrome Web Store...');
    // Direct link to JobRight AI search
    await page.goto('https://chromewebstore.google.com/search/jobright', { waitUntil: 'domcontentloaded' });

    console.log('>>> ACTION REQUIRED <<<');
    console.log('1. Sign into your Google Account (if needed).');
    console.log('2. Click "Add to Chrome" for the JobRight AI extension.');
    console.log('3. Pin the extension if you like.');
    console.log('4. CLOSE the browser window when finished to save the profile.');

    // Keep script alive until browser is closed
    context.on('close', () => {
        console.log('Browser closed. Profile setup complete.');
        process.exit(0);
    });
})();
