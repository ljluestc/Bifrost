const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = path.resolve('./user_data_scraper_fresh_v4');
const OUTPUT_FILE = path.resolve('./job_links.json');
const DELETED_JOBS_FILE = path.resolve('./deleted_jobs.json');
const LOG_FILE = path.resolve('./scraper.log');
const TARGET_JOBS_PER_HOUR = 500;
const STALL_TIMEOUT_MS = 45000; // 45 seconds

// Dynamic Search Strategy
const SEARCH_KEYWORDS = [
    "RECOMMENDED",
    "Google Software Engineer",
    "Meta Software Engineer",
    "Apple Engineer",
    "Amazon Software Engineer",
    "Microsoft Engineer",
    "Netflix Engineer",
    "NVIDIA Engineer",
    "Salesforce Engineer",
    "Adobe Engineer",
    "Oracle Engineer",
    "Uber Engineer",
    "Lyft Engineer",
    "Airbnb Engineer",
    "Stripe Engineer",
    "Snowflake Engineer",
    "Databricks Engineer",
    "Palantir Engineer",
    "Coinbase Engineer",
    "Shopify Engineer",
    "Block Engineer",
    "Twilio Engineer",
    "Atlassian Engineer",
    "ServiceNow Engineer",
    "Workday Engineer",
    "Intuit Engineer",
    "Zoom Engineer",
    "Cloudflare Engineer",
    "Datadog Engineer",
    "CrowdStrike Engineer",
    "Palo Alto Networks Engineer",
    "MongoDB Engineer",
    "Elastic Engineer",
    "HashiCorp Engineer",
    "Confluent Engineer",
    "Roblox Engineer",
    "Pinterest Engineer",
    "Snap Engineer",
    "Reddit Engineer",
    "Discord Engineer",
    "Figma Engineer",
    "Notion Engineer",
    "Vercel Engineer",
    "Rippling Engineer",
    "Scale AI Engineer",
    "Anthropic Engineer",
    "OpenAI Engineer",
    "Tesla Engineer",
    "SpaceX Engineer",
    "Intel Engineer",
    "AMD Engineer",
    "Qualcomm Engineer",
    "IBM Engineer",
    "Cisco Engineer",
    "VMware Engineer",
    "Dell Engineer",
    "LinkedIn Engineer",
    "Twitter Engineer",
    "Robinhood Engineer",
    "DoorDash Engineer",
    "Instacart Engineer"
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

// Helper to sanitize URL
function sanitizeUrl(url) {
    try {
        if (!url) return null;
        if (url.includes('jobright.ai')) return null;
        if (url.startsWith('about:')) return null;

        const u = new URL(url);
        // Remove common tracking params
        ['utm_source', 'utm_medium', 'utm_campaign', 'gh_src', 'lever-source', 'ref'].forEach(p => u.searchParams.delete(p));
        return u.toString();
    } catch (e) {
        return url.split('?')[0];
    }
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
    const existingFiles = [OUTPUT_FILE, 'newjobs.json']; // Check both buffer and main backlog
    existingFiles.forEach(file => {
        if (fs.existsSync(file)) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                let loaded = [];
                try {
                    loaded = JSON.parse(content);
                } catch (e) {
                    // Try line-based
                    loaded = content.split('\n').filter(l => l.trim()).map(l => {
                        try { return JSON.parse(l); } catch (e) { return null; }
                    }).filter(j => j);
                }
                loaded.forEach(j => {
                    if (j && j.url) seenUrls.add(j.url);
                });
                log(`ℹ️  Loaded ${loaded.length} existing jobs from ${path.basename(file)}.`);
            } catch (e) { log(`⚠️ Error loading ${path.basename(file)}: ${e.message}`); }
        }
    });

    // Load deleted jobs to avoid re-scraping
    if (fs.existsSync(DELETED_JOBS_FILE)) {
        try {
            const deleted = fs.readFileSync(DELETED_JOBS_FILE, 'utf8')
                .trim()
                .split('\n')
                .map(line => {
                    try { return JSON.parse(line); } catch (e) { return null; }
                })
                .filter(x => x && x.url);

            let deletedCount = 0;
            deleted.forEach(d => {
                if (d.url && !seenUrls.has(d.url)) {
                    seenUrls.add(d.url);
                    deletedCount++;
                }
            });
            log(`ℹ️  Loaded ${deletedCount} deleted jobs (skipping). Total seen: ${seenUrls.size}`);
        } catch (e) {
            log(`⚠️ Error loading deleted jobs: ${e.message}`);
        }
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
    let startTime = Date.now();
    let lastActivityTime = Date.now();
    let currentKeyword = "RECOMMENDED"; // Start with Recommended
    let consecutiveFailures = 0;
    const WIN_THRESHOLD = 500; // Force keyword switch after 500 successes too? No, keep going if winning.
    const FAIL_THRESHOLD = 10; // Force switch after 10 consecutive resolution failures

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
                    const CONCURRENCY_LIMIT = 1; // Debug Mode: Single Thread
                    const results = [];

                    // Helper to process a single job
                    const processJob = async (j) => {
                        let rawUrl = j.originalUrl || j.externalUrl || j.redirectUrl || j.url;

                        // RESOLVE INTERNAL LINKS
                        if (rawUrl && (rawUrl.includes('jobright.ai') || rawUrl.includes('jobright.com'))) {
                            let tempPage = null;
                            try {
                                tempPage = await context.newPage();
                                // Block resources for speed
                                await tempPage.route('**/*.{png,jpg,jpeg,gif,svg,css,font,woff,woff2}', route => route.abort());

                                // Capture navigation requests
                                let potentialRedirects = [];
                                tempPage.on('request', req => {
                                    if (req.isNavigationRequest() && !req.url().includes('jobright.ai')) {
                                        potentialRedirects.push(req.url());
                                    }
                                });

                                log(`   🔎 Resolving Internal Link: ${rawUrl}`);
                                await tempPage.goto(rawUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }); // Increased timeout to 15s

                                // Strategy 1: Check if we got redirected
                                let currentUrl = tempPage.url();
                                if (!currentUrl.includes('jobright.ai') && !currentUrl.includes('jobright.com')) {
                                    rawUrl = currentUrl;
                                    log(`      ↳ Redirected to: ${rawUrl}`);
                                } else {
                                    // Strategy 2: Extract from "Apply" button or Metadata
                                    await tempPage.waitForTimeout(1000); // Reduced wait

                                    // Try to find the "Apply" button
                                    // Enhanced selectors based on logs
                                    let applyBtn = await tempPage.$('a[href*="greenhouse"], a[href*="lever"], a[href*="workday"], a[href*="ashby"], a[href*="recruit"], a[class*="apply"], a:has-text("Apply on Employer Site"), button:has-text("Apply on Employer Site"), a:has-text("APPLY NOW"), button:has-text("APPLY NOW")');

                                    if (!applyBtn) {
                                        // Fallback: Try to find *any* link with "Apply" text if the specific ones failed
                                        applyBtn = await tempPage.$('a:has-text("Apply")');
                                    }

                                    if (applyBtn) {
                                        const href = await applyBtn.getAttribute('href');
                                        log(`      👀 Debug: Found Apply Button with href: ${href}`);
                                        if (href) {
                                            // Fix: Resolve relative URLs
                                            try {
                                                const absoluteUrl = new URL(href, tempPage.url()).href;
                                                log(`      👀 Debug: Resolved Absolute URL: ${absoluteUrl}`);

                                                if (!absoluteUrl.includes('jobright.ai') && !absoluteUrl.includes('job-list/')) {
                                                    rawUrl = absoluteUrl;
                                                    log(`      ↳ Found Apply Link: ${rawUrl}`);
                                                } else {
                                                    log(`      ⚠️ Ignored Internal Apply Link: ${absoluteUrl}`);
                                                    // If it's internal, maybe we need to click it?
                                                    // Re-enabling click logic below might be needed if this happens often.
                                                }
                                            } catch (e) { log(`      ⚠️ URL Resolution Error: ${e.message}`); }
                                        } else {
                                            log("      ⚠️ Found button but no href attribute.");
                                            // If it's a button without href, we might need to click it.
                                            // We will let the disabled click logic below handle it if I re-enable it, 
                                            // or just accept we can't get it without interaction.
                                        }
                                    } else {
                                        log("      👀 Debug: No Apply Button found matching selector.");
                                        try {
                                            const bodyText = await tempPage.innerText('body');
                                            log(`      👀 Debug: Page Text Sample: ${bodyText.substring(0, 200).replace(/\n/g, ' ')}...`);
                                        } catch (e) { log(`      ⚠️ Debug: Failed to get page text: ${e.message}`); }
                                    }

                                    // If we found a button but no href (or if we didn't find a link at all), we must click.
                                    // The debug output showed <button>APPLY NOW</button> with no href.

                                    if (!rawUrl || rawUrl.includes('jobright.ai')) {
                                        // Check for expired button explicitly
                                        const expiredBtn = await tempPage.$('button[id*="expired-job"]');
                                        if (expiredBtn) {
                                            log(`      ⚠️ Job appears to be expired (Found expired button ID). Skipping.`);
                                            return null;
                                        }

                                        // Prioritize the "APPLY NOW" button we found, or find it again if we didn't assign it to applyBtn correctly
                                        const clickTarget = applyBtn || await tempPage.$('button:has-text("APPLY NOW"), button[class*="applyButton"]');

                                        if (clickTarget) {
                                            log("      ↳ Clicking Apply Button to resolve URL...");
                                            try {
                                                // Setup popup listener BEFORE clicking
                                                const popupPromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);

                                                // Click handling - sometimes opens new tab, sometimes redirects current
                                                await clickTarget.click({ timeout: 5000 });

                                                const newPage = await popupPromise;

                                                if (newPage) {
                                                    await newPage.waitForLoadState();
                                                    log(`      ↳ Popup Redirected to: ${newPage.url()}`);
                                                    rawUrl = newPage.url();
                                                    await newPage.close();
                                                } else {
                                                    // No popup, maybe current page redirected?
                                                    await tempPage.waitForTimeout(3000);
                                                    const postClickUrl = tempPage.url();
                                                    log(`      👀 Debug: Post-Click URL: ${postClickUrl}`);
                                                    if (!postClickUrl.includes('jobright.ai')) {
                                                        rawUrl = postClickUrl;
                                                        log(`      ↳ Click Redirected to: ${rawUrl}`);
                                                    } else {
                                                        log(`      ⚠️ Post-Click URL still internal: ${postClickUrl}`);

                                                        // Check if we captured any navigation requests
                                                        if (potentialRedirects.length > 0) {
                                                            log(`      👀 Debug: Captured ${potentialRedirects.length} redirect requests.`);
                                                            // Take the last one? Or first? usually the first external one.
                                                            const validRedirect = potentialRedirects.find(u => !u.includes('jobright.ai') && !u.includes('google') && !u.includes('facebook'));
                                                            if (validRedirect) {
                                                                rawUrl = validRedirect;
                                                                log(`      ↳ Found network redirect to: ${rawUrl}`);
                                                            }
                                                        }
                                                    }
                                                }
                                            } catch (clickErr) {
                                                log(`      ⚠️ Click failed: ${clickErr.message}`);
                                            }
                                        } else {
                                            log("      ⚠️ Could not find a button to click.");
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
                            // Sanitize immediately
                            const cleanUrl = sanitizeUrl(rawUrl);
                            if (cleanUrl && !seenUrls.has(cleanUrl)) {
                                seenUrls.add(cleanUrl);
                                const newJob = {
                                    id: j.id,
                                    url: cleanUrl, // Save clean URL
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
                        // Check for excessive failures
                        if (consecutiveFailures >= FAIL_THRESHOLD) {
                            log(`🚨 Too many consecutive failures (${consecutiveFailures}). Forcing keyword rotation.`);
                            lastActivityTime = 0; // Trigger rotation in main loop
                            break;
                        }

                        const chunk = jobs.slice(i, i + CONCURRENCY_LIMIT);
                        const chunkResults = await Promise.all(chunk.map(job => processJob(job)));

                        // Save valid results immediately
                        const validJobs = chunkResults.filter(j => j !== null);
                        if (validJobs.length > 0) {
                            consecutiveFailures = 0; // Reset on success
                            try {
                                const currentData = fs.existsSync(OUTPUT_FILE) ? JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')) : [];
                                currentData.push(...validJobs);
                                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
                                validJobs.forEach(j => log(`   💾 Saved: ${j.title} (${j.url})`));
                                newCount += validJobs.length;
                                totalNew += validJobs.length;

                                // Throughput Logging
                                const elapsedMin = (Date.now() - startTime) / 60000;
                                const rate = totalNew / (elapsedMin || 1);
                                log(`   📊 Throughput: ${totalNew} jobs in ${elapsedMin.toFixed(1)}m (~${Math.round(rate * 60)} jobs/hr)`);
                            } catch (saveErr) {
                                log(`   ⚠️ Save failed: ${saveErr.message}`);
                            }
                        } else {
                            // All failed in this chunk
                            consecutiveFailures += chunk.length;
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
                consecutiveFailures = 0; // Reset failure count on rotation
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

            // 1. CLICK APPLY BUTTONS (Autonomous Mode) - DISABLED for stability
            /*
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
            */

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
