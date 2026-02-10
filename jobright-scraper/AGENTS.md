# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a Playwright-based job application automation system that scrapes job listings from JobRight.ai, resolves external application URLs, and auto-fills/submits applications across multiple ATS (Applicant Tracking System) platforms. The target throughput is 500 roles/hour.

## Build and Run Commands

### Install dependencies
```
npm install
```

### Core scraper (headless, scrapes job links from JobRight.ai)
```
node jobright_scraper.js --target-new=500
```

### Run scraper in continuous loop (background)
```
nohup ./run_scraper_v9.sh &
# or
nohup ./run_optimized_workflow.sh &
```

### Run application runners (sequential, headed browser)
```
node greenhouse_sequential_runner.js    # Greenhouse-only
node combined_sequential_runner.js      # GH + Lever + Ashby + SmartRecruiters
node unified_runner.js                  # GH + SmartRecruiters
node workday_sequential_runner.js       # Workday-focused (learning mode)
node autonomous_session_runner.js       # Full autonomy with MFA support
```

### Utility scripts
```
node deduplicate_and_clean_jobs.js      # Dedupe + remove jobright.ai links from job_links.json
node resolve_job_links.js               # Resolve internal jobright.ai links to external ATS URLs
node extract_priority_jobs.js           # Filter newjobs.json → priority_jobs_extracted.json
node scan_jobs.js                       # Show queue counts by platform
```

### Auto-pusher (commits job_links.json to git every 5 min)
```
nohup ./auto_pusher.sh &
```

### Browser profile setup (install Chrome extensions manually)
```
node setup_extension.js
```

## Architecture

### Two-Phase Pipeline

**Phase 1: Scraping** (`jobright_scraper.js`)
- Launches headless Chromium with a persistent profile (`user_data_scraper_fresh_v4/`)
- Navigates JobRight.ai, intercepts JSON API responses via `page.on('response')` to extract job objects
- Resolves internal jobright.ai links to external ATS URLs by opening temp pages (concurrency limit: 5)
- Rotates through search keywords on stall (45s timeout), refreshes to "RECOMMENDED" every hour
- Saves to `job_links.json` incrementally

**Phase 2: Application** (runner scripts)
- Loads job queue from `newjobs.json`, `priority_jobs_extracted.json`, or `job_links.json`
- Filters by ATS platform (greenhouse, lever, ashby, smartrecruiters, workday) and exclusion list
- Deduplicates against applied/skipped/deleted/failed history files
- Navigates to each job URL, auto-fills forms using platform-specific selectors, and waits for user action or timeout
- Records status (APPLIED, SKIPPED_USER, DELETED, FAILED, TIMEOUT) to NDJSON append files

### Key Data Files

- `job_links.json` — Master scraped job list (JSON array)
- `newjobs.json` — Raw scraped jobs before filtering
- `priority_jobs_extracted.json` — Filtered/prioritized subset for runners
- `jobs_applied.json` / `applied_append.jsonl` — NDJSON log of applied jobs
- `failed_jobs.json` / `failed-application.json` — NDJSON log of failures (retried on next cycle)
- `skipped_jobs.json` — NDJSON log of user-skipped jobs
- `deleted_jobs.json` — NDJSON log of permanently removed jobs
- `user_recording.jsonl` — NDJSON log of user interactions (learning mode)
- `config.js` — Personal details (name, email, phone, LinkedIn, resume path)

### User Data Directories (Playwright Persistent Profiles)

Each runner uses a separate Chrome profile directory to avoid session conflicts:
- `user_data_scraper_fresh_v4/` — headless scraper
- `user_data_greenhouse_sequential/` — greenhouse runner
- `user_data_ashby_runner/` — ashby runner
- `user_data_learning_session/` — workday/autonomous runners
- `user_data_combined_runner/` — combined runner

Always clean singleton locks (`SingletonLock`, `SingletonCookie`, `SingletonSocket`) before launching if a previous session crashed.

### Form Fill Functions

Each runner duplicates form-fill functions per ATS platform. The canonical implementations:
- `fillGreenhouseForm(page)` — `#first_name`, `#last_name`, `#email`, `#phone`, resume via `input[type="file"][data-source="attach"]`
- `fillAshbyForm(page)` — generic `input[name="name"]`, `input[type="email"]`, `input[type="tel"]`, `input[type="file"]`
- `fillSmartRecruitersForm(page)` — `#first-name-input`, `#last-name-input`, `#email-input`, etc.
- `fillWorkdayForm(page)` — `data-automation-id` selectors
- `fillLeverForm(page)` — `input[name="name"]`, `input[name="email"]`, etc.

### Signal System

Runners support three user interrupt signals (via terminal keypress or injected browser buttons):
- `s` / SKIP — marks job as SKIPPED_USER
- `d` / DELETE — marks job as DELETED and physically removes from JSON files
- `a` / APPLIED — marks job as APPLIED

Signals propagate via `global.SKIP_SIGNAL` / `global.DELETE_SIGNAL` / `global.SUCCESS_SIGNAL` and `window.jobRightSkip` / `window.jobRightDelete` / `window.jobRightSuccess` (browser-side fallback).

### Mode Flags (in runner scripts)

- `STRICT_PASSIVE_MODE` — disables all auto-clicking; user must manually apply
- `LEARN_ONLY_MODE` — enables recording of user interactions but still does form auto-fill
- `HIGH_THROUGHPUT_MODE` — aggressive fallback clicking + auto-skip on no-button
- `OVERNIGHT_MODE` — auto-retry on crash

### URL Normalization

All runners normalize URLs before dedup: strip query params (except Greenhouse `token=`), lowercase, strip trailing slash. This is critical for accurate applied-set matching.

### Exclusion Rules

Jobs are excluded by URL/company/title containing: `speechify`, `paloaltonetworks`, `palo-alto`, `palo alto`. The `extract_priority_jobs.js` script also excludes non-engineering roles (recruiter, marketing, HR, sales, etc.).

## Important Patterns

- All data log files use NDJSON format (one JSON object per line) for append-safety
- Runners have robust JSON parsing with 5 fallback strategies for malformed files (concatenated arrays, concatenated objects, NDJSON, regex scan, array repair)
- Browser launches use `channel: 'chrome'` to use the system Chrome installation (not bundled Chromium)
- `ignoreDefaultArgs: ['--enable-automation', '--disable-extensions']` is used to hide automation flags and allow Chrome extensions
- The `auto_pusher.sh` script auto-commits `job_links.json`, `priority_jobs_extracted.json`, and `jobs_applied.json` to branch `backup/job-scraper` every 5 minutes

## Dependencies

- Node.js with `playwright` (^1.57.0) — sole npm dependency
- System Chrome browser (`channel: 'chrome'`)
