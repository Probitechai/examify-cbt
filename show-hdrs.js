// show-hdrs.js — shows exact lines containing hdrs() in each file
// Run from C:\Probitechai\examify:  node show-hdrs.js

const fs = require('fs')
const path = require('path')

const targets = [
  'apps/web/src/app/admin/admissions/page.tsx',
  'apps/web/src/app/admin/broadsheet/page.tsx',
  'apps/web/src/app/admin/curriculum/page.tsx',
  'apps/web/src/app/admin/hostel-operations/page.tsx',
  'apps/web/src/app/admin/hostels/page.tsx',
  'apps/web/src/app/admin/lessons/page.tsx',
  'apps/web/src/app/admin/live-classes/page.tsx',
  'apps/web/src/app/admin/qbank/page.tsx',
  'apps/web/src/app/admin/questions2/page.tsx',
  'apps/web/src/app/admin/report-card/page.tsx',
  'apps/web/src/app/admin/subscription/page.tsx',
  'apps/web/src/app/admin/timetable2/page.tsx',
  'apps/web/src/app/admin/lessons/[id]/page.tsx',
  'apps/web/src/app/admin/students/[id]/page.tsx',
  'apps/web/src/app/student/learning-paths/page.tsx',
  'apps/web/src/app/student/lessons/[id]/page.tsx',
  'apps/web/src/app/parent/page.tsx',
]

for (const file of targets) {
  const winFile = file.replace(/\//g, path.sep)
  if (!fs.existsSync(winFile)) continue
  const lines = fs.readFileSync(winFile, 'utf8').split('\n')
  const hits = []
  lines.forEach((ln, i) => {
    if (ln.includes('hdrs()')) hits.push(`  L${i+1}: ${ln.trim()}`)
  })
  if (hits.length > 0) {
    console.log('\n' + file.replace('apps/web/src/app/', '') + ':')
    hits.forEach(h => console.log(h))
  }
}
