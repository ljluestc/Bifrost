const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const config = require('./config');

// CONFIG
const JOBS_FILE = path.join(__dirname, 'priority_jobs_extracted.json');
const NEW_JOBS_FILE = path.join(__dirname, 'newjobs.json');
const SCRAPER_FILE = path.join(__dirname, 'job_links.json'); // Added source
const APPLIED_FILE = 'jobs_applied.json'; // Changed source
const APPLIED_APPEND_FILE = 'jobs_applied.json'; // Changed target
const FAILED_FILE = 'failed-application.json';
const DELETED_JOBS_FILE = 'deleted_jobs.json';
const SKIPPED_JOBS_FILE = 'skipped_jobs.json';

// USAGE: Use the established Greenhouse profile to ensure extensions (AdBlock, etc.) are loaded
// This profile is distinct from the main system profile, so it won't affect other open browsers.
const USER_DATA_DIR = path.resolve('./user_data_greenhouse_sequential');

const JOB_TIMEOUT_MS = 45 * 1000; // 45 seconds per job

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

async function fillLeverForm(page) {
    console.log("   📝 Auto-Filling Lever Form...");
    const t = { timeout: 2000 };
    try {
        if (config.FULL_NAME) {
            await page.locator('input[name="name"]').fill(config.FULL_NAME, t).catch(() => { });
        }
        if (config.EMAIL) await page.locator('input[name="email"]').fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('input[name="phone"]').fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator('input[name="urls[LinkedIn]"]').fill(config.LINKEDIN_URL, t).catch(() => { });

        // Resume
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"]');
            if (await fileInput.count() > 0) await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
        }
    } catch (e) { console.log("   (Lever fill error: " + e.message + ")"); }
}

async function fillAshbyForm(page) {
    console.log("   📝 Auto-Filling Ashby Form...");
    const t = { timeout: 2000 };
    try {
        if (config.FULL_NAME) {
            await page.locator('input[name="name"], input[id*="name"], input[aria-label*="Name"]').first().fill(config.FULL_NAME, t).catch(() => { });
        }
        if (config.EMAIL) {
            await page.locator('input[name="email"], input[id*="email"], input[type="email"]').first().fill(config.EMAIL, t).catch(() => { });
        }
        if (config.PHONE) {
            await page.locator('input[name="phone"], input[id*="phone"], input[type="tel"]').first().fill(config.PHONE, t).catch(() => { });
        }
        if (config.LINKEDIN_URL) {
            await page.locator('input[name*="linkedin"], input[id*="linkedin"]').first().fill(config.LINKEDIN_URL, t).catch(() => { });
        }
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('input[type="file"]');
            if (await fileInput.count() > 0) {
                await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
            }
        }
    } catch (e) { console.log("   (Ashby fill error: " + e.message + ")"); }
}

async function fillSmartRecruitersForm(page) {
    console.log("   📝 Auto-Filling SmartRecruiters Form...");
    const t = { timeout: 2000 };
    try {
        if (config.FULL_NAME) {
            await page.locator('#first-name').fill(config.FULL_NAME.split(' ')[0], t).catch(() => { });
            await page.locator('#last-name').fill(config.FULL_NAME.split(' ').slice(1).join(' '), t).catch(() => { });
        }
        if (config.EMAIL) await page.locator('#email').fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('#phone-number').fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator('#linkedin-url').fill(config.LINKEDIN_URL, t).catch(() => { });

        // Resume
        if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
            const fileInput = page.locator('.file-upload-input'); // SmartRecruiters specific class often used, or generic
            if (await fileInput.count() > 0) {
                await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
            } else {
                const genericInput = page.locator('input[type="file"]');
                if (await genericInput.count() > 0) await genericInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
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

    if (u.includes('speechify')) return true;
    if (u.includes('paloaltonetworks') || u.includes('palo-alto') || u.includes('palo%20alto')) return true;
    if (c.includes('palo alto') || c.includes('paloalto')) return true;
    if (t.includes('palo alto')) return true;

    return false;
};

(async () => {
    console.log(">>> STARTING COMBINED RUNNER (Greenhouse + Lever + Ashby) <<<");

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

    // Browser Startup
    console.log(`🚀 Launching Browser in: ${USER_DATA_DIR}`);
    const b = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        channel: 'chrome',
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ],
        // IMPORTANT: By NOT including '--disable-extensions', we allow persistent extensions to load.
        // If specific extension loading is needed (e.g. unpacking), use '--load-extension=path' in args.
        ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
        viewport: null
    });

    const page = b.pages().length > 0 ? b.pages()[0] : await b.newPage();

    // Controls Injection (Persistent & Self-Healing)
    const CONTROLS_SCRIPT = `
        window.ensureJobRightControls = () => {
             if (document.getElementById('jobright-controls')) return;
            
            const container = document.createElement('div');
            container.id = 'jobright-controls';
            container.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:2147483647;background:rgba(0,0,0,0.9);padding:15px;border-radius:8px;border:2px solid #00ff00;color:white;font-family:Arial;box-shadow:0 4px 15px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:10px;';

            const title = document.createElement('div');
            title.innerHTML = '<b>🟢 COMBINED RUNNER</b><br><small>GH + Lever</small>';
            title.style.marginBottom = '5px';
            container.appendChild(title);

            const btnBox = document.createElement('div');
            btnBox.style.cssText = 'display:flex;gap:10px;';

            const createBtn = (text, color, setter) => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.style.cssText = 'background:' + color + ';color:white;border:none;padding:10px 15px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:14px;transition:transform 0.1s;';
                btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
                btn.onmouseout = () => btn.style.transform = 'scale(1)';
                btn.onclick = () => { 
                    window[setter] = true; 
                    btn.innerText = "Processing..."; 
                    btn.disabled = true; 
                    btn.style.opacity = '0.7';
                };
                return btn;
            };

            btnBox.appendChild(createBtn('✅ APPLIED', '#2ecc71', 'jobRightSuccess'));
            btnBox.appendChild(createBtn('⏭️ SKIP', '#f39c12', 'jobRightSkip'));
            btnBox.appendChild(createBtn('🗑️ DELETE', '#c0392b', 'jobRightDelete'));
            container.appendChild(btnBox);
            document.documentElement.appendChild(container); // Append to documentElement (HTML) to avoid Body wipes
        };
        
        // Run immediately
        window.ensureJobRightControls();
        
        // Run periodically to survive SPA changes
        if (!window.jobRightControlsInterval) {
            window.jobRightControlsInterval = setInterval(window.ensureJobRightControls, 1000);
        }
    `;
    await b.addInitScript(CONTROLS_SCRIPT);
    await page.evaluate(CONTROLS_SCRIPT);

    while (true) {
        let allJobs = [];
        try {
            // Load base jobs
            if (fs.existsSync(JOBS_FILE)) {
                try { allJobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')); } catch (e) { }
            }

            // Load newjobs.json (ROBUST PARSING)
            if (fs.existsSync(NEW_JOBS_FILE)) {
                console.log("ℹ️  Loading jobs from newjobs.json...");
                const rawData = fs.readFileSync(NEW_JOBS_FILE, 'utf8').trim();
                let newJobs = [];
                let parsed = false;

                try {
                    newJobs = JSON.parse(rawData);
                    parsed = true;
                } catch (e1) {
                    // Strategy 1: Missing closing bracket
                    if (rawData.startsWith('[') && !rawData.endsWith(']')) {
                        try {
                            newJobs = JSON.parse(rawData + ']');
                            parsed = true;
                            console.log("   🔧 Fixed missing closing bracket.");
                        } catch (e) { }
                    }

                    // Strategy 2: Concatenated Arrays [...][...]
                    if (!parsed && rawData.includes('][')) {
                        try {
                            newJobs = JSON.parse(rawData.replace(/\]\s*\[/g, ','));
                            parsed = true;
                            console.log("   🔧 Fixed concatenated arrays.");
                        } catch (e) { }
                    }

                    // Strategy 3: Concatenated Objects {}{}{}
                    if (!parsed && rawData.includes('}{')) {
                        try {
                            const fixed = rawData.replace(/}\s*{/g, '},{');
                            newJobs = JSON.parse(`[${fixed}]`);
                            parsed = true;
                            console.log("   🔧 Fixed concatenated objects.");
                        } catch (e) { }
                    }

                    // Strategy 4: NDJSON
                    if (!parsed) {
                        newJobs = rawData.split('\n').map(l => {
                            try { return JSON.parse(l); } catch (e) { return null; }
                        }).filter(j => j);
                        if (newJobs.length > 250) {
                            parsed = true;
                            console.log(`   🔧 Parsed ${newJobs.length} lines as NDJSON.`);
                        }
                    }

                    // Strategy 5: Robust Array Repair (The Hammer)
                    if (!parsed || newJobs.length < 10) {
                        try {
                            console.log("   🔨 Trying Strategy 5: Robust Array Repair...");
                            let soup = rawData.trim();
                            if (soup.startsWith('[')) soup = soup.substring(1);
                            if (soup.endsWith(']')) soup = soup.slice(0, -1);
                            const fixed = soup.replace(/}\s*[\]\[\s,]*{/g, '},{');
                            newJobs = JSON.parse(`[${fixed}]`);
                            parsed = true;
                            console.log(`   ✅ Strategy 5 (Robust Repair) SUCCESS. Found ${newJobs.length} jobs.`);
                        } catch (e) { }
                    }
                }

                if (parsed) {
                    allJobs = allJobs.concat(newJobs);
                    console.log(`   ✅ Added ${newJobs.length} jobs from newjobs.json`);
                } else {
                    console.log("   ⚠️ Failed to parse newjobs.json (All strategies failed).");
                }

                // Load job_links.json (Output from Scraper)
                if (fs.existsSync(SCRAPER_FILE)) {
                    try {
                        const scraperJobs = JSON.parse(fs.readFileSync(SCRAPER_FILE, 'utf8'));
                        if (Array.isArray(scraperJobs)) {
                            allJobs = allJobs.concat(scraperJobs);
                            console.log(`   ✅ Added ${scraperJobs.length} jobs from job_links.json`);
                        }
                    } catch (e) {
                        console.log(`   ⚠️ Failed to parse job_links.json: ${e.message}`);
                    }
                }
            }

            if (allJobs.length === 0) {
                console.log("No jobs file found. Retrying in 5s...");
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
        } catch (e) { await new Promise(r => setTimeout(r, 5000)); continue; }

        let queue = allJobs.filter(j => {
            if (!j.url) return false;
            const u = j.url.toLowerCase();
            const isGh = u.includes('greenhouse.io');
            const isLever = u.includes('lever.co');
            const isAshby = u.includes('ashbyhq');
            const isSr = u.includes('smartrecruiters.com');
            if (!isGh && !isLever && !isAshby && !isSr) return false;
            if (isExcluded(j)) return false;
            return !appliedUrls.has(normalizeUrl(j.url));
        });

        // PRIORITIZATION: Ashby > Greenhouse > SmartRecruiters > Lever > Others
        queue.sort((a, b) => {
            const getScore = (j) => {
                const u = (j.url || '').toLowerCase();
                if (u.includes('ashbyhq')) return 3;
                if (u.includes('greenhouse')) return 2;
                if (u.includes('smartrecruiters')) return 2; // Treat same as Greenhouse
                if (u.includes('lever')) return 1;
                return 0;
            };
            return getScore(b) - getScore(a); // High score first
        });

        console.log(`\n📊 Queue: ${queue.length} jobs (Ashby + Greenhouse + SmartRecruiters + Lever).`);

        if (queue.length === 0) {
            console.log("No matching jobs found. Waiting 30s...");
            await new Promise(r => setTimeout(r, 30000));
            continue;
        }

        for (const job of queue) {
            if (appliedUrls.has(normalizeUrl(job.url))) continue;

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
                await page.evaluate(CONTROLS_SCRIPT);

                const isGh = job.url.includes('greenhouse.io');
                const isLever = job.url.includes('lever.co');
                const isAshby = job.url.includes('ashbyhq');
                const isSr = job.url.includes('smartrecruiters.com');

                if (isGh) await fillGreenhouseForm(page);
                if (isLever) await fillLeverForm(page);
                if (isAshby) await fillAshbyForm(page);
                if (isSr) await fillSmartRecruitersForm(page);

                // Auto-Click Helper (Cookie banners / Proceed)
                page.evaluate(() => {
                    setInterval(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        for (const btn of buttons) {
                            const txt = btn.innerText.toLowerCase();
                            if ((txt.includes('accept') || txt.includes('proceed') || txt.includes('continue')) && !btn.disabled) {
                                if (!txt.includes('submit')) btn.click();
                            }
                        }
                    }, 2000);
                }).catch(() => { });

                const startTime = Date.now();
                while (Date.now() - startTime < JOB_TIMEOUT_MS) {
                    const body = await page.innerText('body').catch(() => "");
                    if (body.includes("Application sent") || body.includes("Application Submitted") || body.includes("APPLICATION SUBMITTED")) {
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
                    console.log("   ⏳ Timeout reached. Assuming APPLIED (User Request).");
                    status = "APPLIED";
                }

            } catch (e) {
                console.log(`   ❌ Error: ${e.message}`);
                err = e.message;
            }

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
                if (status === "TIMEOUT") {
                    // Handled above, but safeguard
                    fs.appendFileSync(APPLIED_APPEND_FILE, JSON.stringify(entry) + '\n');
                    appliedUrls.add(normalizeUrl(job.url));
                } else {
                    fs.appendFileSync(FAILED_FILE, JSON.stringify(entry) + '\n');
                }
            }
        }
    }
})();
