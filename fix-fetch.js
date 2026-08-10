// fix-fetch.js — Run with: node fix-fetch.js
// From: C:\Probitechai\examify

const fs = require('fs')
const path = require('path')

const importLine = "import { apiFetch, checkAuth } from '@/lib/auth'"

function getRole(filePath) {
  if (filePath.includes('/student/') || filePath.includes('\\student\\')) return 'student'
  if (filePath.includes('/parent/') || filePath.includes('\\parent\\')) return 'parent'
  return 'school_admin'
}

function getAllPages(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...getAllPages(full))
    else if (entry.name === 'page.tsx') results.push(full)
  }
  return results
}

const dirs = [
  'apps/web/src/app/admin',
  'apps/web/src/app/student',
  'apps/web/src/app/parent',
]

let changed = 0
let stillHasFetch = []

for (const dir of dirs) {
  for (const file of getAllPages(dir)) {
    let src = fs.readFileSync(file, 'utf8')
    const original = src
    const role = getRole(file)

    // 1. Add import after 'use client' if missing
    if (!src.includes(importLine)) {
      src = src.replace("'use client'", `'use client'\n${importLine}`)
    }

    // 2. Add checkAuth useEffect if missing
    if (!src.includes('checkAuth(')) {
      const checkLine = `  useEffect(() => { checkAuth(router, '${role}') }, [])\n\n  useEffect`
      src = src.replace('  useEffect', checkLine)
    }

    // 3. Remove the 3 inline functions
    src = src.replace(/function getToken\(\) \{[^}]+\}\n?/g, '')
    src = src.replace(/function getSubdomain\(\) \{[\s\S]*?return ''\s*\}\n?/g, '')
    src = src.replace(/function hdrs\(\) \{[^}]+\}\n?/g, '')

    // 4. Replace fetch() + hdrs() patterns

    // Pattern A: fetch(`url`, { headers: hdrs() })  — single line
    src = src.replace(/await fetch\((`[^`]+`),\s*\{\s*headers:\s*hdrs\(\)\s*\}\)/g, 'await apiFetch($1)')

    // Pattern B: fetch(`url`, {\n  headers: hdrs()\n}) — multi-line GET
    src = src.replace(/await fetch\((`[^`]+`),\s*\{\s*\n\s*headers:\s*hdrs\(\)\s*\n\s*\}\)/g, 'await apiFetch($1)')

    // Pattern C: fetch with method/body — remove just the headers line
    // First: remove "  headers: hdrs()," line (with trailing comma)
    src = src.replace(/\n\s*headers:\s*hdrs\(\),/g, '')
    // Then: remove "  headers: hdrs()" line (without trailing comma)  
    src = src.replace(/\n\s*headers:\s*hdrs\(\)\n/g, '\n')

    // Pattern D: remaining fetch( -> apiFetch( where followed by template literal
    // This catches any we missed above
    src = src.replace(/\bfetch\((`\$\{[^`]+\}`[^,)]*),/g, 'apiFetch($1,')

    if (src !== original) {
      fs.writeFileSync(file, src, 'utf8')
      const short = file.replace(/.*apps.web.src.app./, '')
      console.log('FIXED: ' + short)
      changed++
    }

    // Check if any hdrs() remain
    if (src.includes('hdrs()')) {
      const short = file.replace(/.*apps.web.src.app./, '')
      stillHasFetch.push(short)
    }
  }
}

console.log('\nDone. ' + changed + ' files updated.')

if (stillHasFetch.length > 0) {
  console.log('\nFiles still containing hdrs():')
  stillHasFetch.forEach(f => console.log('  NEEDS MANUAL FIX: ' + f))
} else {
  console.log('\nAll fetch() calls replaced successfully.')
}
