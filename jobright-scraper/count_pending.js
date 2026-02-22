const fs = require('fs');
const DIR = __dirname;

const applied = new Set();
['jobs_applied.json','skipped_jobs.json','deleted_jobs.json'].forEach(f => {
  try {
    fs.readFileSync(DIR + '/' + f, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
      try { const u = JSON.parse(l).url; if (u) applied.add(u.split('?')[0].replace(/\/$/, '')); } catch(e) {}
    });
  } catch(e) {}
});
console.log('History:', applied.size);

const raw = fs.readFileSync(DIR + '/newjobs.json', 'utf8');
let jobs;
try { jobs = JSON.parse(raw); } catch(e) { jobs = JSON.parse(raw.replace(/\]\s*\[/g, ',')); }

let pending = 0, gh = 0, sr = 0, lv = 0, ab = 0;
const seen = new Set();
for (const j of jobs) {
  if (!j || !j.url) continue;
  const u = String(j.url).split('?')[0].replace(/\/$/, '');
  if (seen.has(u) || applied.has(u)) continue;
  seen.add(u);
  const s = String(j.url);
  if (s.includes('greenhouse')) { pending++; gh++; }
  else if (s.includes('smartrecruiters')) { pending++; sr++; }
  else if (s.includes('lever.co')) { pending++; lv++; }
  else if (s.includes('ashbyhq')) { pending++; ab++; }
}
console.log('Pending:', pending, '(gh=' + gh + ' sr=' + sr + ' lever=' + lv + ' ashby=' + ab + ')');
