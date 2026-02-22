const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const config = require('./config');

// PARSE ARGS
const args = process.argv.slice(2);
let workerId = 1;
let chunkFile = '';

args.forEach(arg => {
    if (arg.startsWith('--worker=')) workerId = parseInt(arg.split('=')[1]);
    if (arg.startsWith('--chunk=')) chunkFile = arg.split('=')[1];
});

if (!chunkFile) {
    console.error("❌ No chunk file provided! Usage: node unified_worker.js --worker=1 --chunk=jobs_chunk_1.json");
    process.exit(1);
}

// CONFIG
const JOBS_FILE = path.resolve(chunkFile); // Use chunk file as source
const APPLIED_FILE = 'applied.json';
const APPLIED_APPEND_FILE = 'jobs_applied.json'; // All workers append to single file
const FAILED_FILE = `failed_worker_${workerId}.json`; // Per-worker failed file
const DELETED_JOBS_FILE = 'deleted_jobs.json';
const SKIPPED_JOBS_FILE = 'skipped_jobs.json';
const USER_DATA_DIR = path.resolve(`./user_data_worker_${workerId}`); // Unique Profile
const JOB_TIMEOUT_MS = 20 * 1000; // 20s — faster throughput, if no submit in 20s we move on

// --- UTILS ---
async function fillGreenhouseForm(page) {
    console.log("   📝 Auto-Filling Greenhouse Form...");
    const t = { timeout: 2000 };
    try {
        if (config.FULL_NAME) {
            await page.locator('#first_name').fill(config.FULL_NAME.split(' ')[0], t).catch(() => { });
            await page.locator('#last_name').fill(config.FULL_NAME.split(' ').slice(1).join(' '), t).catch(() => { });
        }
        if (config.EMAIL) await page.locator('#email').fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('#phone').fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator("input[autocomplete='custom-question-linkedin-profile']").fill(config.LINKEDIN_URL, t).catch(() => { });

        // Resume
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"][data-source="attach"]');
            if (await fileInput.count() > 0) await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
        }

        // --- GENERIC FILLER FOR CUSTOM FIELDS ---
        await page.waitForTimeout(1000); // Wait for dynamic fields

        // 1. Selects (Dropdowns)
        const selects = page.locator('select');
        const selectCount = await selects.count();
        for (let i = 0; i < selectCount; i++) {
            const sel = selects.nth(i);
            if (await sel.isVisible()) {
                const val = await sel.inputValue();
                if (!val) {
                    // Try to select the index 1 (usually first non-empty option)
                    await sel.selectOption({ index: 1 }).catch(() => {
                        // Fallback: index 2 if 1 is disabled/placeholder
                        sel.selectOption({ index: 2 }).catch(() => { });
                    });
                }
            }
        }

        // 2. Checkboxes (Consents, etc.) - Aggressively check required or "accept" type boxes
        // Greenhouse specific: div.field label input[type="checkbox"]
        const ellipses = page.locator('input[type="checkbox"]');
        const checkCount = await ellipses.count();
        for (let i = 0; i < checkCount; i++) {
            const box = ellipses.nth(i);
            if (await box.isVisible() && !(await box.isChecked())) {
                await box.click({ force: true }).catch(() => { });
            }
        }

        // 3. Radio Buttons (Select "Yes" or "No" heuristics?)
        // Safer to just select the first one if none selected?
        // Or leave blank if not required? Many are required.
        // Let's try to find required radio groups. 
        // For now, skip to avoid "Yes" on "Do you need visa?" if we don't know.
        // User said "auto approve everything", implying "Yes" to "Are you authorized?" etc.

        // 4. Text Inputs (Custom)
        const inputs = page.locator('input[type="text"]');
        const inputCount = await inputs.count();
        for (let i = 0; i < inputCount; i++) {
            const inp = inputs.nth(i);
            if (await inp.isVisible()) {
                const val = await inp.inputValue();
                // If empty and looks like a custom field (not the standard ones we filled)
                const id = await inp.getAttribute('id') || '';
                if (!val && !id.includes('first_name') && !id.includes('last_name') && !id.includes('email') && !id.includes('phone')) {
                    await inp.fill('N/A').catch(() => { });
                }
            }
        }

        // 5. Textareas
        const textareas = page.locator('textarea');
        const taCount = await textareas.count();
        for (let i = 0; i < taCount; i++) {
            const ta = textareas.nth(i);
            if (await ta.isVisible()) {
                if (!(await ta.inputValue())) await ta.fill('N/A').catch(() => { });
            }
        }

    } catch (e) {
        console.error(`   ❌ Greenhouse fill error: ${e.message}`);
    }
}

async function fillSmartRecruitersForm(page) {
    console.log("   📝 Auto-Filling SmartRecruiters Form...");
    try {
        const t = { timeout: 2000 };
        // SmartRecruiters (Standard Single-Page or Multi-Step)
        if (config.FULL_NAME) {
            await page.locator('#first-name-input').fill(config.FULL_NAME.split(' ')[0], t).catch(() => { });
            await page.locator('#last-name-input').fill(config.FULL_NAME.split(' ').slice(1).join(' '), t).catch(() => { });
        }
        if (config.EMAIL) await page.locator('#email-input').fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('#phone-number-input').fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator('#linkedin-input').fill(config.LINKEDIN_URL, t).catch(() => { });

        // Resume
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"]'); // Often generic
            if (await fileInput.count() > 0) {
                await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
            }
        }

        // --- GENERIC FILLER FOR SMARTRECRUITERS CUSTOM FIELDS ---
        await page.waitForTimeout(1000);

        // 1. Selects
        const selects = page.locator('select');
        const selectCount = await selects.count();
        for (let i = 0; i < selectCount; i++) {
            const sel = selects.nth(i);
            if (await sel.isVisible() && !(await sel.inputValue())) {
                await sel.selectOption({ index: 1 }).catch(() => {
                    sel.selectOption({ index: 2 }).catch(() => { });
                });
            }
        }

        // 2. Checkboxes (Consent)
        const boxes = page.locator('input[type="checkbox"]');
        const boxCount = await boxes.count();
        for (let i = 0; i < boxCount; i++) {
            const box = boxes.nth(i);
            if (await box.isVisible() && !(await box.isChecked())) {
                await box.click({ force: true }).catch(() => { });
            }
        }

        // 3. Text inputs (Custom)
        const inputs = page.locator('input[type="text"]');
        const inpCount = await inputs.count();
        for (let i = 0; i < inpCount; i++) {
            const inp = inputs.nth(i);
            if (await inp.isVisible() && !(await inp.inputValue())) {
                const id = await inp.getAttribute('id') || '';
                // Avoid overwriting name/email/phone/linkedin if they were already filled or failed
                if (!id.includes('first-name') && !id.includes('last-name') && !id.includes('email') && !id.includes('phone') && !id.includes('linkedin')) {
                    await inp.fill('N/A').catch(() => { });
                }
            }
        }

        // 4. Textareas
        const areas = page.locator('textarea');
        const aCount = await areas.count();
        for (let i = 0; i < aCount; i++) {
            const a = areas.nth(i);
            if (await a.isVisible() && !(await a.inputValue())) {
                await a.fill('N/A').catch(() => { });
            }
        }
    } catch (e) {
        console.error(`   ❌ SmartRecruiters fill error: ${e.message}`);
    }
}

async function fillLeverForm(page) {
    console.log("   📝 Auto-Filling Lever Form...");
    const t = { timeout: 2000 };
    try {
        if (config.FULL_NAME) await page.locator('input[name="name"]').fill(config.FULL_NAME, t).catch(() => { });
        if (config.EMAIL) await page.locator('input[name="email"]').fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('input[name="phone"]').fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator('input[name="urls[LinkedIn]"]').fill(config.LINKEDIN_URL, t).catch(() => { });
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"]');
            if (await fileInput.count() > 0) await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
        }
        // Generic selects
        await page.waitForTimeout(1000);
        const selects = page.locator('select');
        const selectCount = await selects.count();
        for (let i = 0; i < selectCount; i++) {
            const sel = selects.nth(i);
            if (await sel.isVisible() && !(await sel.inputValue())) {
                await sel.selectOption({ index: 1 }).catch(() => { sel.selectOption({ index: 2 }).catch(() => { }); });
            }
        }
    } catch (e) {
        console.error(`   ❌ Lever fill error: ${e.message}`);
    }
}

async function fillWorkdayForm(page) {
    console.log("   📝 Auto-Filling Workday Form...");
    const t = { timeout: 2000 };
    try {
        if (config.EMAIL) await page.locator('input[data-automation-id="email"], input[type="email"]').first().fill(config.EMAIL, t).catch(() => { });
        if (config.FULL_NAME) {
            await page.locator('input[data-automation-id="legalNameSection_firstName"]').fill(config.FULL_NAME.split(' ')[0], t).catch(() => { });
            await page.locator('input[data-automation-id="legalNameSection_lastName"]').fill(config.FULL_NAME.split(' ').slice(1).join(' '), t).catch(() => { });
        }
        if (config.PHONE) await page.locator('input[data-automation-id="phone-number"], input[data-automation-id="phonePart1"]').first().fill(config.PHONE, t).catch(() => { });
        // Resume
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"][data-automation-id="file-upload-input-ref"], input[type="file"]').first();
            if (await fileInput.count() > 0) await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
        }
    } catch (e) {
        console.error(`   ❌ Workday fill error: ${e.message}`);
    }
}

async function fillAshbyForm(page) {
    console.log("   📝 Auto-Filling Ashby Form...");
    const t = { timeout: 2000 };
    try {
        if (config.FULL_NAME) await page.locator('input[name="name"], input[id*="name"], input[aria-label*="Name"]').first().fill(config.FULL_NAME, t).catch(() => { });
        if (config.EMAIL) await page.locator('input[name="email"], input[id*="email"], input[type="email"]').first().fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('input[name="phone"], input[id*="phone"], input[type="tel"]').first().fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator('input[name*="linkedin"], input[id*="linkedin"]').first().fill(config.LINKEDIN_URL, t).catch(() => { });
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"]');
            if (await fileInput.count() > 0) await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
        }
        // Generic selects + checkboxes
        await page.waitForTimeout(1000);
        const selects = page.locator('select');
        const selectCount = await selects.count();
        for (let i = 0; i < selectCount; i++) {
            const sel = selects.nth(i);
            if (await sel.isVisible() && !(await sel.inputValue())) {
                await sel.selectOption({ index: 1 }).catch(() => { sel.selectOption({ index: 2 }).catch(() => { }); });
            }
        }
        const boxes = page.locator('input[type="checkbox"]');
        const boxCount = await boxes.count();
        for (let i = 0; i < boxCount; i++) {
            const box = boxes.nth(i);
            if (await box.isVisible() && !(await box.isChecked())) {
                await box.click({ force: true }).catch(() => { });
            }
        }
    } catch (e) {
        console.error(`   ❌ Ashby fill error: ${e.message}`);
    }
}

async function waitForActionOrSkip(page, durationMs) {
    const steps = durationMs / 50;
    for (let i = 0; i < steps; i++) {
        if (global.SKIP_SIGNAL) return true;
        if (global.DELETE_SIGNAL) return true;
        if (global.SUCCESS_SIGNAL) return true;
        try {
            if (await page.evaluate(() => window.jobRightSkip).catch(() => false)) { global.SKIP_SIGNAL = true; return true; }
            if (await page.evaluate(() => window.jobRightDelete).catch(() => false)) { global.DELETE_SIGNAL = true; return true; }
            if (await page.evaluate(() => window.jobRightSuccess).catch(() => false)) { global.SUCCESS_SIGNAL = true; return true; }
        } catch (e) { }
        await page.waitForTimeout(50);
    }
    return false;
}

const normalizeUrl = (u) => {
    if (!u) return '';
    u = u.trim();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
};

const isExcluded = (job) => {
    const u = (job.url || '').toLowerCase();
    const c = (job.company || '').toLowerCase();
    const t = (job.title || '').toLowerCase();

    // 1. Speechify (Standard Exclusion)
    if (u.includes('speechify')) return true;

    // 2. Palo Alto Networks (User Request)
    if (u.includes('paloaltonetworks') || u.includes('palo-alto') || u.includes('palo%20alto')) return true;
    if (c.includes('palo alto') || c.includes('paloalto')) return true;
    if (t.includes('palo alto')) return true;

    return false;
};

(async () => {
    console.log(`>>> STARTING WORKER ${workerId} (File: ${chunkFile}) <<<`);

    // Terminal Controls
    if (process.stdin.isTTY) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.on('keypress', (str, key) => {
            if (key.ctrl && key.name === 'c') process.exit();
            if (key.name === 's') { console.log("   🎹 SKIP REQUESTED"); global.SKIP_SIGNAL = true; }
            if (key.name === 'd') { console.log("   🎹 DELETE REQUESTED"); global.DELETE_SIGNAL = true; }
            if (key.name === 'a') { console.log("   🎹 APPLIED REQUESTED"); global.SUCCESS_SIGNAL = true; }
        });
        console.log("ℹ️  Controls: 's'=Skip, 'd'=Delete, 'a'=Applied, Ctrl+C=Exit");
    }

    // Load History
    let appliedUrls = new Set();
    let deletedUrls = new Set();

    function loadHistory() {
        try {
            if (fs.existsSync(APPLIED_FILE)) JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf8')).forEach(a => appliedUrls.add(normalizeUrl(a.url)));
            if (fs.existsSync(APPLIED_APPEND_FILE)) fs.readFileSync(APPLIED_APPEND_FILE, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                try { appliedUrls.add(normalizeUrl(JSON.parse(l).url)); } catch (e) { }
            });
            // Also load per-worker append files from previous runs
            for (let i = 1; i <= 10; i++) {
                const f = `applied_append_worker_${i}.jsonl`;
                if (fs.existsSync(f)) fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                    try { appliedUrls.add(normalizeUrl(JSON.parse(l).url)); } catch (e) { }
                });
            }
            if (fs.existsSync(DELETED_JOBS_FILE)) fs.readFileSync(DELETED_JOBS_FILE, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                try { const u = normalizeUrl(JSON.parse(l).url); appliedUrls.add(u); deletedUrls.add(u); } catch (e) { }
            });
            if (fs.existsSync(SKIPPED_JOBS_FILE)) fs.readFileSync(SKIPPED_JOBS_FILE, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                try { appliedUrls.add(normalizeUrl(JSON.parse(l).url)); } catch (e) { }
            });
        } catch (e) { }
    }
    loadHistory();

    // Browser
    const TEMP_USER_DATA_DIR = USER_DATA_DIR + '_' + Date.now();
    console.log(`[Worker ${workerId}] 🚀 Launching Browser (Headless: true) in ${TEMP_USER_DATA_DIR}...`);
    const b = await chromium.launchPersistentContext(TEMP_USER_DATA_DIR, {
        headless: true,
        channel: 'chrome',
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled'
        ],
        ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
        viewport: null
    });
    const page = b.pages().length > 0 ? b.pages()[0] : await b.newPage();

    // Controls Injection (Persistent)
    const CONTROLS_SCRIPT = `
        if (!document.getElementById('jobright-controls')) {
            const container = document.createElement('div');
            container.id = 'jobright-controls';
            container.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:2147483647;background:rgba(0,0,0,0.9);padding:15px;border-radius:8px;border:2px solid #00ff00;color:white;font-family:Arial;';

            const title = document.createElement('div');
            title.innerHTML = '<b>🟢 UNIFIED RUNNER</b><br><small>GH + SR | Excl: Palo Alto</small>';
            container.appendChild(title);

            const btnBox = document.createElement('div');
            btnBox.style.cssText = 'display:flex;gap:10px;margin-top:10px';

            const createBtn = (text, color, setter) => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.style.cssText = 'background:' + color + ';color:white;border:none;padding:8px 15px;border-radius:5px;cursor:pointer;font-weight:bold;';
                btn.onclick = () => { window[setter] = true; btn.innerText = "Processing..."; btn.disabled = true; };
                return btn;
            };

            btnBox.appendChild(createBtn('✅ APPLIED', '#2ecc71', 'jobRightSuccess'));
            btnBox.appendChild(createBtn('⏭️ SKIP', '#f39c12', 'jobRightSkip'));
            btnBox.appendChild(createBtn('🗑️ DELETE', '#c0392b', 'jobRightDelete'));
            container.appendChild(btnBox);
            document.body.appendChild(container);
        }
    `;

    // Add Init Script for persistence
    await b.addInitScript(CONTROLS_SCRIPT);

    // Also inject immediately for the first page
    await page.evaluate(CONTROLS_SCRIPT);

    // Main Loop
    while (true) {
        let allJobs = [];
        // Load Jobs from Chunk
        try {
            if (fs.existsSync(JOBS_FILE)) {
                console.log(`[Worker ${workerId}] ℹ️  Loading jobs...`);
                const raw = fs.readFileSync(JOBS_FILE, 'utf8');
                try {
                    allJobs = JSON.parse(raw);
                } catch (e) {
                    // Fallback for line-based JSON
                    allJobs = raw.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
                }
            } else {
                console.error(`[Worker ${workerId}] ❌ Chunk file not found: ${JOBS_FILE}`);
                process.exit(1);
            }
        } catch (e) {
            console.error(`[Worker ${workerId}] Error loading jobs:`, e.message);
            process.exit(1);
        }

        // Filter: Greenhouse OR SmartRecruiters AND Not Excluded
        let droppedPlatform = 0;
        let droppedExcluded = 0;
        let droppedApplied = 0;

        const queue = allJobs
            .filter(j => {
                if (!j.url) return false;

                // 1. Platform Check
                const isGh = j.url.includes('greenhouse.io') || j.url.includes('boards.greenhouse.io');
                const isSr = j.url.includes('smartrecruiters.com');
                const isLever = j.url.includes('lever.co');
                const isAshby = j.url.includes('ashbyhq');
                const isWorkday = j.url.includes('myworkdayjobs.com') || j.url.includes('workday.com');

                if (!isGh && !isSr && !isLever && !isAshby && !isWorkday) {
                    droppedPlatform++;
                    return false;
                }

                // 2. Exclusion Check
                if (isExcluded(j)) {
                    droppedExcluded++;
                    return false;
                }

                // 3. Applied Check
                const u = normalizeUrl(j.url);
                if (appliedUrls.has(u)) {
                    droppedApplied++;
                    return false;
                }
                return true;
            });

        console.log(`\n[Worker ${workerId}] 📊 Queue: ${queue.length} jobs.`);
        console.log(`[Worker ${workerId}] Debug: Total=${allJobs.length}, DroppedPlatform=${droppedPlatform}, DroppedExcluded=${droppedExcluded}, DroppedApplied=${droppedApplied}, HistorySize=${appliedUrls.size}`);

        if (queue.length === 0) {
            console.log(`[Worker ${workerId}] No matching jobs found. Exiting...`);
            await b.close();
            process.exit(0);
        }

        // Process One by One
        for (const job of queue) {
            if (appliedUrls.has(normalizeUrl(job.url))) continue; // Double check

            console.log(`\n---------------------------------------------------`);
            console.log(`🏢 Company: ${job.company}`);
            console.log(`💼 Title:   ${job.title}`);
            console.log(`🔗 URL:     ${job.url}`);

            global.SKIP_SIGNAL = false;
            global.DELETE_SIGNAL = false;
            global.SUCCESS_SIGNAL = false;

            let status = "FAILED";
            let err = "";

            try {
                await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                // Note: InitScript handles injection, but we can do a safety check
                await page.evaluate(CONTROLS_SCRIPT);

                // --- DEAD JOB CHECK ---
                const bodyText = await page.innerText('body').catch(() => '');
                if (bodyText.includes("Sorry, but we can't find that page") ||
                    bodyText.includes("Job is no longer available") ||
                    bodyText.includes("Posting not found") ||
                    bodyText.includes("This job is no longer accepting applications")) {
                    console.log("   ❌ Job is expired or not found.");
                    status = "EXPIRED";
                    throw new Error("Job Expired");
                }


                // ID Platform
                const isGh = job.url.includes('greenhouse.io');
                const isSr = job.url.includes('smartrecruiters.com');
                const isLever = job.url.includes('lever.co');
                const isAshby = job.url.includes('ashbyhq');
                const isWorkday = job.url.includes('myworkdayjobs.com') || job.url.includes('workday.com');

                // Auto-fill
                if (isGh) await fillGreenhouseForm(page);
                else if (isSr) await fillSmartRecruitersForm(page);
                else if (isLever) await fillLeverForm(page);
                else if (isAshby) await fillAshbyForm(page);
                else if (isWorkday) await fillWorkdayForm(page);

                // Auto-Click (Heuristic)
                let clickedSubmit = false;
                const AUTO_CLICK = true;
                if (AUTO_CLICK) {
                    const selectors = [
                        '#submit_app',
                        'button:has-text("Submit Application")',
                        'button:has-text("Submit application")',
                        'button:has-text("Apply")',
                        'button:has-text("Submit")',
                        '#st-apply',                  // SmartRecruiters
                        'a:has-text("I\'m interested")', // SmartRecruiters often starts with this
                        'button:has-text("Start Application")', // Ashby
                        'button[data-automation-id="applyButton"]', // Workday
                        'button[data-automation-id="bottom-navigation-next-button"]', // Workday next
                        'a:has-text("Apply")' // Generic apply link
                    ];

                    for (const sel of selectors) {
                        try {
                            const el = page.locator(sel).first();
                            if (await el.isVisible()) {
                                console.log(`   💡 Found Action Button: ${sel}`);
                                // For SmartRecruiters "I'm interested", we might need to click it to see the form
                                // But usually we just let the user see it or click it
                                // For this script, let's try to click "I'm interested" if we see it, to reveal form
                                if (sel.includes("I'm interested")) {
                                    await el.click();
                                    console.log("   🖱️  Clicked 'I'm interested' to reveal form...");
                                    await page.waitForTimeout(1000);
                                    // Re-run fill if we just opened the modal
                                    if (isSr) await fillSmartRecruitersForm(page);
                                } else {
                                    await el.click();
                                    console.log("   🖱️  Clicked Submit/Apply!");
                                    clickedSubmit = true;
                                }
                            }
                        } catch (e) { }
                    }
                }

                // Wait loop
                const startTime = Date.now();
                while (Date.now() - startTime < JOB_TIMEOUT_MS) {
                    // Check for success text
                    const body = await page.innerText('body').catch(() => "");
                    // Greenhouse: "Application sent"
                    // SmartRecruiters: "Application submitted" or "profile created"
                    if (body.includes("Application sent") || body.includes("Application submitted") || body.includes("APPLICATION SUBMITTED")) {
                        console.log("   ✅ Success text detected!");
                        status = "APPLIED";
                        break;
                    }

                    if (await waitForActionOrSkip(page, 1000)) break;
                }

                if (global.SUCCESS_SIGNAL) status = "APPLIED";
                if (global.SKIP_SIGNAL) status = "SKIPPED_USER";
                if (global.DELETE_SIGNAL) status = "DELETED";
                if (Date.now() - startTime >= JOB_TIMEOUT_MS) {
                    status = (clickedSubmit) ? "TIMEOUT_APPLIED" : "TIMEOUT";
                }

            } catch (e) {
                console.log(`   ❌ Error: ${e.message}`);
                err = e.message;

                // Critical Browser Failure Check
                if (e.message && (e.message.includes('Target page, context or browser has been closed') ||
                    e.message.includes('Session closed') ||
                    e.message.includes('browser has been disconnected'))) {
                    console.error("🔥 CRITICAL: Browser crashed/disconnected. Exiting worker for restart.");
                    process.exit(1);
                }

                // Screenshot on failure
                if (status === "FAILED" || status === "TIMEOUT") {
                    try {
                        const shotPath = path.resolve(process.cwd(), `error_${workerId}_${Date.now()}.png`);
                        await page.screenshot({ path: shotPath, fullPage: true });
                        const htmlPath = path.resolve(process.cwd(), `error_${workerId}_${Date.now()}.html`);
                        fs.writeFileSync(htmlPath, await page.content());
                        console.log(`   📸 Saved screenshot to ${shotPath}`);
                    } catch (ex) { console.error("Snapshot failed", ex); }
                }

            }

            // Save
            console.log(`   📝 Saving Status: ${status}`);
            const entry = { url: job.url, status, timestamp: new Date().toISOString(), error: err };
            if (status === "APPLIED" || status === "TIMEOUT_APPLIED" || status === "TIMEOUT") {
                fs.appendFileSync(APPLIED_APPEND_FILE, JSON.stringify(entry) + '\n');
                appliedUrls.add(normalizeUrl(job.url));
            } else if (status === "SKIPPED_USER") {
                fs.appendFileSync(SKIPPED_JOBS_FILE, JSON.stringify(entry) + '\n');
                appliedUrls.add(normalizeUrl(job.url));
            } else if (status === "DELETED") {
                fs.appendFileSync(DELETED_JOBS_FILE, JSON.stringify(entry) + '\n');
                appliedUrls.add(normalizeUrl(job.url));
            } else {
                // Write errors to separate file so they can be retried in future cycles
                const skipEntry = { ...entry, status: 'SKIPPED_ERROR' };
                fs.appendFileSync('skipped_errors.jsonl', JSON.stringify(skipEntry) + '\n');
                appliedUrls.add(normalizeUrl(job.url)); // Don't retry within this session
                fs.appendFileSync(FAILED_FILE, JSON.stringify(entry) + '\n');
            }
        }
        console.log(`[Worker ${workerId}] ✅ Finished processing queue. Exiting...`);
        await b.close();
        process.exit(0);
    }
})();
