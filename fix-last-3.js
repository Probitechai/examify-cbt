const fs = require('fs')
const path = require('path')
function read(f) { return fs.readFileSync(f.replace(/\//g, path.sep), 'utf8') }
function write(f, c) { fs.writeFileSync(f.replace(/\//g, path.sep), c, 'utf8') }

// ── FIX 1: student/jamb/page.tsx ─────────────────────────────────────────────
let src = read('apps/web/src/app/student/jamb/page.tsx')
const oldJamb = `        await apiFetch(\`\${API}/jamb/profile\`, {
      body: JSON.stringify({ selectedSubjects, targetScore: 280, dailyGoalQuestions: 20 })
    await loadProfile()`
const newJamb = `        await apiFetch(\`\${API}/jamb/profile\`, {
          method: 'POST',
          body: JSON.stringify({ selectedSubjects, targetScore: 280, dailyGoalQuestions: 20 })
        })
    await loadProfile()`
if (src.includes(oldJamb)) {
  write('apps/web/src/app/student/jamb/page.tsx', src.replace(oldJamb, newJamb))
  console.log('FIXED: student/jamb/page.tsx')
} else {
  console.log('PATTERN NOT FOUND: student/jamb/page.tsx')
  // Show raw content around line 182
  const lines = src.split('\n')
  for(let i=178;i<=186;i++) console.log((i+1)+': '+JSON.stringify(lines[i]))
}

// ── FIX 2: admin/timetable2/page.tsx ─────────────────────────────────────────
src = read('apps/web/src/app/admin/timetable2/page.tsx')
// Line 119-121: venue line, then }), then if (!res.ok) — }) is there but 
// the apiFetch call above it is not closed
// Let's see what's on lines 108-122
const t2lines = src.split('\n')
console.log('\ntimetable2 lines 108-122:')
for(let i=107;i<=121;i++) console.log((i+1)+': '+JSON.stringify(t2lines[i]))

// ── FIX 3: admin/report-card/page.tsx ────────────────────────────────────────
src = read('apps/web/src/app/admin/report-card/page.tsx')
const rclines = src.split('\n')
console.log('\nreport-card lines 152-163:')
for(let i=151;i<=162;i++) console.log((i+1)+': '+JSON.stringify(rclines[i]))
