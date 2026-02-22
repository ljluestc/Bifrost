const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// === CONFIG ===
const OUTPUT_FILE = path.resolve(__dirname, 'job_links.json');
const APPLIED_FILE = path.resolve(__dirname, 'jobs_applied.json');
const FAILED_FILE = path.resolve(__dirname, 'failed_jobs.json');
const DELETED_FILE = path.resolve(__dirname, 'deleted_jobs.json');
const SKIPPED_FILE = path.resolve(__dirname, 'skipped_jobs.json');

// === TOP 50 TECH COMPANIES — ATS BOARD SLUGS ===
const GREENHOUSE_COMPANIES = [
    // FAANG-adjacent & Big Tech
    'airbnb', 'stripe', 'cloudflare', 'twitch', 'notion', 'figma',
    'databricks', 'coinbase', 'instacart', 'doordash', 'pinterest',
    'snap', 'lyft', 'reddit', 'discord', 'plaid', 'robinhood',
    'affirm', 'brex', 'ramp', 'rippling', 'gusto', 'scale',
    'anduril', 'palantir', 'airtable', 'netlify', 'vercel',
    'hashicorp', 'elastic', 'cockroachlabs', 'timescale',
    'grafanalabs', 'sentry', 'launchdarkly', 'snyk', 'gitlabcom',
    'duolingo', 'squarespace', 'wealthsimple', 'zapier',
    'canva', 'asana', 'aurora', 'nuro', 'cruise', 'waymo',
    'openai', 'anthropic', 'mistral', 'cohere',
    // Growth-stage
    'linear', 'retool', 'dbtlabs', 'fivetran', 'airbyte',
    'materialize', 'planetscale', 'neon', 'supabase',
    'fly', 'railway', 'render', 'postman', 'kong',
    'tailscale', 'teleport', 'sourcegraph', 'temporal',
];

const LEVER_COMPANIES = [
    'netflix', 'spotify', 'twilio', 'atlassian', 'datadog',
    'confluent', 'mongodb', 'elastic', 'pagerduty',
    'okta', 'zscaler', 'crowdstrike', 'sentinelone',
    'snowflake', 'dbt-labs', 'mux', 'loom', 'notion',
    'verkada', 'replit', 'huggingface',
    'samsara', 'toast', 'block', 'chime', 'sofi',
    'nerdwallet', 'marqeta', 'lithic', 'column',
];

const ASHBY_COMPANIES = [
    'notion', 'ramp', 'vercel', 'linear', 'mercury',
    'retool', 'supabase', 'railway', 'resend', 'cal',
    'clerk', 'inngest', 'dub', 'tinybird', 'neon',
    'turso', 'axiom', 'buildkite', 'highlight', 'frigade',
];

// === HELPERS ===
function fetch(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetch(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

// === LOAD ALREADY-PROCESSED URLs ===
function loadProcessedUrls() {
    const urls = new Set();
    const files = [APPLIED_FILE, FAILED_FILE, DELETED_FILE, SKIPPED_FILE];
    for (const file of files) {
        if (!fs.existsSync(file)) continue;
        try {
            const content = fs.readFileSync(file, 'utf8');
            content.split('\n').filter(l => l.trim()).forEach(l => {
                try {
                    const entry = JSON.parse(l);
                    if (entry.url) urls.add(normalizeUrl(entry.url));
                } catch (e) { }
            });
            // Also try as JSON array
            try {
                JSON.parse(content).forEach(entry => {
                    if (entry.url) urls.add(normalizeUrl(entry.url));
                });
            } catch (e) { }
        } catch (e) { }
    }
    return urls;
}

function normalizeUrl(u) {
    if (!u) return '';
    u = u.trim().toLowerCase();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) return u;
    return u.split('?')[0].replace(/\/$/, '');
}

// === ROLE FILTER ===
const ROLE_KEYWORDS = [
    'software engineer', 'backend', 'frontend', 'full stack', 'fullstack',
    'platform engineer', 'infrastructure', 'devops', 'sre', 'site reliability',
    'cloud engineer', 'data engineer', 'ml engineer', 'machine learning',
    'systems engineer', 'distributed systems', 'security engineer',
    'staff engineer', 'principal engineer', 'senior engineer',
    'golang', 'python', 'java', 'rust', 'typescript', 'node',
    'kubernetes', 'docker', 'aws', 'gcp', 'azure',
    'api', 'microservices', 'database', 'architect',
];

function isRelevantRole(title) {
    const t = (title || '').toLowerCase();
    return ROLE_KEYWORDS.some(k => t.includes(k));
}

// === GREENHOUSE SCRAPER ===
async function scrapeGreenhouse(company, processedUrls) {
    const jobs = [];
    try {
        const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs`;
        const data = await fetch(url);
        const parsed = JSON.parse(data);
        const jobList = parsed.jobs || [];

        for (const job of jobList) {
            const jobUrl = `https://boards.greenhouse.io/embed/job_app?token=${job.id}`;
            const norm = normalizeUrl(jobUrl);
            if (processedUrls.has(norm)) continue;
            if (!isRelevantRole(job.title)) continue;

            jobs.push({
                id: `gh_${company}_${job.id}`,
                url: jobUrl,
                title: job.title,
                company: company,
                platform: 'greenhouse',
                location: job.location?.name || '',
                scraped_at: new Date().toISOString(),
            });
        }
        if (jobs.length > 0) log(`  ✅ Greenhouse [${company}]: ${jobs.length} relevant jobs (${jobList.length} total)`);
    } catch (e) {
        // Silent — company may not use greenhouse
    }
    return jobs;
}

// === LEVER SCRAPER ===
async function scrapeLever(company, processedUrls) {
    const jobs = [];
    try {
        const url = `https://api.lever.co/v0/postings/${company}?mode=json`;
        const data = await fetch(url);
        const jobList = JSON.parse(data);

        for (const job of jobList) {
            const jobUrl = job.applyUrl || job.hostedUrl;
            if (!jobUrl) continue;
            const norm = normalizeUrl(jobUrl);
            if (processedUrls.has(norm)) continue;
            if (!isRelevantRole(job.text)) continue;

            jobs.push({
                id: `lever_${company}_${job.id}`,
                url: jobUrl,
                title: job.text,
                company: company,
                platform: 'lever',
                location: job.categories?.location || '',
                scraped_at: new Date().toISOString(),
            });
        }
        if (jobs.length > 0) log(`  ✅ Lever [${company}]: ${jobs.length} relevant jobs (${jobList.length} total)`);
    } catch (e) {
        // Silent
    }
    return jobs;
}

// === ASHBY SCRAPER ===
async function scrapeAshby(company, processedUrls) {
    const jobs = [];
    try {
        const url = `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`;
        const body = JSON.stringify({
            operationName: 'ApiJobBoardWithTeams',
            variables: { organizationHostedJobsPageName: company },
            query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
                jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
                    teams { jobs { id title locationName applyUrl } }
                }
            }`
        });

        const data = await new Promise((resolve, reject) => {
            const req = https.request(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            }, res => {
                let d = '';
                res.on('data', chunk => d += chunk);
                res.on('end', () => resolve(d));
            });
            req.on('error', reject);
            req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
            req.write(body);
            req.end();
        });

        const parsed = JSON.parse(data);
        const teams = parsed?.data?.jobBoard?.teams || [];

        for (const team of teams) {
            for (const job of (team.jobs || [])) {
                const jobUrl = job.applyUrl || `https://jobs.ashbyhq.com/${company}/${job.id}`;
                const norm = normalizeUrl(jobUrl);
                if (processedUrls.has(norm)) continue;
                if (!isRelevantRole(job.title)) continue;

                jobs.push({
                    id: `ashby_${company}_${job.id}`,
                    url: jobUrl,
                    title: job.title,
                    company: company,
                    platform: 'ashby',
                    location: job.locationName || '',
                    scraped_at: new Date().toISOString(),
                });
            }
        }
        if (jobs.length > 0) log(`  ✅ Ashby [${company}]: ${jobs.length} relevant jobs`);
    } catch (e) {
        // Silent
    }
    return jobs;
}

// === MAIN ===
(async () => {
    console.log('');
    console.log('================================================');
    console.log('  DIRECT ATS SCRAPER — TOP 50 TECH COMPANIES');
    console.log(`  Greenhouse: ${GREENHOUSE_COMPANIES.length} companies`);
    console.log(`  Lever: ${LEVER_COMPANIES.length} companies`);
    console.log(`  Ashby: ${ASHBY_COMPANIES.length} companies`);
    console.log('================================================');
    console.log('');

    const processedUrls = loadProcessedUrls();
    log(`Loaded ${processedUrls.size} already-processed URLs`);

    const allJobs = [];

    // Greenhouse
    log('🔍 Scraping Greenhouse boards...');
    for (const company of GREENHOUSE_COMPANIES) {
        const jobs = await scrapeGreenhouse(company, processedUrls);
        allJobs.push(...jobs);
        // Small delay to be polite
        await new Promise(r => setTimeout(r, 200));
    }

    // Lever
    log('🔍 Scraping Lever boards...');
    for (const company of LEVER_COMPANIES) {
        const jobs = await scrapeLever(company, processedUrls);
        allJobs.push(...jobs);
        await new Promise(r => setTimeout(r, 200));
    }

    // Ashby
    log('🔍 Scraping Ashby boards...');
    for (const company of ASHBY_COMPANIES) {
        const jobs = await scrapeAshby(company, processedUrls);
        allJobs.push(...jobs);
        await new Promise(r => setTimeout(r, 200));
    }

    // Deduplicate by normalized URL
    const seen = new Set();
    const deduped = allJobs.filter(j => {
        const norm = normalizeUrl(j.url);
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
    });

    log(`\n📊 RESULTS:`);
    log(`  Total jobs found: ${allJobs.length}`);
    log(`  After dedup: ${deduped.length}`);
    log(`  By platform:`);
    log(`    Greenhouse: ${deduped.filter(j => j.platform === 'greenhouse').length}`);
    log(`    Lever: ${deduped.filter(j => j.platform === 'lever').length}`);
    log(`    Ashby: ${deduped.filter(j => j.platform === 'ashby').length}`);

    // Save
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(deduped, null, 2));
    log(`\n💾 Saved ${deduped.length} jobs to ${OUTPUT_FILE}`);
    log('Done! Run high_throughput_runner.js to start applying.');
})();
