const fs = require('fs')
const path = require('path')
function read(f) { return fs.readFileSync(f.replace(/\//g, path.sep), 'utf8') }
function write(f, c) { fs.writeFileSync(f.replace(/\//g, path.sep), c, 'utf8') }

// ── FIX 1: jamb — fix apiFetch jamb/ai/summary ───────────────────────────────
let src = read('apps/web/src/app/student/jamb/page.tsx')
src = src.replace(
  "            const res = await apiFetch(`${API}/jamb/ai/summary`, {\n        body: JSON.stringify({ subjectName: subject.name, topicName: topic.name })\n      const data",
  "            const res = await apiFetch(`${API}/jamb/ai/summary`, {\n              method: 'POST',\n              body: JSON.stringify({ subjectName: subject.name, topicName: topic.name })\n            })\n      const data"
)
write('apps/web/src/app/student/jamb/page.tsx', src)
console.log('FIXED: student/jamb/page.tsx')

// ── FIX 2: timetable2 — show lines 95-122 to find the unclosed apiFetch ──────
const t2 = read('apps/web/src/app/admin/timetable2/page.tsx').split('\n')
console.log('\ntimetable2 lines 95-122:')
for (let i = 94; i <= 121; i++) console.log((i+1) + ': ' + JSON.stringify(t2[i]))
