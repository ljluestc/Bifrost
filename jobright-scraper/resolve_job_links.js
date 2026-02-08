const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve('./job_links.json');

async function resolveLinks() {
    if (!fs.existsSync(FILE_PATH)) {
        console.log("No job_links.json found.");
        return;
    }

    let jobs = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));

    // Identify jobs to process: jobright links that haven't been "resolved" (or we just re-check all jobright links)
    // We will process ALL jobright.ai links.
    let pending = jobs.filter(j => j.url && j.url.includes('jobright.ai'));

    console.log(`Found ${pending.length} JobRight links to resolve/clean.`);

    if (pending.length === 0) {
        console.log("No internal links found. Exiting.");
        return;
    }

    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext();

    // We'll modify the 'jobs' array in place or filter it at the end?
    // Safer to filter out "bad" ones.

    let resolvedCount = 0;
    let removedCount = 0;

    // Process in batches or one by one? One by one is safer for now.
    for (let i = 0; i < pending.length; i++) {
        const job = pending[i];
        const originalUrl = job.url;

        console.log(`[${i + 1}/${pending.length}] Processing: ${originalUrl}`);

        let page;
        try {
            page = await context.newPage();
            // Block resources
            await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());

            await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

            // Check redirect
            try { await page.waitForURL(url => !url.includes('jobright.ai'), { timeout: 3000 }); } catch (e) { }

            let finalUrl = page.url();

            if (finalUrl.includes('jobright.ai')) {
                // Try Apply button
                const applyBtn = await page.$('a:has-text("Apply"), button:has-text("Apply")');
                if (applyBtn) {
                    const href = await applyBtn.getAttribute('href');
                    if (href && !href.includes('jobright.ai') && href.startsWith('http')) {
                        finalUrl = href;
                    } else {
                        // Click
                        try {
                            const [newPage] = await Promise.all([
                                context.waitForEvent('page', { timeout: 3000 }),
                                applyBtn.click()
                            ]);
                            await newPage.waitForLoadState();
                            finalUrl = newPage.url();
                            await newPage.close();
                        } catch (e) {
                            // maybe nav
                            await page.waitForTimeout(1000);
                            finalUrl = page.url();
                        }
                    }
                }
            }

            await page.close();

            if (!finalUrl.includes('jobright.ai')) {
                console.log(`   -> Resolved to: ${finalUrl}`);
                // Update job
                const index = jobs.findIndex(j => j.id === job.id);
                if (index !== -1) {
                    jobs[index].url = finalUrl;
                    jobs[index].resolved = true;
                }
                resolvedCount++;
            } else {
                console.log(`   -> Failed to resolve (still internal). Removing.`);
                // Remove job
                const index = jobs.findIndex(j => j.id === job.id);
                if (index !== -1) {
                    jobs.splice(index, 1);
                    // Adjust main loop index since we don't splice 'pending', but 'pending' references objects.
                    // Actually 'pending' is a separate array of references.
                    // 'jobs' is what we write back.
                }
                removedCount++;
            }

        } catch (e) {
            console.log(`   -> Error: ${e.message}. Removing.`);
            if (page) await page.close().catch(() => { });
            const index = jobs.findIndex(j => j.id === job.id);
            if (index !== -1) jobs.splice(index, 1);
            removedCount++;
        }

        // Periodic save
        if (i % 10 === 0) {
            fs.writeFileSync(FILE_PATH, JSON.stringify(jobs, null, 2));
        }
    }

    fs.writeFileSync(FILE_PATH, JSON.stringify(jobs, null, 2));
    console.log(`Done. Resolved: ${resolvedCount}, Removed: ${removedCount}`);
    await browser.close();
}

resolveLinks();
