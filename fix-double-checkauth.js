// fix-double-checkauth.js
// Fixes duplicate checkAuth useEffect insertions
// Run from C:\Probitechai\examify:  node fix-double-checkauth.js

const fs = require('fs')
const path = require('path')

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

const dirs = ['apps/web/src/app/admin','apps/web/src/app/student','apps/web/src/app/parent']

let fixed = 0
const issues = []

for (const dir of dirs) {
  for (const file of getAllPages(dir)) {
    const winFile = file.replace(/\//g, path.sep)
    let src = fs.readFileSync(winFile, 'utf8')
    const original = src

    // Count how many times checkAuth appears
    const count = (src.match(/useEffect\(\(\) => \{ checkAuth\(/g) || []).length

    if (count > 1) {
      // Keep only the FIRST occurrence, remove all subsequent ones
      let firstFound = false
      src = src.replace(/\n\n?  useEffect\(\(\) => \{ checkAuth\(router, '[^']+'\) \}, \[\]\)/g, (match) => {
        if (!firstFound) {
          firstFound = true
          return match // keep first
        }
        return '' // remove duplicates
      })

      // Also handle case where it appears without leading newlines
      const countAfter = (src.match(/useEffect\(\(\) => \{ checkAuth\(/g) || []).length
      if (countAfter > 1) {
        // Fallback: split and rebuild keeping only first
        const lines = src.split('\n')
        let checkAuthSeen = false
        const newLines = lines.filter(line => {
          if (line.trim().startsWith('useEffect(() => { checkAuth(')) {
            if (!checkAuthSeen) {
              checkAuthSeen = true
              return true // keep first
            }
            return false // remove duplicates
          }
          return true
        })
        src = newLines.join('\n')
      }
    }

    if (src !== original) {
      fs.writeFileSync(winFile, src, 'utf8')
      const short = file.replace('apps/web/src/app/', '')
      console.log('FIXED (' + count + ' → 1): ' + short)
      fixed++
    }

    // Final verification
    const finalCount = (src.match(/useEffect\(\(\) => \{ checkAuth\(/g) || []).length
    if (finalCount > 1) {
      issues.push(file.replace('apps/web/src/app/', '') + ' (still has ' + finalCount + ')')
    }
  }
}

console.log('\nFixed: ' + fixed + ' files')
if (issues.length > 0) {
  console.log('\nStill has duplicates:')
  issues.forEach(i => console.log('  ' + i))
} else {
  console.log('All files have exactly one checkAuth call.')
}
