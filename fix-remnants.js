// fix-remnants.js
// Removes broken remnants of partially-deleted inline auth functions
// Run from C:\Probitechai\examify:  node fix-remnants.js

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
const stillBroken = []

for (const dir of dirs) {
  for (const file of getAllPages(dir)) {
    const winFile = file.replace(/\//g, path.sep)
    let src = fs.readFileSync(winFile, 'utf8')
    const original = src

    // Pattern 1: remnant of hdrs() function body that was partially deleted
    // e.g: `, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }\n}\n`
    src = src.replace(/^`[^`\n]*getSubdomain\(\)[^`\n]*\}\s*\n\}\s*\n/mg, '')
    src = src.replace(/^`,\s*'X-School-Subdomain'[^\n]*\n\}\s*\n/mg, '')

    // Pattern 2: leftover closing brace/backtick pairs from function removal
    src = src.replace(/^`\s*\}\s*\n\}\s*\n/mg, '')

    // Pattern 3: any line starting with backtick at top level (outside component)
    // that contains getSubdomain or Content-Type
    const lines = src.split('\n')
    const cleaned = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      // Detect orphaned remnant lines at top level
      if (
        line.match(/^`.*getSubdomain/) ||
        line.match(/^`,\s*'X-School-Subdomain'/) ||
        line.match(/^`,\s*"X-School-Subdomain"/) ||
        line.match(/^`.*'Content-Type'.*\}$/) ||
        line.match(/^`.*"Content-Type".*\}$/)
      ) {
        // Skip this line and any following lone } lines
        i++
        while (i < lines.length && lines[i].match(/^\}\s*$/)) i++
        continue
      }
      cleaned.push(line)
      i++
    }
    src = cleaned.join('\n')

    // Pattern 4: remnant getSubdomain function that wasn't fully removed
    src = src.replace(/function getSubdomain\(\) \{[\s\S]*?return ''\s*\}\s*\n/g, '')
    src = src.replace(/function getToken\(\) \{[\s\S]*?return undefined\s*\}\s*\n/g, '')

    if (src !== original) {
      fs.writeFileSync(winFile, src, 'utf8')
      const short = file.replace('apps/web/src/app/', '')
      console.log('FIXED: ' + short)
      fixed++
    }

    // Check for remaining issues
    if (src.includes('getSubdomain()') && !src.includes('import') && src.match(/^`/m)) {
      stillBroken.push(file.replace('apps/web/src/app/', ''))
    }
  }
}

console.log('\nFixed: ' + fixed + ' files')
if (stillBroken.length > 0) {
  console.log('\nMay still have issues:')
  stillBroken.forEach(f => console.log('  ' + f))
} else {
  console.log('No obvious remnants detected.')
}
