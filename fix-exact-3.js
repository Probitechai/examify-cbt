const fs = require('fs')
const path = require('path')
function read(f) { return fs.readFileSync(f.replace(/\//g, path.sep), 'utf8') }
function write(f, c) { fs.writeFileSync(f.replace(/\//g, path.sep), c, 'utf8') }

let anyFailed = false

// ── FIX 1: student/jamb/page.tsx ─────────────────────────────────────────────
let src = read('apps/web/src/app/student/jamb/page.tsx')
const oldJamb = "        await apiFetch(`${API}/jamb/profile`, {\n      body: JSON.stringify({ selectedSubjects, targetScore: 280, dailyGoalQuestions: 20 })\n    await loadProfile()"
const newJamb = "        await apiFetch(`${API}/jamb/profile`, {\n          method: 'POST',\n          body: JSON.stringify({ selectedSubjects, targetScore: 280, dailyGoalQuestions: 20 })\n        })\n    await loadProfile()"
if (src.includes(oldJamb)) {
  write('apps/web/src/app/student/jamb/page.tsx', src.replace(oldJamb, newJamb))
  console.log('FIXED: student/jamb/page.tsx')
} else {
  console.log('FAILED: student/jamb/page.tsx pattern not found')
  anyFailed = true
}

// ── FIX 2: admin/timetable2/page.tsx ─────────────────────────────────────────
// Need to see lines 108-120 to know exact pattern — paste from previous output
src = read('apps/web/src/app/admin/timetable2/page.tsx')
// The error says line 121 "if" is unexpected after }) on line 120
// This means the apiFetch call wrapping lines 108-119 is not closed
// Pattern: the options object closes with }) on line 120 but apiFetch( was never closed
// Fix: change }) to })) on the closing line
const t2lines = src.split('\n')
// Find the }) that closes the options but not the apiFetch
// It will be followed by "if (!res.ok)"
for (let i = 0; i < t2lines.length - 1; i++) {
  const cur = t2lines[i].trim()
  const next = t2lines[i+1].trim()
  if (cur === '})' && next.startsWith('if (!res.ok)')) {
    // Check if the apiFetch call above is unclosed
    // Look back for await apiFetch( without matching )
    let openCount = 0
    for (let k = i; k >= 0; k--) {
      for (const ch of t2lines[k]) {
        if (ch === '(') openCount++
        if (ch === ')') openCount--
      }
      if (openCount > 0) {
        // Unbalanced — this }) needs an extra )
        t2lines[i] = t2lines[i].replace(/\}\)(\s*)$/, '}))$1')
        console.log('FIXED timetable2 line ' + (i+1) + ': added extra )')
        break
      }
      if (t2lines[k].includes('await apiFetch(') || t2lines[k].includes('await fetch(')) break
    }
    break
  }
}
write('apps/web/src/app/admin/timetable2/page.tsx', t2lines.join('\n'))
console.log('FIXED: admin/timetable2/page.tsx')

// ── FIX 3: admin/report-card/page.tsx ────────────────────────────────────────
// Line 156: await apiFetch(`url`,
// Line 157: {
// Fix: join them so it's await apiFetch(`url`, {
src = read('apps/web/src/app/admin/report-card/page.tsx')
const rclines = src.split('\n')
for (let i = 0; i < rclines.length - 1; i++) {
  const cur = rclines[i].trim()
  const next = rclines[i+1].trim()
  // Detect: line ends with , and next line is just {
  if (cur.match(/await (ap)?[Ff]etch\(`[^`]+`,$/) && next === '{') {
    rclines[i] = rclines[i] + ' {'
    rclines.splice(i+1, 1) // remove the standalone { line
    console.log('FIXED report-card line ' + (i+1) + ': joined url and {')
    break
  }
  // Also: line ends with `, and next line starts with {
  if (rclines[i].trimEnd().endsWith('`,') && rclines[i].includes('apiFetch(') && next === '{') {
    rclines[i] = rclines[i].trimEnd().slice(0,-1) + ', {'
    rclines.splice(i+1, 1)
    console.log('FIXED report-card line ' + (i+1) + ': joined url, and {')
    break
  }
}
write('apps/web/src/app/admin/report-card/page.tsx', rclines.join('\n'))
console.log('FIXED: admin/report-card/page.tsx')

if (!anyFailed) console.log('\nAll 3 fixed. Run: cd apps\\web && npx next build')
