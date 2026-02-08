const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const config = require('./config');

// CONFIG
const JOBS_FILE = path.join(__dirname, 'job_links.json');
const NEW_JOBS_FILE = path.join(__dirname, 'newjobs.json');
const APPLIED_FILE = 'applied.json';
const APPLIED_APPEND_FILE = 'applied_append.jsonl';
const FAILED_FILE = 'failed-application.json';
const DELETED_JOBS_FILE = 'deleted_jobs.json';
const SKIPPED_JOBS_FILE = 'skipped_jobs.json';
const USER_DATA_DIR = path.resolve('./user_data_ashby_runner'); // Use existing profile with extension
const JOB_TIMEOUT_MS = 45 * 1000; // 45 seconds (User Requested)

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
    } catch (e) { console.log("   (Greenhouse fill error: " + e.message + ")"); }
}

async function fillSmartRecruitersForm(page) {
    console.log("   📝 Auto-Filling SmartRecruiters Form...");
    const t = { timeout: 2000 };
    try {
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
    } catch (e) { console.log("   (SmartRecruiters fill error: " + e.message + ")"); }
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
    console.log(">>> STARTING UNIFIED RUNNER (Greenhouse + SmartRecruiters) <<<");

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
    const b = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
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
        try {
            if (fs.existsSync(NEW_JOBS_FILE)) {
                console.log("ℹ️  Loading jobs...");
                const raw = fs.readFileSync(NEW_JOBS_FILE, 'utf8');
                try {
                    allJobs = JSON.parse(raw);
                } catch (jsonError) {
                    console.log("⚠️ Standard Parse Failed. Attempting strategies...");

                    // Strategy 1: Arrays
                    if (raw.includes('][')) {
                        try {
                            const fixed = raw.replace(/\]\s*\[/g, ',');
                            allJobs = JSON.parse(fixed);
                            console.log("   ✅ Fixed ][ concatenation");
                        } catch (e) { }
                    }
                    // Strategy 2: Objects
                    if (allJobs.length === 0 && raw.includes('}{')) {
                        try {
                            const fixed = raw.replace(/}\s*{/g, '},{');
                            allJobs = JSON.parse(`[${fixed}]`);
                            console.log("   ✅ Fixed }{ concatenation");
                        } catch (e) { }
                    }
                    // Strategy 3: NDJSON
                    if (allJobs.length === 0) {
                        try {
                            allJobs = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0)
                                .map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(j => j);
                            if (allJobs.length > 0) console.log(`   ✅ Parsed ${allJobs.length} lines via NDJSON`);
                        } catch (e) { }
                    }
                    // Strategy 4: Regex Fallback
                    if (allJobs.length < 500) {
                        console.log("   🔧 Strategy 4: Regex Scan for URLs...");
                        const urlRegex = /"url"\s*:\s*"([^"]+)"/g;
                        const regexJobs = [];
                        const seenUrl = new Set();
                        allJobs.forEach(j => { if (j.url) seenUrl.add(j.url); });
                        let match;
                        while ((match = urlRegex.exec(raw)) !== null) {
                            const u = match[1];
                            if (u && !seenUrl.has(u)) {
                                regexJobs.push({ url: u, title: "Unknown (Regex)", company: "Unknown" });
                                seenUrl.add(u);
                            }
                        }
                        if (regexJobs.length > 0) {
                            console.log(`   ✅ Found ${regexJobs.length} additional jobs via Regex.`);
                            allJobs = allJobs.concat(regexJobs);
                        }
                    }
                }
            } else if (fs.existsSync(JOBS_FILE)) {
                allJobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
            }
        } catch (e) { console.log("Error loading jobs:", e.message); await new Promise(r => setTimeout(r, 5000)); continue; }

        // Filter: Greenhouse OR SmartRecruiters AND Not Excluded
        const queue = allJobs
            .filter(j => {
                if (!j.url) return false;

                // 1. Platform Check
                const isGh = j.url.includes('greenhouse.io') || j.url.includes('boards.greenhouse.io');
                const isSr = j.url.includes('smartrecruiters.com');

                if (!isGh && !isSr) return false;

                // 2. Exclusion Check
                if (isExcluded(j)) return false;

                // 3. Applied Check
                const u = normalizeUrl(j.url);
                return !appliedUrls.has(u);
            });

        console.log(`\n📊 Queue: ${queue.length} jobs (Greenhouse + SmartRecruiters).`);

        if (queue.length === 0) {
            console.log("No matching jobs found. Waiting 30s...");
            await new Promise(r => setTimeout(r, 30000));
            continue;
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

                // ID Platform
                const isGh = job.url.includes('greenhouse.io');
                const isSr = job.url.includes('smartrecruiters.com');

                // Auto-fill
                if (isGh) await fillGreenhouseForm(page);
                if (isSr) await fillSmartRecruitersForm(page);

                // Auto-Click (Heuristic)
                const AUTO_CLICK = true;
                if (AUTO_CLICK) {
                    const selectors = [
                        '#submit_app',
                        'button:has-text("Submit Application")',
                        'button:has-text("Apply")',
                        '#st-apply',                  // SmartRecruiters
                        'a:has-text("I\'m interested")' // SmartRecruiters often starts with this
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
                if (Date.now() - startTime >= JOB_TIMEOUT_MS) status = "TIMEOUT";

            } catch (e) {
                console.log(`   ❌ Error: ${e.message}`);
                err = e.message;
            }

            // Save
            console.log(`   📝 Saving Status: ${status}`);
            const entry = { url: job.url, status, timestamp: new Date().toISOString(), error: err };
            if (status === "APPLIED") {
                fs.appendFileSync(APPLIED_APPEND_FILE, JSON.stringify(entry) + '\n');
                appliedUrls.add(normalizeUrl(job.url));
            } else if (status === "SKIPPED_USER") {
                fs.appendFileSync(SKIPPED_JOBS_FILE, JSON.stringify(entry) + '\n');
                appliedUrls.add(normalizeUrl(job.url));
            } else if (status === "DELETED") {
                fs.appendFileSync(DELETED_JOBS_FILE, JSON.stringify(entry) + '\n');
                appliedUrls.add(normalizeUrl(job.url));
            } else {
                fs.appendFileSync(FAILED_FILE, JSON.stringify(entry) + '\n');
            }
        }
    }
})();
