const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// === CONFIG ===
// Strategy: parallel with 5s cooldown between jobs to increase throughput
const PARALLEL_TABS = 6;
const JOB_TIMEOUT_MS = 20 * 1000;      // 20s per job (increased slightly for stability)
const NAV_TIMEOUT_MS = 15 * 1000;       // 15s page load
const FILL_TIMEOUT_MS = 2000;           // 2s per field
const SUBMIT_WAIT_MS = 2000;            // 2s after submit click
const COOLDOWN_MS = 5 * 1000;           // 5s between jobs
const QUEUE_POLL_MS = 30 * 1000;        // 30s poll when empty

// FILES
const JOBS_FILE = path.resolve(__dirname, 'newjobs.json');
const APPLIED_APPEND_FILE = path.resolve(__dirname, 'jobs_applied.json');
const FAILED_FILE = path.resolve(__dirname, 'failed_jobs.json');
const DELETED_JOBS_FILE = path.resolve(__dirname, 'deleted_jobs.json');
const SKIPPED_JOBS_FILE = path.resolve(__dirname, 'skipped_jobs.json');
const USER_DATA_DIR = path.resolve(__dirname, 'user_data_high_throughput');

// STATS
let stats = { applied: 0, failed: 0, skipped: 0, startTime: Date.now() };

function log(msg) {
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
    const rate = stats.applied > 0 ? ((stats.applied / (Date.now() - stats.startTime)) * 3600000).toFixed(0) : 0;
    console.log(`[${elapsed}s | ${stats.applied} applied | ${rate}/hr] ${msg}`);
}

// === URL NORMALIZATION ===
const normalizeUrl = (u) => {
    if (!u) return '';
    u = u.trim().toLowerCase();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
};

// === EXCLUSION ===
const isExcluded = (job) => {
    const u = (job.url || '').toLowerCase();
    const c = (job.company || '').toLowerCase();
    const t = (job.title || '').toLowerCase();
    if (u.includes('speechify') || c.includes('speechify')) return true;
    if (u.includes('paloaltonetworks') || u.includes('palo-alto') || u.includes('palo%20alto')) return true;
    if (c.includes('palo alto') || c.includes('paloalto')) return true;
    if (t.includes('palo alto')) return true;
    return false;
};

// === LOAD HISTORY ===
function loadAppliedSet() {
    const applied = new Set();
    const files = [
        { file: APPLIED_APPEND_FILE, format: 'ndjson' },
        { file: DELETED_JOBS_FILE, format: 'ndjson' },
        { file: SKIPPED_JOBS_FILE, format: 'ndjson' },
        { file: FAILED_FILE, format: 'ndjson' },
    ];
    for (const { file, format } of files) {
        if (!fs.existsSync(file)) continue;
        try {
            const content = fs.readFileSync(file, 'utf8');
            content.split('\n').filter(l => l.trim()).forEach(l => {
                try {
                    const entry = JSON.parse(l);
                    if (entry.url) applied.add(normalizeUrl(entry.url));
                } catch (e) { }
            });
            // Also try as JSON array
            try {
                JSON.parse(content).forEach(entry => {
                    if (entry.url) applied.add(normalizeUrl(entry.url));
                });
            } catch (e) { }
        } catch (e) { }
    }
    return applied;
}

// === LOAD JOBS ===
function loadQueue(appliedSet) {
    let raw;
    try {
        raw = fs.readFileSync(JOBS_FILE, 'utf8');
    } catch (e) {
        log(`Error reading ${JOBS_FILE}: ${e.message}`);
        return [];
    }

    let allJobs = [];
    try {
        allJobs = JSON.parse(raw);
    } catch (e) {
        // Fix concatenated arrays
        try {
            allJobs = JSON.parse(raw.replace(/\]\s*\[/g, ','));
        } catch (e2) {
            // NDJSON fallback
            allJobs = raw.split('\n').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(j => j);
        }
    }

    const seen = new Set();
    return allJobs.filter(j => {
        if (!j.url) return false;
        const u = normalizeUrl(j.url);
        if (seen.has(u) || appliedSet.has(u)) return false;
        seen.add(u);

        // Platform filter: only automatable ATS
        const isGh = u.includes('greenhouse');
        const isLever = u.includes('lever.co');
        const isAshby = u.includes('ashbyhq');
        const isSr = u.includes('smartrecruiters');
        if (!isGh && !isLever && !isAshby && !isSr) return false;

        if (isExcluded(j)) return false;
        return true;
    });
}

// === FORM FILLERS ===
async function fillGreenhouseForm(page) {
    const t = { timeout: FILL_TIMEOUT_MS };
    try {
        if (config.FULL_NAME) {
            await page.locator('#first_name').fill(config.FULL_NAME.split(' ')[0], t).catch(() => { });
            await page.locator('#last_name').fill(config.FULL_NAME.split(' ').slice(1).join(' '), t).catch(() => { });
        }
        if (config.EMAIL) await page.locator('#email').fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('#phone').fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator("input[autocomplete='custom-question-linkedin-profile']").fill(config.LINKEDIN_URL, t).catch(() => { });
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"][data-source="attach"]');
            if (await fileInput.count() > 0) await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
        }
    } catch (e) { }
}

async function fillLeverForm(page) {
    const t = { timeout: FILL_TIMEOUT_MS };
    try {
        if (config.FULL_NAME) await page.locator('input[name="name"]').fill(config.FULL_NAME, t).catch(() => { });
        if (config.EMAIL) await page.locator('input[name="email"]').fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('input[name="phone"]').fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator('input[name="urls[LinkedIn]"]').fill(config.LINKEDIN_URL, t).catch(() => { });
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"]');
            if (await fileInput.count() > 0) await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
        }
    } catch (e) { }
}

async function fillAshbyForm(page) {
    const t = { timeout: FILL_TIMEOUT_MS };
    try {
        if (config.FULL_NAME) await page.locator('input[name="name"], input[id*="name"], input[aria-label*="Name"]').first().fill(config.FULL_NAME, t).catch(() => { });
        if (config.EMAIL) await page.locator('input[name="email"], input[id*="email"], input[type="email"]').first().fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('input[name="phone"], input[id*="phone"], input[type="tel"]').first().fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator('input[name*="linkedin"], input[id*="linkedin"]').first().fill(config.LINKEDIN_URL, t).catch(() => { });
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"]');
            if (await fileInput.count() > 0) await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
        }
    } catch (e) { }
}

async function fillSmartRecruitersForm(page) {
    const t = { timeout: FILL_TIMEOUT_MS };
    try {
        if (config.FULL_NAME) {
            await page.locator('#first-name-input, #first-name').first().fill(config.FULL_NAME.split(' ')[0], t).catch(() => { });
            await page.locator('#last-name-input, #last-name').first().fill(config.FULL_NAME.split(' ').slice(1).join(' '), t).catch(() => { });
        }
        if (config.EMAIL) await page.locator('#email-input, #email').first().fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('#phone-number-input, #phone-number').first().fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator('#linkedin-input, #linkedin-url').first().fill(config.LINKEDIN_URL, t).catch(() => { });
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"]');
            if (await fileInput.count() > 0) await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
        }
    } catch (e) { }
}

// === AUTO-SUBMIT ===
async function autoSubmit(page, platform) {
    const selectors = {
        greenhouse: ['#submit_app', 'button:has-text("Submit Application")', 'input[value="Submit Application"]', 'button[type="submit"]'],
        lever: ['button:has-text("Submit application")', 'button:has-text("Submit")', 'button[type="submit"]'],
        ashby: ['button:has-text("Submit Application")', 'button:has-text("Submit")', 'button:has-text("Start Application")', 'button[type="submit"]'],
        smartrecruiters: ['button:has-text("Apply")', '#st-apply', 'button:has-text("I\'m interested")', 'button:has-text("Submit")', 'button:has-text("Next")'],
    };

    const platformSelectors = selectors[platform] || [];
    for (const sel of platformSelectors) {
        try {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 500 }) && await el.isEnabled({ timeout: 500 })) {
                await el.click({ timeout: 2000 });
                log(`   ✅ Clicked: ${sel}`);
                return true;
            }
        } catch (e) { }
    }
    return false;
}

// === SUCCESS DETECTION ===
async function checkSuccess(page) {
    try {
        const body = await page.innerText('body', { timeout: 1000 }).catch(() => '');
        const successPhrases = [
            'Application sent', 'Application Submitted', 'APPLICATION SUBMITTED',
            'Great! We sent your application', 'Thank you for applying',
            'received your application', 'Application received',
            'profile created', 'You have already applied'
        ];
        return successPhrases.some(p => body.includes(p));
    } catch (e) { return false; }
}

// === PROCESS SINGLE JOB ===
async function processJob(page, job, appliedSet) {
    const url = job.url;
    const u = normalizeUrl(url);
    const platform = u.includes('greenhouse') ? 'greenhouse'
        : u.includes('lever.co') ? 'lever'
            : u.includes('ashbyhq') ? 'ashby'
                : u.includes('smartrecruiters') ? 'smartrecruiters'
                    : 'unknown';

    const startTime = Date.now();
    let status = 'FAILED';
    let error = '';

    try {
        // Navigate
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

        // Quick success check (already applied?)
        if (await checkSuccess(page)) {
            status = 'ALREADY_APPLIED';
            return { status, error };
        }

        // Fill form
        if (platform === 'greenhouse') await fillGreenhouseForm(page);
        else if (platform === 'lever') await fillLeverForm(page);
        else if (platform === 'ashby') await fillAshbyForm(page);
        else if (platform === 'smartrecruiters') await fillSmartRecruitersForm(page);

        // Submit
        let clicked = await autoSubmit(page, platform);

        if (clicked) {
            // Wait for response
            await page.waitForTimeout(SUBMIT_WAIT_MS);
            if (await checkSuccess(page)) {
                status = 'APPLIED';
                return { status, error };
            }

            // Try submit again (multi-step forms)
            clicked = await autoSubmit(page, platform);
            if (clicked) {
                await page.waitForTimeout(SUBMIT_WAIT_MS);
                if (await checkSuccess(page)) {
                    status = 'APPLIED';
                    return { status, error };
                }
            }
        }

        // Wait remaining time for success
        const remaining = JOB_TIMEOUT_MS - (Date.now() - startTime);
        if (remaining > 0) {
            const checkInterval = 1000;
            for (let elapsed = 0; elapsed < remaining; elapsed += checkInterval) {
                await page.waitForTimeout(Math.min(checkInterval, remaining - elapsed));
                if (await checkSuccess(page)) {
                    status = 'APPLIED';
                    return { status, error };
                }
            }
        }

        // Timeout — treat as attempted (move on, don't re-visit)
        status = 'TIMEOUT_APPLIED';

    } catch (e) {
        error = e.message;
        status = 'FAILED';
    }

    return { status, error };
}

// === SAVE RESULT ===
function saveResult(job, status, error, appliedSet) {
    const entry = { url: job.url, title: job.title, company: job.company, status, error, timestamp: new Date().toISOString() };

    if (status === 'APPLIED' || status === 'ALREADY_APPLIED' || status === 'TIMEOUT_APPLIED') {
        fs.appendFileSync(APPLIED_APPEND_FILE, JSON.stringify(entry) + '\n');
        appliedSet.add(normalizeUrl(job.url));
        stats.applied++;
    } else {
        fs.appendFileSync(FAILED_FILE, JSON.stringify(entry) + '\n');
        appliedSet.add(normalizeUrl(job.url)); // Don't retry in this session
        stats.failed++;
    }
}

// === MAIN ===
(async () => {
    console.log('');
    console.log('==============================================');
    console.log('  HIGH THROUGHPUT RUNNER — TARGET: 500/hr');
    console.log(`  Parallel tabs: ${PARALLEL_TABS}`);
    console.log(`  Timeout: ${JOB_TIMEOUT_MS / 1000}s per job`);
    console.log('==============================================');
    console.log('');

    // Clean locks
    const locks = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    locks.forEach(lock => {
        const lockFile = path.join(USER_DATA_DIR, lock);
        if (fs.existsSync(lockFile)) try { fs.unlinkSync(lockFile); } catch (e) { }
    });

    // Ensure user data dir exists
    if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    // Launch browser
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: true,
        channel: 'chrome',
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox'],
        ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
        viewport: null
    });

    log('Browser launched. Creating tabs...');

    // Create parallel tabs
    const pages = [];
    for (let i = 0; i < PARALLEL_TABS; i++) {
        const p = (i === 0 && context.pages().length > 0) ? context.pages()[0] : await context.newPage();
        pages.push(p);
    }

    log(`${pages.length} tabs ready. Starting processing...`);

    // Main loop
    while (true) {
        const appliedSet = loadAppliedSet();
        const queue = loadQueue(appliedSet);

        log(`Queue: ${queue.length} jobs remaining (${appliedSet.size} already processed)`);

        if (queue.length === 0) {
            log(`No jobs in queue. Waiting ${QUEUE_POLL_MS / 1000}s...`);
            await new Promise(r => setTimeout(r, QUEUE_POLL_MS));
            continue;
        }

        // Process in parallel chunks
        let idx = 0;
        while (idx < queue.length) {
            const chunk = queue.slice(idx, idx + PARALLEL_TABS);
            idx += chunk.length;

            const promises = chunk.map(async (job, i) => {
                const page = pages[i % pages.length];
                const jobLabel = `[Tab ${i + 1}] ${job.title || 'Unknown'} @ ${job.company || 'Unknown'}`;
                log(`${jobLabel} → ${job.url}`);

                const { status, error } = await processJob(page, job, appliedSet);
                saveResult(job, status, error, appliedSet);

                const icon = status.includes('APPLIED') ? '✅' : '❌';
                log(`${icon} ${jobLabel} → ${status}`);
            });

            await Promise.all(promises);

            // Cooldown between jobs to avoid rate limiting
            if (idx < queue.length) {
                log(`⏳ Cooling down ${COOLDOWN_MS / 1000}s before next job...`);
                await new Promise(r => setTimeout(r, COOLDOWN_MS));
            }

            // Reload applied set periodically to avoid double-processing
            if (idx % 50 === 0) {
                const freshApplied = loadAppliedSet();
                // Skip already processed from remaining queue
                while (idx < queue.length && freshApplied.has(normalizeUrl(queue[idx].url))) {
                    idx++;
                }
            }
        }

        // Print summary
        const elapsedHrs = (Date.now() - stats.startTime) / 3600000;
        log(`\n📊 Session: ${stats.applied} applied, ${stats.failed} failed in ${elapsedHrs.toFixed(2)}hrs (${(stats.applied / elapsedHrs).toFixed(0)}/hr)\n`);
    }
})();
