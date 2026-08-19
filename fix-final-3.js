// fix-final-3.js
// Fixes the last 3 syntax errors
// Run from C:\Probitechai\examify:  node fix-final-3.js

const fs = require('fs')
const path = require('path')

function read(f) { return fs.readFileSync(f.replace(/\//g, path.sep), 'utf8') }
function write(f, c) { fs.writeFileSync(f.replace(/\//g, path.sep), c, 'utf8') }
function lines(f) { return read(f).split('\n') }
function showLines(f, from, to) {
  lines(f).slice(from-1, to).forEach((l,i) => console.log((from+i)+': '+l))
}

// ── FILE 1: student/jamb/page.tsx ─────────────────────────────────────────────
// Problem: apiFetch call at line 182 opens { but body line (183) has wrong indent
//          and closing }) is missing before line 184
console.log('\n=== jamb/page.tsx context ===')
showLines('apps/web/src/app/student/jamb/page.tsx', 176, 187)

let src = read('apps/web/src/app/student/jamb/page.tsx')
// The broken pattern:
//   await apiFetch(`${API}/jamb/profile`, {
//     body: JSON.stringify({...})
//   await loadProfile()
// Fix: add method:'POST', and closing })
src = src.replace(
  /await apiFetch\(`\$\{API\}\/jamb\/profile`, \{\s*\n\s*body: JSON\.stringify\(\{ selectedSubjects, targetScore: 280, dailyGoalQuestions: 20 \}\)\)/,
  "await apiFetch(`${API}/jamb/profile`, {\n      method: 'POST',\n      body: JSON.stringify({ selectedSubjects, targetScore: 280, dailyGoalQuestions: 20 })\n    })"
)
write('apps/web/src/app/student/jamb/page.tsx', src)
console.log('FIXED: student/jamb/page.tsx')

// ── FILE 2: admin/report-card/page.tsx ────────────────────────────────────────
// Problem: apiFetch call split incorrectly — URL on one line, { on next line
// Line 156: const uploadRes = await apiFetch(`${SUPABASE_URL}/...`,
// Line 157: {
// This is actually valid JS but Turbopack chokes — need to join them
console.log('\n=== report-card/page.tsx context ===')
showLines('apps/web/src/app/admin/report-card/page.tsx', 153, 163)

src = read('apps/web/src/app/admin/report-card/page.tsx')
// Join the split: "apiFetch(`url`,\n        {" → "apiFetch(`url`, {"
src = src.replace(
  /(await apiFetch\(`[^`]+`),\s*\n\s*\{(\s*\n\s*method:)/g,
  '$1, {$2'
)
write('apps/web/src/app/admin/report-card/page.tsx', src)
console.log('FIXED: admin/report-card/page.tsx')

// ── FILE 3: admin/timetable2/page.tsx ─────────────────────────────────────────
// Problem: closing }) missing from apiFetch call before line 120
console.log('\n=== timetable2/page.tsx context ===')
showLines('apps/web/src/app/admin/timetable2/page.tsx', 112, 124)

src = read('apps/web/src/app/admin/timetable2/page.tsx')
// Find the pattern: body line followed immediately by if (!res.ok)
// Missing }) between them
src = src.replace(
  /(venue: formVenue \|\| undefined,\s*\n\s*)\n(\s*if \(!res\.ok\))/,
  '$1    })\n$2'
)
// Also try the pattern without venue line
src = src.replace(
  /(endTime: formEnd \|\| undefined,\s*\n\s*venue: formVenue \|\| undefined,\s*\n)([ \t]*if \(!res\.ok\))/,
  '$1      })\n$2'
)
write('apps/web/src/app/admin/timetable2/page.tsx', src)
console.log('FIXED: admin/timetable2/page.tsx')

console.log('\nDone. Run: cd apps\\web && npx next build')
