// show-broken.js — shows context around errors in the 11 broken files
const fs = require('fs')
const path = require('path')

const targets = [
  { file: 'apps/web/src/app/student/jamb/page.tsx', line: 184 },
  { file: 'apps/web/src/app/admin/admissions/page.tsx', line: 92 },
  { file: 'apps/web/src/app/admin/hostel-operations/page.tsx', line: 170 },
  { file: 'apps/web/src/app/admin/hostels/page.tsx', line: 116 },
]

for (const { file, line } of targets) {
  const winFile = file.replace(/\//g, path.sep)
  if (!fs.existsSync(winFile)) { console.log('NOT FOUND: ' + file); continue }
  const lines = fs.readFileSync(winFile, 'utf8').split('\n')
  console.log('\n=== ' + file.replace('apps/web/src/app/','') + ' (around line ' + line + ') ===')
  for (let i = Math.max(0, line - 12); i < Math.min(lines.length, line + 3); i++) {
    console.log((i+1) + ': ' + lines[i])
  }
}
