// fix-fetch3.js — targeted fix for remaining hdrs() patterns
// node fix-fetch3.js

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

let totalChanged = 0

for (const file of targets) {
  const winFile = file.replace(/\//g, path.sep)
  if (!fs.existsSync(winFile)) { console.log('SKIP: ' + file); continue }

  const original = fs.readFileSync(winFile, 'utf8')
  let src = original

  // Fix 1: fetch(url, { headers: hdrs() }) → apiFetch(url)
  // Handles single-line with any URL expression
  src = src.replace(/\bfetch\(([^,]+),\s*\{\s*headers:\s*hdrs\(\)\s*\}\)/g, 'apiFetch($1)')

  // Fix 2: apiFetch(url, { headers: hdrs() }) → apiFetch(url)  
  // (apiFetch already handles headers internally)
  src = src.replace(/\bapiFetch\(([^,]+),\s*\{\s*headers:\s*hdrs\(\)\s*\}\)/g, 'apiFetch($1)')

  // Fix 3: apiFetch(url, { method: 'X', headers: hdrs() }) → apiFetch(url, { method: 'X' })
  src = src.replace(/\bapiFetch\(([^,]+),\s*\{\s*method:\s*(['"][^'"]+['"]),\s*headers:\s*hdrs\(\)\s*\}\)/g, "apiFetch($1, { method: $2 })")

  // Fix 4: { method: 'X', headers: hdrs(), (newline) body: ...}
  // Remove ", headers: hdrs()" from middle of options
  src = src.replace(/,\s*headers:\s*hdrs\(\)/g, '')

  // Fix 5: { headers: hdrs(), ... } — headers at the start
  src = src.replace(/\{\s*headers:\s*hdrs\(\),\s*/g, '{ ')

  if (src !== original) {
    fs.writeFileSync(winFile, src, 'utf8')
    console.log('FIXED: ' + file.replace('apps/web/src/app/', ''))
    totalChanged++
  }
}

console.log('\nDone. ' + totalChanged + ' files updated.')

// Final check
const remaining = []
for (const file of targets) {
  const winFile = file.replace(/\//g, path.sep)
  if (!fs.existsSync(winFile)) continue
  const src = fs.readFileSync(winFile, 'utf8')
  if (src.includes('hdrs()')) {
    const lines = src.split('\n')
    const hits = lines.map((l,i) => l.includes('hdrs()') ? `  L${i+1}: ${l.trim()}` : null).filter(Boolean)
    remaining.push({ file: file.replace('apps/web/src/app/',''), hits })
  }
}

if (remaining.length === 0) {
  console.log('\nAll hdrs() calls removed.')
} else {
  console.log('\nStill remaining:')
  remaining.forEach(r => {
    console.log('\n' + r.file)
    r.hits.forEach(h => console.log(h))
  })
}
