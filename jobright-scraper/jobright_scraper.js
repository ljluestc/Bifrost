const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = path.resolve('./user_data_scraper_fresh_v4');
const OUTPUT_FILE = path.resolve('./job_links.json');
const LOG_FILE = path.resolve('./scraper.log');
const TARGET_JOBS_PER_HOUR = 500;
const STALL_TIMEOUT_MS = 45000; // 45 seconds

// Dynamic Search Strategy
const SEARCH_KEYWORDS = [
    "RECOMMENDED",
    "Software Engineer",
    "Backend Developer",
    "Frontend Developer",
    "Full Stack Engineer",
    "DevOps Engineer",
    "Data Scientist",
    "Product Manager",
    "Machine Learning Engineer",
    "Site Reliability Engineer",
    "QA Engineer",
    "Cloud Engineer",
    "Security Engineer",
    "Mobile Developer",
    "Engineering Manager"
];

let lastHourlyRefresh = Date.now();

function log(message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    console.log(logLine);
    try {
        fs.appendFileSync(LOG_FILE, logLine + '\n');
    } catch (e) { }
}

function getNextKeyword(current) {
    // Priority: If it's been an hour, go to RECOMMENDED
    if (Date.now() - lastHourlyRefresh > 3600000) {
        lastHourlyRefresh = Date.now();
        log("🕒 Hourly Refresh Triggered: Returning to RECOMMENDED page.");
        return "RECOMMENDED";
    }
    // Otherwise rotate
    const idx = SEARCH_KEYWORDS.indexOf(current);
    const nextIdx = (idx + 1) % SEARCH_KEYWORDS.length;
    return SEARCH_KEYWORDS[nextIdx];
}

async function run() {
    log(`🚀 Starting JobRight.ai Scraper v9 (PID: ${process.pid}) (Target: 500+ jobs/hr)`);
    log(`ℹ️  Stall Timeout set to ${STALL_TIMEOUT_MS / 1000}s.`);

    // Check locks
    const locks = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    locks.forEach(lock => {
        const lockFile = path.join(USER_DATA_DIR, lock);
        if (fs.existsSync(lockFile)) {
            try { fs.unlinkSync(lockFile); } catch (e) { }
        }
    });

    // Load existing
    let seenUrls = new Set();
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const current = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            current.forEach(j => seenUrls.add(j.url));
            log(`ℹ️  Loaded ${seenUrls.size} existing jobs.`);
        } catch (e) { }
    }

    const context = await chromium.launchPersistentContext(path.resolve('./user_data_scraper_fresh_v4'), {
        headless: true,
        channel: 'chrome',
        args: ['--no-sandbox'],
        ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
        viewport: null
    });

    const page = await context.newPage();
    // resolutionPage removed in favor of per-job pages

    let totalNew = 0;
    let lastActivityTime = Date.now();
    let currentKeyword = "RECOMMENDED"; // Start with Recommended

    // Parse args
    const args = process.argv.slice(2);
    let targetNew = Infinity;
    const targetArg = args.find(a => a.startsWith('--target-new='));
    if (targetArg) {
        targetNew = parseInt(targetArg.split('=')[1], 10);
        log(`🎯 Target set: Stop after finding ${targetNew} new jobs.`);
    }

    // ... (Network Listener logic remains same) ...
    page.on('response', async response => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';

        if (contentType.includes('application/json') && !url.includes('google') && !url.includes('segment')) {
            try {
                const json = await response.json();
                let jobs = [];
                // ... (Parsing logic same as before) ...
                const findJobs = (obj) => {
                    if (!obj) return;
                    if (Array.isArray(obj)) {
                        obj.forEach(item => {
                            if (item && item.id && item.title && (item.url || item.externalUrl || item.redirectUrl)) {
                                jobs.push(item);
                            } else {
                                findJobs(item);
                            }
                        });
                    } else if (typeof obj === 'object') {
                        Object.values(obj).forEach(val => findJobs(val));
                    }
                };

                // Specific handler for /swan/recommend/list/jobs
                if (json.result && json.result.jobList && Array.isArray(json.result.jobList)) {
                    json.result.jobList.forEach(item => {
                        if (item.jobResult) {
                            const jr = item.jobResult;
                            const jobUrl = jr.originalUrl || jr.url;
                            if (jobUrl) jobs.push({ id: jr.jobId, title: jr.jobTitle, url: jobUrl, company: jr.companyName || jr.company || "Unknown", raw: jr });
                        }
                    });
                }
                else if (json.result && json.result.data && json.result.data.json) {
                    findJobs(json.result.data.json);
                } else {
                    findJobs(json);
                }

                if (jobs.length > 0) {
                    let newCount = 0;

                    // Concurrency Control
                    const CONCURRENCY_LIMIT = 5;
                    const results = [];

                    // Helper to process a single job
                    const processJob = async (j) => {
                        let rawUrl = j.originalUrl || j.externalUrl || j.redirectUrl || j.url;

                        // RESOLVE INTERNAL LINKS
                        if (rawUrl && (rawUrl.includes('jobright.ai') || rawUrl.includes('jobright.com'))) {
                            let tempPage = null;
                            try {
                                tempPage = await context.newPage();
                                log(`   🔎 Resolving Internal Link: ${rawUrl}`);
                                await tempPage.goto(rawUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }); // Reduced timeout

                                // Strategy 1: Check if we got redirected
                                let currentUrl = tempPage.url();
                                if (!currentUrl.includes('jobright.ai') && !currentUrl.includes('jobright.com')) {
                                    rawUrl = currentUrl;
                                    log(`      ↳ Redirected to: ${rawUrl}`);
                                } else {
                                    // Strategy 2: Extract from "Apply" button or Metadata
                                    await tempPage.waitForTimeout(1000); // Reduced wait

                                    // Try to find the "Apply" button
                                    const applyBtn = await tempPage.$('a[href*="greenhouse"], a[href*="lever"], a[href*="workday"], a[href*="ashby"], a[href*="recruit"], a[class*="apply"]');
                                    if (applyBtn) {
                                        const href = await applyBtn.getAttribute('href');
                                        if (href && !href.includes('jobright.ai')) {
                                            rawUrl = href;
                                            log(`      ↳ Found Apply Link: ${rawUrl}`);
                                        }
                                    }

                                    // If still internal, click Apply
                                    if (rawUrl.includes('jobright.ai')) {
                                        const btn = await tempPage.$('button:has-text("Apply")');
                                        if (btn) {
                                            log("      ↳ Clicking Apply Button...");
                                            try {
                                                const [newPage] = await Promise.all([
                                                    context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
                                                    btn.click()
                                                ]);

                                                if (newPage) {
                                                    await newPage.waitForLoadState();
                                                    rawUrl = newPage.url();
                                                    log(`      ↳ Popup Redirected to: ${rawUrl}`);
                                                    await newPage.close();
                                                } else {
                                                    await tempPage.waitForTimeout(2000);
                                                    currentUrl = tempPage.url();
                                                    if (!currentUrl.includes('jobright.ai')) {
                                                        rawUrl = currentUrl;
                                                        log(`      ↳ Click Redirected to: ${rawUrl}`);
                                                    }
                                                }
                                            } catch (clickErr) {
                                                // Ignore click errors
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                log(`      ⚠️ Resolution failed: ${e.message}`);
                            } finally {
                                if (tempPage) await tempPage.close().catch(() => { });
                            }
                        }

                        if (rawUrl && !rawUrl.includes('jobright.ai')) {
                            const u = rawUrl.split('?')[0];
                            if (!seenUrls.has(u)) {
                                seenUrls.add(u);
                                const newJob = {
                                    id: j.id,
                                    url: rawUrl,
                                    title: j.title,
                                    company: j.company ? (j.company.name || j.company) : "Unknown",
                                    scraped_at: new Date().toISOString(),
                                };
                                return newJob;
                            }
                        }
                        return null;
                    };

                    // Execute in chunks
                    for (let i = 0; i < jobs.length; i += CONCURRENCY_LIMIT) {
                        const chunk = jobs.slice(i, i + CONCURRENCY_LIMIT);
                        const chunkResults = await Promise.all(chunk.map(job => processJob(job)));

                        // Save valid results immediately
                        const validJobs = chunkResults.filter(j => j !== null);
                        if (validJobs.length > 0) {
                            try {
                                const currentData = fs.existsSync(OUTPUT_FILE) ? JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')) : [];
                                currentData.push(...validJobs);
                                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
                                validJobs.forEach(j => log(`   💾 Saved: ${j.title} (${j.url})`));
                                newCount += validJobs.length;
                                totalNew += validJobs.length;
                            } catch (saveErr) {
                                log(`   ⚠️ Save failed: ${saveErr.message}`);
                            }
                        }
                    }

                    if (newCount > 0) {
                        log(`✅ API: +${newCount} jobs resolved and saved. Session: ${totalNew}`);
                        if (totalNew >= targetNew) {
                            log(`🏁 Target reached (${totalNew} >= ${targetNew}). Exiting...`);
                            process.exit(0);
                        }
                        lastActivityTime = Date.now();
                    }
                }
            } catch (e) { }
        }
    });

    try {
        log(`🔗 Navigating to JobRight.ai [${currentKeyword}]...`);
        let targetUrl = `https://jobright.ai/jobs?query=${encodeURIComponent(currentKeyword)}`;
        if (currentKeyword === "RECOMMENDED") targetUrl = "https://jobright.ai/jobs/recommend";

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);

        log("🔄 Starting Active Scrape Cycle (Click & Scroll)...");

        let processedButtons = new Set();

        while (true) {
            // STALL CHECK / KEYWORD ROTATION
            const timeSinceLastActivity = Date.now() - lastActivityTime;
            if (timeSinceLastActivity > STALL_TIMEOUT_MS) {
                currentKeyword = getNextKeyword(currentKeyword);
                log(`⚡ Stall. Switching to: "${currentKeyword}"...`);
                try {
                    let switchUrl = `https://jobright.ai/jobs?query=${encodeURIComponent(currentKeyword)}`;
                    if (currentKeyword === "RECOMMENDED") switchUrl = "https://jobright.ai/jobs/recommend";

                    await page.goto(switchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    processedButtons.clear();
                    await page.waitForTimeout(4000);
                    lastActivityTime = Date.now();
                } catch (e) {
                    log(`   ⚠️ Refresh failed: ${e.message}`);
                    if (e.message.includes('closed')) throw e;
                }
                continue;
            }

            // 1. CLICK APPLY BUTTONS (Autonomous Mode)
            try {
                // Find all "Apply with Autofill" buttons
                const applyBtns = await page.$$('button.index_apply-button__kp79C:has-text("Apply with Autofill")');
                for (const btn of applyBtns) {
                    if (await btn.isVisible()) {
                        log("   🖱️ Clicking 'Apply with Autofill'...");
                        await btn.click();
                        await page.waitForTimeout(1000); // Wait for modal

                        // Check for confirmation modal "Yes, I applied!"
                        const confirmBtn = await page.$('button.index_job-apply-confirm-popup-yes-button__9Wy4I');
                        if (confirmBtn && await confirmBtn.isVisible()) {
                            log("   ✅ Confirming: 'Yes, I applied!'");
                            await confirmBtn.click();
                            await page.waitForTimeout(500);
                            lastActivityTime = Date.now();
                        }
                    }
                }
            } catch (e) {
                log(`   ⚠️ Clicker Error: ${e.message}`);
                if (e.message.includes('closed') || e.message.includes('Target page')) throw e;
            }

            // 2. SCROLL (Targeting the specific scrollable container found in observation)
            try {
                await page.evaluate(() => {
                    const scrollable = document.querySelector('div.index_jobs-list-scrollable__hBvJS') || window;
                    scrollable.scrollBy(0, 1000);
                });
                await page.waitForTimeout(500);
            } catch (e) {
                if (e.message.includes('closed') || e.message.includes('Target page')) throw e;
            }

            // 3. LOAD MORE (Fallback)
            try {
                const btn = await page.$('button:has-text("Load more"), button:has-text("Show more")');
                if (btn && await btn.isVisible()) {
                    await btn.click();
                    await page.waitForTimeout(1000);
                    lastActivityTime = Date.now();
                }
            } catch (e) {
                if (e.message.includes('closed') || e.message.includes('Target page')) throw e;
            }
        }

    } catch (err) {
        log(`❌ Crash: ${err.message}`);
    }
}

run().catch(e => log(`FATAL: ${e.message}`));
