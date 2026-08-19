const fs = require('fs')
const path = require('path')
function read(f) { return fs.readFileSync(f.replace(/\//g, path.sep), 'utf8') }
function write(f, c) { fs.writeFileSync(f.replace(/\//g, path.sep), c, 'utf8') }

// ── FIX 1: timetable2 — remove the extra ) we added last time ────────────────
let src = read('apps/web/src/app/admin/timetable2/page.tsx')
// Revert })) back to }) — the real issue is elsewhere above
src = src.replace(
  '          venue: formVenue || undefined,\n      }))\n      if (!res.ok)',
  '          venue: formVenue || undefined,\n        })\n      if (!res.ok)'
)
// Now find the apiFetch call that opens the options and is missing )
// Pattern: await apiFetch(`url`, {\n...lines...\n        })\n      if
// The apiFetch( itself needs a closing )
// Look for: await apiFetch(`...`, {\n and find its matching }) then add )
const t2lines = src.split('\n')
for (let i = 0; i < t2lines.length; i++) {
  if (t2lines[i].match(/await (ap)?[Ff]etch\(`[^`]+`,\s*\{/)) {
    // Find the closing }) for this call
    let depth = 0
    for (const ch of t2lines[i]) { if(ch==='(') depth++; if(ch===')') depth-- }
    let j = i + 1
    while (j < t2lines.length && depth > 0) {
      for (const ch of t2lines[j]) { if(ch==='(') depth++; if(ch===')') depth-- }
      if (depth === 0) {
        // Check if the line closes with }) — if so the apiFetch( is balanced
        // If closes with just } — missing )
        const trimmed = t2lines[j].trimEnd()
        if (trimmed.endsWith('}') && !trimmed.endsWith('})')) {
          t2lines[j] = t2lines[j].trimEnd() + ')'
          console.log('timetable2: added ) on line ' + (j+1))
        }
        break
      }
      j++
    }
  }
}
write('apps/web/src/app/admin/timetable2/page.tsx', t2lines.join('\n'))
console.log('FIXED: timetable2/page.tsx')

// ── FIX 2: jamb — two broken apiFetch calls ───────────────────────────────────
src = read('apps/web/src/app/student/jamb/page.tsx')

// Fix call 1 (around line 182): apiFetch jamb/profile
src = src.replace(
  "        await apiFetch(`${API}/jamb/profile`, {\n      body: JSON.stringify({ selectedSubjects, targetScore: 280, dailyGoalQuestions: 20 })\n    await loadProfile()",
  "        await apiFetch(`${API}/jamb/profile`, {\n          method: 'POST',\n          body: JSON.stringify({ selectedSubjects, targetScore: 280, dailyGoalQuestions: 20 })\n        })\n    await loadProfile()"
)

// Fix call 2 (around line 209): apiFetch jamb/ai/quiz
src = src.replace(
  "            const res = await apiFetch(`${API}/jamb/ai/quiz`, {\n        body: JSON.stringify({ subjectName: subject.name, topicName: topic.name })\n      const data",
  "            const res = await apiFetch(`${API}/jamb/ai/quiz`, {\n              method: 'POST',\n              body: JSON.stringify({ subjectName: subject.name, topicName: topic.name })\n            })\n      const data"
)

write('apps/web/src/app/student/jamb/page.tsx', src)
console.log('FIXED: student/jamb/page.tsx')

// ── FIX 3: report-card — join split apiFetch line ────────────────────────────
const rclines = read('apps/web/src/app/admin/report-card/page.tsx').split('\n')
for (let i = 0; i < rclines.length - 1; i++) {
  // Line ends with `, (comma after template literal) and next line is standalone {
  if (rclines[i].trimEnd().match(/apiFetch\(`[^`]+`,?$/) && rclines[i+1].trim() === '{') {
    // Join them
    const comma = rclines[i].trimEnd().endsWith(',') ? '' : ','
    rclines[i] = rclines[i].trimEnd() + comma + ' {'
    rclines.splice(i+1, 1)
    console.log('report-card: joined line ' + (i+1) + ' with {')
    break
  }
  // Also handle: line ends with `, and next line is {
  if (rclines[i].includes('apiFetch(') && rclines[i].trimEnd().endsWith('`,') && rclines[i+1].trim() === '{') {
    rclines[i] = rclines[i].trimEnd().slice(0,-1) + ', {'
    rclines.splice(i+1, 1)
    console.log('report-card: joined `, line ' + (i+1) + ' with {')
    break
  }
}
write('apps/web/src/app/admin/report-card/page.tsx', rclines.join('\n'))
console.log('FIXED: admin/report-card/page.tsx')

console.log('\nDone. Now run: cd apps\\web && npx next build')
