const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const config = require('./config'); // User Configuration

// CONFIG
const JOBS_FILE = path.resolve('./job_links.json');
// const NEW_JOBS_FILE = path.join(__dirname, 'newjobs.json');
const NEW_JOBS_FILE = path.resolve('./priority_jobs_extracted.json'); // PRIORITY EXTRACTION SET
const APPLIED_FILE = 'applied.json';
const APPLIED_APPEND_FILE = path.resolve('./jobs_applied.json');
const FAILED_FILE = path.resolve('./failed_jobs.json');
const DELETED_JOBS_FILE = path.resolve('./deleted_jobs.json'); // New
const SKIPPED_JOBS_FILE = path.resolve('./skipped_jobs.json');
const IN_PROGRESS_FILE = 'in_progress_jobs.json';
const RECORDING_FILE = 'user_recording.jsonl';
// const USER_DATA_DIR = path.resolve('./user_data_nvidia_sequential');
const USER_DATA_DIR = path.resolve('./user_data_greenhouse_sequential');
const EXTENSION_PATH = path.resolve('./jobright-extension'); // Will be ignored if missing
const WAIT_TIME_MS = 250;
const ACTION_TIMEOUT_MS = 60 * 1000;
const JOB_TIMEOUT_MS = 90 * 1000; // 90s (Manual/Learning Pacing)
const OVERNIGHT_MODE = true; // Auto-Retry enabled
const STRICT_PASSIVE_MODE = true; // PASSIVE MODE (Clicks Disabled for User)
const LEARN_ONLY_MODE = true; // ACTION MODE (Attempts Disabled)
// ...
// DYNAMIC TIMEOUT: User requested 45s for all jobs
let currentJobTimeout = 45 * 1000;
console.log(`   ⏱️  Timeout set to: ${currentJobTimeout / 1000}s`);
const HIGH_THROUGHPUT_MODE = false; // Gentle/Manual Mode

// --- UTILS ---

async function fillAshbyForm(page) {
    const t = { timeout: 2000 };
    if (config.FULL_NAME) {
        // Name
        await page.locator('input[name="name"], input[id*="name"], input[aria-label*="Name"]').first().fill(config.FULL_NAME, t).catch(() => { });
    }
    if (config.EMAIL) {
        // Email
        await page.locator('input[name="email"], input[id*="email"], input[type="email"]').first().fill(config.EMAIL, t).catch(() => { });
    }
    if (config.PHONE) {
        // Phone
        await page.locator('input[name="phone"], input[id*="phone"], input[type="tel"]').first().fill(config.PHONE, t).catch(() => { });
    }
    if (config.LINKEDIN_URL) {
        // LinkedIn 
        await page.locator('input[name*="linkedin"], input[id*="linkedin"]').first().fill(config.LINKEDIN_URL, t).catch(() => { });
    }
    if (config.RESUME_PATH && fs.existsSync(config.RESUME_PATH)) {
        // Resume Upload
        const fileInput = page.locator('input[type="file"]');
        if (await fileInput.count() > 0) {
            await fileInput.setInputFiles(config.RESUME_PATH, t).catch(e => console.log("Resume upload failed:", e.message));
        }
    }
}

// UTILS
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
        if (config.RESUME_PATH) {
            const fileInput = page.locator('input[type="file"][data-source="attach"]');
            if (await fileInput.count() > 0) await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
        }
    } catch (e) { console.log("   (Greenhouse fill error: " + e.message + ")"); }
}

async function fillWorkdayForm(page) {
    console.log("   📝 Auto-Filling Workday Form...");
    const t = { timeout: 2000 };
    try {
        // Workday is complex. We try basic inputs if visible, but DO NOT BLOCK.
        if (config.EMAIL) await page.locator('input[data-automation-id="email"], input[type="email"]').first().fill(config.EMAIL, t).catch(() => { });
        if (config.FULL_NAME) {
            await page.locator('input[data-automation-id="legalNameSection_firstName"]').fill(config.FULL_NAME.split(' ')[0], t).catch(() => { });
            await page.locator('input[data-automation-id="legalNameSection_lastName"]').fill(config.FULL_NAME.split(' ').slice(1).join(' '), t).catch(() => { });
        }
    } catch (e) { }
}

async function fillSmartRecruitersForm(page) {
    console.log("   📝 Auto-Filling SmartRecruiters Form...");
    const t = { timeout: 2000 };
    try {
        // SmartRecruiters (Standard Single-Page or Multi-Step)
        // Auto-Fill Helper
        if (config.FULL_NAME) {
            await page.locator('#first-name-input').fill(config.FULL_NAME.split(' ')[0], t).catch(() => { });
            await page.locator('#last-name-input').fill(config.FULL_NAME.split(' ').slice(1).join(' '), t).catch(() => { });
        }
        if (config.EMAIL) await page.locator('#email-input').fill(config.EMAIL, t).catch(() => { });
        if (config.PHONE) await page.locator('#phone-number-input').fill(config.PHONE, t).catch(() => { });
        if (config.LINKEDIN_URL) await page.locator('#linkedin-input').fill(config.LINKEDIN_URL, t).catch(() => { });

        // Resume
        if (config.RESUME_PATH) {
            // SR often has a drop zone or hidden input
            const fileInput = page.locator('input[type="file"]');
            if (await fileInput.count() > 0) {
                await fileInput.setInputFiles(config.RESUME_PATH, t).catch(() => { });
            }
        }
    } catch (e) { console.log("   (SmartRecruiters fill error: " + e.message + ")"); }
}

// Helper for interruptible wait (Fast Skip)
async function waitForActionOrSkip(page, durationMs) {
    const steps = durationMs / 50; // Check every 50ms (High Performance)
    for (let i = 0; i < steps; i++) {
        // 1. Check Global Signals (Instant)
        if (global.SKIP_SIGNAL) return true;
        if (global.DELETE_SIGNAL) return true;
        if (global.SUCCESS_SIGNAL) return true;

        // 2. Check Browser Variable (Hybrid Fallback for reliability)
        try {
            const skip = await page.evaluate(() => window.jobRightSkip).catch(() => false);
            if (skip) {
                console.log("   (Fallback Skip Detected)");
                global.SKIP_SIGNAL = true;
                return true;
            }
            const del = await page.evaluate(() => window.jobRightDelete).catch(() => false);
            if (del) {
                console.log("   (Fallback Delete Detected)");
                global.DELETE_SIGNAL = true;
                return true;
            }
            const success = await page.evaluate(() => window.jobRightSuccess).catch(() => false);
            if (success) {
                console.log("   (Fallback Success Detected)");
                global.SUCCESS_SIGNAL = true;
                return true;
            }
        } catch (e) { }

        await page.waitForTimeout(50);
    }
    return false;
}

function cleanLocks() {
    console.log("🧹 Cleaning up session locks...");
    const locks = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    locks.forEach(lock => {
        const lockFile = path.join(USER_DATA_DIR, lock);
        if (fs.existsSync(lockFile)) {
            try {
                fs.unlinkSync(lockFile);
                console.log(`   Removed ${lock}.`);
            } catch (e) {
                console.error(`   Failed to remove ${lock}:`, e.message);
            }
        }
    });
}

function loadRecordings() {
    let recordings = [];
    try {
        if (fs.existsSync(RECORDING_FILE)) {
            const lines = fs.readFileSync(RECORDING_FILE, 'utf8').split('\n').filter(l => l.trim());
            recordings = lines.map(cols => {
                try { return JSON.parse(cols); } catch (e) { return null; }
            }).filter(r => r);
        }
    } catch (e) { console.error("Failed to load recordings:", e.message); }
    return recordings;
}

(async () => {
    console.log(">>> STARTING GREENHOUSE SEQUENTIAL RUNNER (AUTO) <<<");

    // 1. Clean Locks
    cleanLocks();

    // 1b. Terminal Controls (Robust Fallback)
    // 1b. Terminal Controls (Robust Fallback - Only if TTY)
    if (process.stdin.isTTY) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);

        process.stdin.on('keypress', (str, key) => {
            if (key.ctrl && key.name === 'c') {
                process.exit();
            }
            if (key.name === 's') {
                console.log("   🎹 TERMINAL INTERRUPTION: SKIP REQUESTED");
                global.SKIP_SIGNAL = true;
            }
            if (key.name === 'd') {
                console.log("   🎹 TERMINAL INTERRUPTION: DELETE REQUESTED");
                global.DELETE_SIGNAL = true;
            }
        });
        console.log("ℹ️  Terminal Controls Active: Press 's' to SKIP, 'd' to DELETE, 'Ctrl+C' to Stop.");
    } else {
        console.log("ℹ️  Background Mode: Terminal controls disabled (Use Browser Buttons or SIGTERM).");
    }

    // 3. Filter Applicated helpers and State (Must be defined before loop)
    let appliedUrls = new Set();
    const normalizeUrl = (u) => {
        u = (u || '').toLowerCase();
        if (u.includes('boards.greenhouse.io') && u.includes('token=')) {
            return u;
        }
        return u.split('?')[0].replace(/\/$/, '');
    };

    // Initial Load of Applied/Deleted/Skipped
    let deletedUrls = new Set(); // Explicit Deleted Set
    try {
        if (fs.existsSync(APPLIED_FILE)) {
            JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf8')).forEach(a => appliedUrls.add(normalizeUrl(a.url)));
        }
        if (fs.existsSync(APPLIED_APPEND_FILE)) {
            fs.readFileSync(APPLIED_APPEND_FILE, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
                try {
                    const entry = JSON.parse(l);
                    if (entry.status === 'APPLIED' || entry.status === 'ALREADY_APPLIED') {
                        appliedUrls.add(normalizeUrl(entry.url));
                    }
                } catch (e) { }
            });
        }
        if (fs.existsSync(DELETED_JOBS_FILE)) {
            try {
                const content = fs.readFileSync(DELETED_JOBS_FILE, 'utf8');
                content.split('\n').filter(l => l.trim()).forEach(l => {
                    try {
                        const dUrl = normalizeUrl(JSON.parse(l).url);
                        appliedUrls.add(dUrl);
                        deletedUrls.add(dUrl);
                    } catch (e) { }
                });
                try {
                    JSON.parse(content).forEach(d => {
                        const dUrl = normalizeUrl(d.url);
                        appliedUrls.add(dUrl);
                        deletedUrls.add(dUrl);
                    });
                } catch (e) { }
            } catch (e) { }
        }
        if (fs.existsSync(SKIPPED_JOBS_FILE)) {
            try {
                const content = fs.readFileSync(SKIPPED_JOBS_FILE, 'utf8');
                content.split('\n').filter(l => l.trim()).forEach(l => {
                    try { appliedUrls.add(normalizeUrl(JSON.parse(l).url)); } catch (e) { }
                });
                try { JSON.parse(content).forEach(d => appliedUrls.add(normalizeUrl(d.url))); } catch (e) { }
            } catch (e) { }
        }
    } catch (e) { }

    // 5. Extract Heuristics (Load once)
    const recordings = loadRecordings();
    const usefulSelectors = new Set();
    recordings.forEach(rec => {
        if (rec.type === 'click' && rec.selector && !rec.selector.includes('#ember') && !rec.selector.includes('jobright')) {
            usefulSelectors.add({ selector: rec.selector, text: rec.text });
        }
        if (rec.type === 'click' && rec.simpleSelector && rec.simpleSelector.startsWith('#') && !rec.simpleSelector.includes('#ember') && !rec.simpleSelector.includes('jobright')) {
            usefulSelectors.add({ selector: rec.simpleSelector, text: rec.text });
        }
        if (rec.type === 'input' && rec.selector && !rec.selector.includes('#ember')) {
            usefulSelectors.add({ selector: rec.selector, text: null });
        }
    });

    console.log(`Loaded ${usefulSelectors.size} useful selectors from recordings.`);

    // 6. Launch Browser
    console.log(`🚀 Launching Browser...`);
    console.log(`   Extension Path: ${EXTENSION_PATH}`);

    async function launchBrowser() {
        console.log("   🚀 Launching with Profile-Based Extension Loading (setup_extension.js config)...");
        const b = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: false, // User requested "one by one" (Manual Mode)
            channel: 'chrome', // Use System Chrome
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            args: [
                '--start-maximized',
                '--disable-blink-features=AutomationControlled'
            ],
            ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
            viewport: null
        });
        const p = await b.pages().length > 0 ? b.pages()[0] : await b.newPage();
        return { b, p };
    }

    let browser, page;
    try {
        ({ b: browser, p: page } = await launchBrowser());
    } catch (e) {
        console.error("❌ CRITICAL ERROR: Failed to launch browser:", e);
        process.exit(1);
    }


    // 6b. Setup Learning Mode & Controls
    // GLOBAL SIGNALS for instant reaction
    global.SKIP_SIGNAL = false;
    global.DELETE_SIGNAL = false;
    global.SUCCESS_SIGNAL = false;

    try {
        await page.exposeFunction('triggerSkip', () => {
            console.log("   ⚡ SKIP TRIGGERED (Instant)");
            global.SKIP_SIGNAL = true;
        });
        await page.exposeFunction('triggerDelete', () => {
            console.log("   ⚡ DELETE TRIGGERED (Instant)");
            global.DELETE_SIGNAL = true;
        });
        await page.exposeFunction('triggerSuccess', () => {
            console.log("   ⚡ SUCCESS TRIGGERED (Instant)");
            global.SUCCESS_SIGNAL = true;
        });
        await page.exposeFunction('saveInteraction', (data) => {
            fs.appendFileSync(RECORDING_FILE, JSON.stringify(data) + '\n');
            console.log(`   🔴 [REC] Captured: ${data.description}`);

            // Update UI if possible
            page.evaluate((desc) => {
                const el = document.getElementById('jobright-rec-status');
                if (el) { el.innerText = `Recorded: ${desc}`; el.style.opacity = '1'; setTimeout(() => el.style.opacity = '0.7', 1000); }
            }, data.description || "Action").catch(() => { });

            if (data.type === 'click' && data.selector && !data.selector.includes('#ember') && !data.selector.includes('jobright')) {
                usefulSelectors.add({ selector: data.selector, text: data.text });
            }
            if (data.type === 'click' && data.simpleSelector && data.simpleSelector.startsWith('#') && !data.simpleSelector.includes('#ember') && !data.simpleSelector.includes('jobright')) {
                usefulSelectors.add({ selector: data.simpleSelector, text: data.text });
            }
            if (data.type === 'input' && data.selector && !data.selector.includes('#ember')) {
                usefulSelectors.add({ selector: data.selector, text: null });
            }
        });
    } catch (e) { console.log("   (Bindings already exist)"); }

    // Inject Recording & Controls Scripts
    let injectionInterval = null;
    const INJECT_RECORDING_SCRIPT = async () => {
        await page.evaluate(() => {
            if (window.isRecordingActive) return;
            window.isRecordingActive = true;

            function getCssPath(el) {
                if (!(el instanceof Element)) return;
                const path = [];
                while (el.nodeType === Node.ELEMENT_NODE) {
                    let selector = el.nodeName.toLowerCase();
                    if (el.id) { selector += '#' + el.id; path.unshift(selector); break; }
                    else {
                        let sib = el, nth = 1;
                        while (sib = sib.previousElementSibling) {
                            if (sib.nodeName.toLowerCase() === selector) nth++;
                        }
                        if (nth !== 1) selector += ":nth-of-type(" + nth + ")";
                    }
                    path.unshift(selector);
                    el = el.parentNode;
                }
                return path.join(" > ");
            }

            ['click', 'change'].forEach(evt => {
                window.addEventListener(evt, (e) => {
                    if (!e.isTrusted) return;
                    if (window.isBotActive) return;

                    const target = e.target;
                    const selector = getCssPath(target);
                    const simple = target.id ? `#${target.id}` : target.className ? `.${target.className.split(' ')[0]}` : selector;

                    let val = "";
                    if (evt === 'change' || (evt === 'click' && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'))) {
                        val = target.value || "";
                    }

                    let text = "";
                    if (target.innerText && target.innerText.length < 50) text = target.innerText;

                    const data = {
                        timestamp: new Date().toISOString(),
                        type: evt === 'change' ? 'input' : 'click',
                        selector: selector,
                        simpleSelector: simple,
                        text: text,
                        value: val,
                        description: `${evt} on ${selector}`
                    };
                    window.saveInteraction(data);
                }, true);
            });

            // SCROLL & KEYDOWN (Feedback Only)
            let scrollTimer = null;
            window.addEventListener('scroll', () => {
                if (scrollTimer) return;
                scrollTimer = setTimeout(() => {
                    window.saveInteraction({ description: "Scrolling...", type: 'scroll' });
                    scrollTimer = null;
                }, 500);
            }, true);

            window.addEventListener('keydown', (e) => {
                if (e.repeat) return;
                // Don't record specific keys for privacy/spam, just the action
                window.saveInteraction({ description: "Typing...", type: 'keydown' });
            }, true);

            console.log("   🔴 Learning Mode Active: Listeners Injected.");
        });
    };

    const INJECT_CONTROLS_SCRIPT = async () => {
        await page.evaluate(() => {
            if (document.getElementById('jobright-controls')) return;
            const container = document.createElement('div');
            container.id = 'jobright-controls';
            container.style.position = 'fixed';
            container.style.bottom = '20px'; // Move to Bottom-Left to avoid Extension Overlay
            container.style.left = '20px';
            container.style.right = 'auto';
            container.style.top = 'auto';
            container.style.zIndex = '2147483647';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'flex-start'; // Align left
            container.style.gap = '10px';
            container.style.fontFamily = 'Arial, sans-serif';
            document.body.appendChild(container);

            const msgBox = document.createElement('div');
            msgBox.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
            msgBox.style.color = '#00ff00';
            msgBox.style.padding = '15px';
            msgBox.style.borderRadius = '8px';
            msgBox.style.border = '2px solid #00ff00';
            msgBox.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
            msgBox.style.textAlign = 'right';

            const title = document.createElement('div');
            title.innerText = '🟢 LEARNING ACTIVE';
            title.style.fontWeight = 'bold';
            title.style.fontSize = '18px';
            title.style.marginBottom = '8px';
            msgBox.appendChild(title);

            const shortcuts = [
                { key: 's', desc: 'Skip Job' },
                { key: 'd', desc: 'Delete Job' },
                { key: 'p', desc: 'In Progress' }
            ];

            const list = document.createElement('div');
            list.style.textAlign = 'left';
            list.style.fontSize = '14px';
            list.style.color = '#fff';

            shortcuts.forEach(item => {
                const line = document.createElement('div');
                line.innerHTML = `<span style="color:#ffff00;font-weight:bold">[${item.key}]</span> ${item.desc} (Terminal)`;
                line.style.marginBottom = '2px';
                list.appendChild(line);
            });
            msgBox.appendChild(list);

            // REC STATUS (Learning Indicator)
            const recStatus = document.createElement('div');
            recStatus.id = 'jobright-rec-status';
            recStatus.innerText = 'Listening for clicks...';
            recStatus.style.marginTop = '10px';
            recStatus.style.paddingTop = '10px';
            recStatus.style.borderTop = '1px solid #444';
            recStatus.style.color = '#00ffff';
            recStatus.style.fontSize = '12px';
            recStatus.style.fontStyle = 'italic';
            recStatus.style.opacity = '0.7';
            msgBox.appendChild(recStatus);

            container.appendChild(msgBox);

            // UI BUTTONS
            const btnBox = document.createElement('div');
            btnBox.style.display = 'flex';
            btnBox.style.gap = '10px';

            const createBtn = (text, color, onClick) => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.style.backgroundColor = color;
                btn.style.color = '#fff';
                btn.style.border = 'none';
                btn.style.padding = '10px 20px';
                btn.style.borderRadius = '5px';
                btn.style.cursor = 'pointer';
                btn.style.fontWeight = 'bold';
                btn.style.fontSize = '14px';
                btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
                btn.onclick = onClick;
                return btn;
            };

            const successBtn = createBtn('APPLIED ✅', '#2ecc71', async () => {
                console.log("SUCCESS CLICKED");
                window.jobRightSuccess = true;
                if (window.triggerSuccess) await window.triggerSuccess();
                successBtn.innerText = 'Applied!';
                successBtn.disabled = true;
            });

            const skipBtn = createBtn('SKIP ⏭️', '#f39c12', async () => {
                console.log("SKIP CLICKED");
                window.jobRightSkip = true;
                if (window.triggerSkip) await window.triggerSkip();
                skipBtn.innerText = 'Skipping...';
                skipBtn.disabled = true;
            });

            const delBtn = createBtn('DELETE 🗑️', '#c0392b', async () => {
                console.log("DELETE CLICKED");
                window.jobRightDelete = true;
                if (window.triggerDelete) await window.triggerDelete();
                delBtn.innerText = 'Deleting...';
                delBtn.disabled = true;
            });

            btnBox.appendChild(successBtn);
            btnBox.appendChild(skipBtn);
            btnBox.appendChild(delBtn);
            container.appendChild(btnBox);
        });
    };

    // Verify Login
    console.log("🔒 Verifying Login...");
    try {
        await page.goto('https://www.linkedin.com/', { waitUntil: 'domcontentloaded' });
        await new Promise(resolve => setTimeout(resolve, 3000));
        // ...
    } catch (e) { }    // Helper: Fisher-Yates Shuffle
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // 4. Dynamic Job Loading Function
    const reloadJobs = () => {
        let allJobs = [];
        const FAILED_APP_FILE = path.resolve('./failed-application.json');

        try {
            if (!fs.existsSync(JOBS_FILE)) {
                fs.writeFileSync(JOBS_FILE, JSON.stringify([]));
            }
        } catch (e) {
            console.error("Failed to load jobs:", e.message);
        }

        try {
            // USER REQUEST: Use newjobs.json
            if (fs.existsSync(NEW_JOBS_FILE)) {
                console.log("ℹ️  Loading jobs from newjobs.json (Priority Set)...");
                const rawData = fs.readFileSync(NEW_JOBS_FILE, 'utf8');
                try {
                    const priorityJobs = JSON.parse(rawData);
                    allJobs = allJobs.concat(priorityJobs);
                    console.log(`   ✅ Loaded ${priorityJobs.length} priority jobs.`);
                } catch (e) { console.log("   ⚠️ Failed to parse priority jobs."); }
            }

            console.log("ℹ️  Loading jobs from job_links.json (Scraper Output)...");
            if (fs.existsSync(JOBS_FILE)) {
                try {
                    const scrapedJobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
                    allJobs = allJobs.concat(scrapedJobs);
                    console.log(`   ✅ Loaded ${scrapedJobs.length} scraped jobs.`);
                } catch (e) {
                    console.log(`   ⚠️ Failed to parse job_links.json: ${e.message}`);
                }
            } else {
                console.log("⚠️ job_links.json not found. initializing...");
                fs.writeFileSync(JOBS_FILE, JSON.stringify([]));
            }
        } catch (e) {
            console.error("Failed to load jobs:", e.message);
            return [];
        }

        // 1. Gather RETRY candidates (Failed Jobs)
        // We want to retry ALL failed jobs from both logs
        let retryUrls = new Set();

        // Source A: failed_jobs.json
        try {
            if (fs.existsSync(FAILED_FILE)) {
                const content = fs.readFileSync(FAILED_FILE, 'utf8');
                // Try NDJSON first (common for logs)
                content.split('\n').filter(l => l.trim()).forEach(l => {
                    try {
                        const f = JSON.parse(l);
                        if (f.url && f.status === 'FAILED') retryUrls.add(normalizeUrl(f.url));
                    } catch (e) { }
                });
            }
        } catch (e) { console.log("Error reading FAILED_FILE:", e.message); }

        // Source B: failed-application.json
        try {
            if (fs.existsSync(FAILED_APP_FILE)) {
                const content = fs.readFileSync(FAILED_APP_FILE, 'utf8');
                content.split('\n').filter(l => l.trim()).forEach(l => {
                    try {
                        const f = JSON.parse(l);
                        if (f.url && f.status === 'FAILED') retryUrls.add(normalizeUrl(f.url));
                    } catch (e) { }
                });
            }
        } catch (e) { console.log("Error reading FAILED_APP_FILE:", e.message); }

        console.log(`ℹ️  Found ${retryUrls.size} unique FAILED jobs to potentially retry.`);

        // 2. Filter Applied vs Retry
        // If a job is in retryUrls, we MUST remove it from currentAppliedUrls so it passes the filter
        let currentAppliedUrls = new Set(appliedUrls);

        retryUrls.forEach(u => {
            if (!deletedUrls.has(u)) {
                currentAppliedUrls.delete(u); // un-mark as applied -> allow processing
            }
        });

        // 3. Process All Jobs
        let validJobs = allJobs.filter(j => j.url && typeof j.url === 'string');
        const seenUrls = new Set();

        validJobs = validJobs.filter(j => {
            const u = normalizeUrl(j.url);
            if (seenUrls.has(u)) return false;
            seenUrls.add(u);

            // Skip if Applied (and not in Retry list)
            if (currentAppliedUrls.has(u)) return false;

            // Skip Garbage
            if (j.url.startsWith('Applied') || j.url.includes('NoLink')) return false;

            // Skip Speechify (Explicit User Ban)
            const c = (j.company || '').toLowerCase();
            const t = (j.title || '').toLowerCase();
            const l = (j.location || '').toLowerCase(); // If location exists in JSON
            const uLower = u.toLowerCase();

            if (uLower.includes('speechify') || c.includes('speechify')) return false;

            // USER BLOCKED: Palo Alto
            if (uLower.includes('palo-alto') || uLower.includes('palo%20alto') ||
                t.includes('palo alto') || l.includes('palo alto') || c.includes('palo alto')) {
                return false;
            }

            return true;
        });

        // 4. TIERS: [Failed] -> [SR] -> [Workday] -> [GH] -> [Rest]
        const tier0 = []; // RETRY CANDIDATES (Failures)
        const tier1 = []; // SmartRecruiters
        const tier2 = []; // Workday
        const tier3 = []; // Greenhouse
        const tier4 = []; // Others

        for (const job of validJobs) {
            const u = normalizeUrl(job.url);
            const uLower = u.toLowerCase();

            // TIER 0: IS IT A RETRY?
            if (retryUrls.has(u)) {
                if (u.includes('greenhouse')) tier0.push(job);
                continue; // Don't add to other tiers
            }

            // Normal Tiers - GREENHOUSE ONLY
            if (uLower.includes('greenhouse')) {
                tier3.push(job);
            }
            // Ignore others
        }

        console.log(`\n📊 Queue Priorities (Greenhouse Only):`);
        console.log(`   🔴 Tier 0 (Greenhouse RETRY): ${tier0.length} jobs`);
        console.log(`   🟢 Tier 3 (Greenhouse NEW):   ${tier3.length} jobs`);

        // Greenhouse Only Queue
        const activeQueue = [...tier3, ...tier0];
        console.log(`   ----------------------------------------`);
        console.log(`   Σ  Total Greenhouse Queue: ${activeQueue.length}`);

        return activeQueue;
    };

    // 7. Jobs Variable
    let jobs = [];

    // 8. Main Continuous Loop
    while (true) {
        console.log("\n🔄 Reloading Jobs from file...");
        jobs = reloadJobs();
        console.log(`📊 Queue Update: ${jobs.length} jobs remaining to process.`);

        if (jobs.length === 0) {
            console.log("   😴 No new jobs found. Waiting 30s...");
            await new Promise(r => setTimeout(r, 30000));
            continue;
        }

        // Process current batch ONE BY ONE (Sequential)
        // We re-fetch the list after every job to ensure dynamic updates (optional but safer for "one a time")
        // But for efficiency, we can process this shuffled batch. The user asked for "one a time", which usually implies handling them sequentially.

        for (let i = 0; i < jobs.length; i++) {
            // Check if we need to reload (optional, but let's stick to batch processing for simplicity)
            const job = jobs[i];

            // Re-check if applied (in case of duplicates in file)
            // FIXED: Don't check appliedUrls here because it blocks RETRY jobs that are in the applied list but marked for retry by reloadJobs()
            // if (appliedUrls.has(normalizeUrl(job.url))) continue;


            console.log(`\n[${i + 1}/${jobs.length}] Processing: ${job.title} @ ${job.company}`);
            console.log(`URL: ${job.url}`);

            let jobStatus = "FAILED";
            let jobError = "";
            const startTime = Date.now();
            const clickedSignatureHistory = new Set();

            // DYNAMIC TIMEOUT: User requested 45s for all jobs
            let currentJobTimeout = 45 * 1000;
            console.log(`   ⏱️  Timeout set to: ${currentJobTimeout / 1000}s`);

            // Determing Mode for this Job
            // PASSIVE MODE REQUESTED: FORCE ENABLE
            // USER REQUEST: AUTONOMOUS LEARNING MODE
            let isPassiveMode = STRICT_PASSIVE_MODE; // Respect Global Config
            let isInteractive = true;

            if (isPassiveMode) {
                console.log("   🛡️  [PASSIVE MODE: ON] Manual Application Only. Auto-clicks disabled.");
            }
            console.log(`   ℹ️  Mode Analysis: Passive=${isPassiveMode}, Interactive=${isInteractive} (URL: ${job.url})`);

            // Reset Signals
            global.SKIP_SIGNAL = false;
            global.DELETE_SIGNAL = false;
            global.SUCCESS_SIGNAL = false;


            // Navigation
            try {
                if (!page) throw new Error("Page object is undefined in loop scope!");
                console.log(`   navigating to ${job.url}...`);
                await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await INJECT_CONTROLS_SCRIPT();
                await INJECT_RECORDING_SCRIPT();

                // PERSISTENT INJECTION (SPA Support)
                if (injectionInterval) clearInterval(injectionInterval);
                injectionInterval = setInterval(async () => {
                    try {
                        if (page && !page.isClosed()) {
                            await INJECT_CONTROLS_SCRIPT().catch(() => { });
                            // Re-inject recording too? Maybe safer to check
                        }
                    } catch (e) { }
                }, 1000);

                // RE-EVALUATE PASSIVE MODE AFTER NAVIGATION (Handle Redirects)
                const currentUrlLower = page.url().toLowerCase();
                if (!isPassiveMode) {
                    if (// currentUrlLower.includes('ashbyhq') || // ALLOWED
                        currentUrlLower.includes('myworkdayjobs') ||
                        // currentUrlLower.includes('greenhouse') || // ALLOWED
                        currentUrlLower.includes('lever') ||
                        currentUrlLower.includes('icims')) {

                        isPassiveMode = true;
                        isInteractive = true;
                        console.log("   🛡️  [PASSIVE MODE: ENABLED] Redirect to restricted platform detected!");
                        console.log("   🛡️  Safety Belt Engaged. Auto-clicking disabled.");
                    }
                }
            } catch (e) {
                console.log(`   ! Navigation Failed: ${e.message}`);
                jobStatus = "FAILED_NAV";
                continue;
            }

            try {
                let url = page.url(); // Changed from const to let to allow updates
                const bodyText = await page.innerText('body').catch(() => "");

                const isSuccess =
                    url.includes('expected_success_url_fragment') ||
                    bodyText.includes("Application sent") ||
                    bodyText.includes("Great! We sent your application") ||
                    bodyText.includes("Application Submitted") ||
                    (url.includes('linkedin.com') && bodyText.includes("Your application was sent to"));

                if (isSuccess && !isPassiveMode) {
                    // In Strict Passive Mode, we IGNORE auto-success. Must be manual.
                    jobStatus = "APPLIED";
                    break;
                } else if (isSuccess && isPassiveMode) {
                    console.log("   (Passive Mode: Ignoring 'Success' text. Waiting for manual APPLIED signal...)");
                }

                if (!isPassiveMode) {
                    // ... other checks ...
                    if (bodyText.includes("You applied on") || bodyText.includes("Application received")) {
                        jobStatus = "ALREADY_APPLIED";
                        break;
                    }

                    if (bodyText.includes("No longer accepting applications") ||
                        bodyText.includes("This job has been closed") ||
                        bodyText.includes("no longer active")) {
                        console.log("   ⛔ Job Closed (Text detected).");
                        jobStatus = "JOB_CLOSED";
                        break;
                    }
                }

                // Interaction Logic
                let actionCount = 0;
                const maxActions = 15;

                while (Date.now() - startTime < JOB_TIMEOUT_MS && actionCount < maxActions) {
                    // EXPLICIT LOGGING FOR PASSIVE MODE
                    if (isPassiveMode && (Date.now() - startTime) % 5000 < 200) { // Log every ~5s
                        // console.log("   (Passive Mode: Waiting for user input... No auto-clicks)");
                    }

                    let bestCandidate = null;
                    let candidateSource = "";

                    // PURE LEARNING MODE: Bypass automated clicking (Exceptions below)
                    // STRICT PASSIVE MODE: ABSOLUTELY NO CLICKING for SENSITIVE SITES
                    if (!isPassiveMode) {
                        if (LEARN_ONLY_MODE && job.url.includes('myworkdayjobs')) {
                            const wdStart = page.locator('button:has-text("Apply"), a:has-text("Apply")').first();
                            try {
                                if (await wdStart.isVisible()) {
                                    console.log("   ⚡ WORKDAY AUTO-START: Clicking 'Apply'...");
                                    await wdStart.click();
                                    await page.waitForLoadState('networkidle').catch(() => { });
                                }
                            } catch (e) { }
                        }

                        if (LEARN_ONLY_MODE) {
                            // Do nothing else. Use loop for passive recording only.
                            // AUTO-FILL HELPERS (Non-Destructive)
                            if (job.url.includes('greenhouse')) await fillGreenhouseForm(page);
                            if (job.url.includes('myworkdayjobs')) await fillWorkdayForm(page);
                            // isPassiveMode already skipped above, but strictly:
                            if (job.url.includes('ashbyhq') && !isPassiveMode) await fillAshbyForm(page);
                        }

                        // HIGH PRIORITY: ASHBY NATIVE HEURISTICS (User Request)
                        // BLOCKED IN LEARNING MODE TO ALLOW MANUAL APPLY
                        if (!bestCandidate && !LEARN_ONLY_MODE && !isPassiveMode && page.url().includes('ashbyhq')) {
                            // NATIVE FORM FILLING (Replaces Extension)
                            await fillAshbyForm(page);
                            const ashbySelectors = [
                                'button:has-text("Start Application")',
                                'button:has-text("Submit Application")',
                                'button:has-text("Submit")',
                                'button:has-text("Next")',
                                '.ashby-application-form-submit-button',
                                'button[type="submit"]'
                            ];
                            for (const sel of ashbySelectors) {
                                try {
                                    const el = page.locator(sel).first();
                                    if (await el.isVisible() && await el.isEnabled()) {
                                        bestCandidate = el;
                                        candidateSource = `Ashby Heuristic: ${sel}`;
                                        break;
                                    }
                                } catch (e) { }

                                // CRITICAL: Check signals during heuristic search
                                const skipSignal = await page.evaluate(() => window.jobRightSkip).catch(() => false);
                                const deleteSignal = await page.evaluate(() => window.jobRightDelete).catch(() => false);
                                const successSignal = await page.evaluate(() => window.jobRightSuccess).catch(() => false);
                                if (skipSignal) { bestCandidate = null; jobStatus = "SKIPPED_USER"; break; }
                                if (deleteSignal) { bestCandidate = null; jobStatus = "DELETED"; break; }
                                if (successSignal) { bestCandidate = null; jobStatus = "APPLIED"; break; }
                            }
                        }

                        // HIGH PRIORITY: GREENHOUSE HEURISTICS
                        // HIGH PRIORITY: GREENHOUSE HEURISTICS
                        if (!bestCandidate && !LEARN_ONLY_MODE && !isPassiveMode && page.url().includes('greenhouse')) {
                            await fillGreenhouseForm(page);
                            const ghSelectors = [
                                '#submit_app',
                                'button:has-text("Submit Application")',
                                'input[value="Submit Application"]',
                                'button:has-text("Apply")',
                                '#submit_button',
                                'button[type="submit"]'
                            ];
                            for (const sel of ghSelectors) {
                                try {
                                    const el = page.locator(sel).first();
                                    if (await el.isVisible() && await el.isEnabled()) {
                                        bestCandidate = el;
                                        candidateSource = `Greenhouse Heuristic: ${sel}`;
                                        break;
                                    }
                                } catch (e) { }
                            }
                        }

                        // HIGH PRIORITY: WORKDAY HEURISTICS
                        if (!bestCandidate && !LEARN_ONLY_MODE && !isPassiveMode && page.url().includes('myworkdayjobs')) {
                            await fillWorkdayForm(page);
                            const wdSelectors = [
                                '[data-automation-id="bottom-navigation-next-button"]',
                                '[data-automation-id="click_filter"]',
                                'button:has-text("Submit")',
                                'button:has-text("Apply")',
                                'button:has-text("Next")'
                            ];
                            for (const sel of wdSelectors) {
                                try {
                                    const el = page.locator(sel).first();
                                    if (await el.isVisible() && await el.isEnabled()) {
                                        bestCandidate = el;
                                        candidateSource = `Workday Heuristic: ${sel}`;
                                        break;
                                    }
                                } catch (e) { }
                            }
                        }

                        // HIGH PRIORITY: SMARTRECRUITERS HEURISTICS
                        if (!bestCandidate && !LEARN_ONLY_MODE && !isPassiveMode && page.url().includes('smartrecruiters')) {
                            await fillSmartRecruitersForm(page);
                            const srSelectors = [
                                'button:has-text("Next")',
                                'button:has-text("Submit")',
                                'button:has-text("I\'m interested")',
                                'st-button[data-test="footer-apply-button"] > button', // Modern SR
                                '#st-apply'
                            ];
                            for (const sel of srSelectors) {
                                try {
                                    const el = page.locator(sel).first();
                                    if (await el.isVisible() && await el.isEnabled()) {
                                        bestCandidate = el;
                                        candidateSource = `SmartRecruiters Heuristic: ${sel}`;
                                        break;
                                    }
                                } catch (e) { }
                            }
                        }

                        // Allow early exit after loop if status changed
                        if (jobStatus === "SKIPPED_USER" || jobStatus === "DELETED" || jobStatus === "APPLIED") break;

                        if (!bestCandidate) {
                            // A. Recorded Selectors
                            for (const selObj of usefulSelectors) {
                                const sel = selObj.selector;
                                const expectedText = selObj.text;
                                const lowerSel = sel.toLowerCase();
                                if (['svg', 'path', 'body', 'html', 'div', 'span', 'p', 'form', 'label', 'section', 'header', 'footer'].includes(lowerSel)) continue;
                                if (lowerSel.includes('react-aria')) continue;

                                try {
                                    const el = page.locator(sel).first();
                                    if (await el.isVisible() && await el.isEnabled()) {
                                        let txt = "";
                                        try { txt = (await el.innerText()).trim().substring(0, 50); }
                                        catch (e) { txt = await el.evaluate(el => el.tagName); }

                                        if (expectedText && txt) {
                                            const nExp = expectedText.trim().toLowerCase().substring(0, 20);
                                            const nCur = txt.trim().toLowerCase();
                                            if (!nCur.includes(nExp) && !nExp.includes(nCur)) continue;
                                        }

                                        const tag = await el.evaluate(e => e.tagName);
                                        // STRICT PASSIVE FIX: Do NOT click text inputs
                                        if (STRICT_PASSIVE_MODE && tag === 'INPUT') {
                                            const type = (await el.getAttribute('type') || '').toLowerCase();
                                            const allowedTypes = ['checkbox', 'radio', 'submit', 'button', 'image', 'file'];
                                            if (!allowedTypes.includes(type)) continue;
                                        }

                                        const sig = `${tag}:${txt}`;
                                        if (clickedSignatureHistory.has(sig) && actionCount > 2) continue;

                                        bestCandidate = el;
                                        candidateSource = `Recorded Selector: ${sel}`;
                                        break;
                                    }
                                } catch (e) { }
                            }
                        }

                        if (!bestCandidate && !LEARN_ONLY_MODE && !isInteractive) {
                            const workdaySelectors = [
                                '[data-automation-id="bottom-navigation-next-button"]',
                                '[data-automation-id="click_filter"]',
                                'button[data-automation-id*="next"]',
                                'button[data-automation-id*="submit"]',
                                'button[data-automation-id*="apply"]'
                            ];

                            for (const sel of workdaySelectors) {
                                try {
                                    const els = await page.locator(sel).all();
                                    for (const el of els) {
                                        if (await el.isVisible() && await el.isEnabled()) {
                                            bestCandidate = el;
                                            candidateSource = `Workday Heuristic: ${sel}`;
                                            break;
                                        }
                                    }
                                } catch (e) { }
                                if (bestCandidate) break;
                            }
                        }

                        // (Ashby moved to top)

                        // Text Heuristics Omitted for brevity/strictness (can re-add if needed, but not in Learn Only Mode)

                        // --- AGGRESSIVE FALLBACK (HIGH THROUGHPUT) ---
                        if (!bestCandidate && HIGH_THROUGHPUT_MODE && !isPassiveMode) {
                            const genericSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Submit")', 'button:has-text("Apply")', 'button:has-text("Start Application")'];
                            for (const sel of genericSelectors) {
                                try {
                                    const el = page.locator(sel).first();
                                    if (await el.isVisible() && await el.isEnabled()) {
                                        bestCandidate = el;
                                        candidateSource = `Aggressive Fallback: ${sel}`;
                                        break;
                                    }
                                } catch (e) { }
                            }
                        }

                        if (!bestCandidate && HIGH_THROUGHPUT_MODE && !isInteractive) {
                            console.log("   ⏩ High Throughput Mode: No button found immediately. Skipping to next job.");
                            jobStatus = "SKIPPED_AUTO";
                            break;
                        }

                    } // END if (!isPassiveMode)

                    if (bestCandidate) {
                        let txt = "";
                        try {
                            txt = (await bestCandidate.innerText()).trim().substring(0, 50);
                        } catch (e) {
                            txt = await bestCandidate.evaluate(el => el.tagName);
                        }

                        if (txt.includes("Premium") || txt.includes("See jobs where you")) {
                            bestCandidate = null;
                            continue;
                        }

                        const tag = await bestCandidate.evaluate(e => e.tagName);
                        const sig = `${tag}:${txt}`;

                        console.log(`   > Clicking [${candidateSource}] Text: "${txt}"`);
                        try {
                            // SAFETY BELT: Strict Passive Mode Guard
                            if (isPassiveMode) {
                                console.log("   🛑 PASSIVE MODE SAFETY BELT: CLICK BLOCKED. (Auto-click prevented)");
                                bestCandidate = null;
                                continue; // Skip the click
                            }

                            await page.evaluate(() => window.isBotActive = true).catch(() => { });

                            // DISMISS MASKS: Click body to close dropdowns before clicking button
                            await page.locator('body').click({ position: { x: 0, y: 0 }, force: true }).catch(() => { });

                            // Attempt Click with FORCE to bypass overlays (e.g. select2-drop-mask)
                            await bestCandidate.click({ timeout: 5000, force: true });
                            clickedSignatureHistory.add(sig);
                            actionCount++;

                            if (global.SKIP_SIGNAL) { jobStatus = "SKIPPED_USER"; break; }
                            if (global.DELETE_SIGNAL) { jobStatus = "DELETED"; break; }
                            if (global.SUCCESS_SIGNAL) { jobStatus = "APPLIED"; break; }

                            const startUrl = page.url();
                            // Minimal stability wait
                            try { await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => { }); } catch (e) { }
                            if (page.url() !== startUrl) {
                                console.log(`   » Navigation detected`);
                                clickedSignatureHistory.clear();
                            }

                        } catch (e) {
                            console.log("   ! Click failed:", e.message);
                            try {
                                await bestCandidate.click({ force: true, timeout: 5000 });
                                actionCount++;
                            } catch (e2) { }
                        } finally {
                            await page.evaluate(() => window.isBotActive = false).catch(() => { });
                        }

                    } else {
                        if (Date.now() - startTime < currentJobTimeout) {
                            // NAVIGATION CHECK (User moved to Thank You page?)
                            // NAVIGATION CHECK (User Submitted or Multi-Step?)
                            if (page.url() !== url) {
                                const newBody = await page.innerText('body').catch(() => "");
                                const successKeywords = ["Application sent", "Great! We sent", "Application Submitted", "Thank you", "received your application"];
                                if (successKeywords.some(kw => newBody.includes(kw))) {
                                    if (!isPassiveMode) {
                                        jobStatus = "APPLIED";
                                        break;
                                    }
                                }
                                url = page.url(); // Update for next check
                            }

                            // Check Global Signals (Wait Loop)
                            const skipNow = await waitForActionOrSkip(page, 1000); // 1s wait blocks
                            if (skipNow) {
                                if (global.SKIP_SIGNAL) { jobStatus = "SKIPPED_USER"; break; }
                                if (global.DELETE_SIGNAL) { jobStatus = "DELETED"; break; }
                                if (global.SUCCESS_SIGNAL) { jobStatus = "APPLIED"; break; }
                            }
                        } else {
                            console.log("   ⏳ Timeout reached. Assuming APPLIED (User Request).");
                            jobStatus = "APPLIED"; // Treat timeout as success to avoid replay
                            break;
                        }
                    }
                }
            } catch (e) {
                console.log(`   ! Processing Error: ${e.message}`);
                jobError = e.message;
            }

            // Save Status
            try {
                if (jobStatus === "APPLIED") {
                    fs.appendFileSync(APPLIED_APPEND_FILE, JSON.stringify({ url: job.url, status: "APPLIED", timestamp: new Date().toISOString() }) + '\n');
                    appliedUrls.add(normalizeUrl(job.url));
                    console.log(`   ✅ Status: APPLIED`);
                } else if (jobStatus === "SKIPPED_USER") {
                    fs.appendFileSync(SKIPPED_JOBS_FILE, JSON.stringify({ url: job.url, status: "SKIPPED_USER", timestamp: new Date().toISOString() }) + '\n');
                    console.log(`   ⏭️  Status: SKIPPED (User)`);
                } else if (jobStatus === "DELETED") {
                    fs.appendFileSync(DELETED_JOBS_FILE, JSON.stringify({ url: job.url, status: "DELETED", timestamp: new Date().toISOString() }) + '\n');
                    console.log(`   🗑️  Status: DELETED`);

                    // PHYSICAL DELETION from job_links.json
                    try {
                        // 1. Delete from job_links.json
                        if (fs.existsSync(JOBS_FILE)) {
                            const currentLinks = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
                            const newLinks = currentLinks.filter(j => normalizeUrl(j.url) !== normalizeUrl(job.url));
                            fs.writeFileSync(JOBS_FILE, JSON.stringify(newLinks, null, 2));
                            console.log(`      -> Physically removed from ${JOBS_FILE}`);
                        }

                        // 2. Delete from NEW_JOBS_FILE (priority_jobs_extracted.json) - CRITICAL FOR LOOP FIX
                        if (fs.existsSync(NEW_JOBS_FILE)) {
                            const currentNewLinks = JSON.parse(fs.readFileSync(NEW_JOBS_FILE, 'utf8'));
                            const newNewLinks = currentNewLinks.filter(j => normalizeUrl(j.url) !== normalizeUrl(job.url));
                            fs.writeFileSync(NEW_JOBS_FILE, JSON.stringify(newNewLinks, null, 2));
                            console.log(`      -> Physically removed from ${NEW_JOBS_FILE}`);
                        }
                    } catch (err) {
                        console.error(`      ! Failed to delete from file:`, err.message);
                    }
                } else if (jobStatus === "JOB_CLOSED" || jobStatus === "JOB_CLOSED_REDIRECT") {
                    fs.appendFileSync(FAILED_FILE, JSON.stringify({ url: job.url, status: jobStatus, error: jobError, timestamp: new Date().toISOString() }) + '\n');
                    console.log(`   ⛔ Status: ${jobStatus}`);
                } else {
                    fs.appendFileSync(FAILED_FILE, JSON.stringify({ url: job.url, status: jobStatus, error: jobError, timestamp: new Date().toISOString() }) + '\n');
                    console.log(`   ❌ Status: ${jobStatus} (${jobError})`);
                }
            } catch (e) {
                console.error("   ! Failed to save status:", e.message);
            }
        }
    }
})();
