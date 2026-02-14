#!/usr/bin/env node
/**
 * fix_applied_jobs.js
 *
 * 1. Deduplicates jobs_applied.json (keeps earliest entry per normalized URL)
 * 2. Removes applied URLs from job_links.json
 * 3. Reports before/after stats
 *
 * Usage:
 *   node fix_applied_jobs.js          # dry-run (preview only)
 *   node fix_applied_jobs.js --apply  # actually write changes
 */

const fs = require('fs');
const path = require('path');

const APPLIED_FILE = path.resolve('./jobs_applied.json');
const JOB_LINKS_FILE = path.resolve('./job_links.json');
const FAILED_FILE = path.resolve('./failed_jobs.json');
const SKIPPED_FILE = path.resolve('./skipped_jobs.json');
const DELETED_FILE = path.resolve('./deleted_jobs.json');

const dryRun = !process.argv.includes('--apply');

if (dryRun) {
    console.log('🔍 DRY RUN MODE (pass --apply to write changes)\n');
} else {
    console.log('⚡ APPLY MODE — writing changes\n');
}

// --- Normalize URL (must match runner logic) ---
function normalizeUrl(u) {
    u = (u || '').toLowerCase();
    if (u.includes('boards.greenhouse.io') && u.includes('token=')) {
        return u;
    }
    return u.split('?')[0].replace(/\/$/, '');
}

// --- Load NDJSON file safely ---
function loadNdjson(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
    const entries = [];
    lines.forEach(l => {
        try { entries.push(JSON.parse(l)); } catch (e) { }
    });
    return entries;
}

// === STEP 1: Deduplicate jobs_applied.json ===
console.log('=== STEP 1: Deduplicate jobs_applied.json ===');
const appliedEntries = loadNdjson(APPLIED_FILE);
console.log(`  Before: ${appliedEntries.length} entries`);

const seenApplied = new Map(); // normalizedUrl -> entry (keep earliest)
appliedEntries.forEach(entry => {
    if (!entry.url) return;
    const norm = normalizeUrl(entry.url);
    if (!seenApplied.has(norm)) {
        seenApplied.set(norm, entry);
    }
    // Keep earliest (first seen = earliest since file is append-only)
});

const dedupedApplied = [...seenApplied.values()];
const removedDupes = appliedEntries.length - dedupedApplied.length;
console.log(`  After:  ${dedupedApplied.length} unique entries`);
console.log(`  Removed: ${removedDupes} duplicates`);

// Status breakdown
const statusCounts = {};
dedupedApplied.forEach(e => { statusCounts[e.status] = (statusCounts[e.status] || 0) + 1; });
console.log(`  Statuses: ${JSON.stringify(statusCounts)}`);

// === STEP 2: Build full "processed" URL set (applied + failed + skipped + deleted) ===
console.log('\n=== STEP 2: Build processed URL set ===');
const appliedUrls = new Set(seenApplied.keys());
console.log(`  Applied URLs: ${appliedUrls.size}`);

const failedEntries = loadNdjson(FAILED_FILE);
const skippedEntries = loadNdjson(SKIPPED_FILE);
const deletedEntries = loadNdjson(DELETED_FILE);

const deletedUrls = new Set();
deletedEntries.forEach(e => { if (e.url) deletedUrls.add(normalizeUrl(e.url)); });
const skippedUrls = new Set();
skippedEntries.forEach(e => { if (e.url) skippedUrls.add(normalizeUrl(e.url)); });

console.log(`  Deleted URLs: ${deletedUrls.size}`);
console.log(`  Skipped URLs: ${skippedUrls.size}`);
console.log(`  Failed URLs:  ${failedEntries.length} entries (kept for retry)`);

// Combined set for removal from job_links (applied + deleted + skipped)
const removeSet = new Set([...appliedUrls, ...deletedUrls, ...skippedUrls]);
console.log(`  Total URLs to remove from queue: ${removeSet.size}`);

// === STEP 3: Clean job_links.json ===
console.log('\n=== STEP 3: Clean job_links.json ===');
const jobLinks = JSON.parse(fs.readFileSync(JOB_LINKS_FILE, 'utf8'));
console.log(`  Before: ${jobLinks.length} jobs`);

// Also deduplicate job_links by URL
const seenJobLinks = new Set();
const cleanedJobLinks = jobLinks.filter(j => {
    if (!j.url) return false;
    const norm = normalizeUrl(j.url);
    if (seenJobLinks.has(norm)) return false;
    seenJobLinks.add(norm);
    if (removeSet.has(norm)) return false;
    return true;
});

const removedFromQueue = jobLinks.length - cleanedJobLinks.length;
const dupesInQueue = jobLinks.length - seenJobLinks.size - (jobLinks.length - cleanedJobLinks.length - (removedFromQueue - (jobLinks.length - seenJobLinks.size)));
console.log(`  After:  ${cleanedJobLinks.length} jobs`);
console.log(`  Removed: ${removedFromQueue} (applied/deleted/skipped/dupes)`);

// === STEP 4: Write or preview ===
console.log('\n=== SUMMARY ===');
console.log(`  jobs_applied.json: ${appliedEntries.length} → ${dedupedApplied.length} (−${removedDupes} dupes)`);
console.log(`  job_links.json:    ${jobLinks.length} → ${cleanedJobLinks.length} (−${removedFromQueue} processed/dupes)`);

if (!dryRun) {
    // Backup originals
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(APPLIED_FILE, `${APPLIED_FILE}.bak.${ts}`);
    fs.copyFileSync(JOB_LINKS_FILE, `${JOB_LINKS_FILE}.bak.${ts}`);
    console.log(`\n  📦 Backups created with timestamp ${ts}`);

    // Write deduped applied
    const appliedNdjson = dedupedApplied.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(APPLIED_FILE, appliedNdjson);
    console.log(`  ✅ Wrote ${dedupedApplied.length} entries to jobs_applied.json`);

    // Write cleaned job_links
    fs.writeFileSync(JOB_LINKS_FILE, JSON.stringify(cleanedJobLinks, null, 2));
    console.log(`  ✅ Wrote ${cleanedJobLinks.length} jobs to job_links.json`);

    // === VERIFY ===
    console.log('\n=== VERIFICATION ===');
    const verifyApplied = loadNdjson(APPLIED_FILE);
    const verifyLinks = JSON.parse(fs.readFileSync(JOB_LINKS_FILE, 'utf8'));

    // Check no dupes in applied
    const vSeen = new Set();
    let vDupes = 0;
    verifyApplied.forEach(e => {
        const n = normalizeUrl(e.url);
        if (vSeen.has(n)) vDupes++;
        vSeen.add(n);
    });

    // Check no applied URLs in job_links
    let vOverlap = 0;
    verifyLinks.forEach(j => {
        if (j.url && appliedUrls.has(normalizeUrl(j.url))) vOverlap++;
    });

    console.log(`  jobs_applied.json: ${verifyApplied.length} entries, ${vDupes} dupes ${vDupes === 0 ? '✅' : '❌'}`);
    console.log(`  job_links.json:    ${verifyLinks.length} jobs, ${vOverlap} applied overlap ${vOverlap === 0 ? '✅' : '❌'}`);

    if (vDupes === 0 && vOverlap === 0) {
        console.log('\n  🎉 All checks passed!');
    } else {
        console.log('\n  ⚠️  Issues remain — check output above.');
    }
} else {
    console.log('\n  ℹ️  No changes written. Run with --apply to fix.');
}
