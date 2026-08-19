// fix-checkauth-indent.js
// Fixes checkAuth useEffect inserted outside component (no indentation)
// Run from C:\Probitechai\examify:  node fix-checkauth-indent.js

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
let checked = 0
const stillBroken = []

for (const dir of dirs) {
  for (const file of getAllPages(dir)) {
    const winFile = file.replace(/\//g, path.sep)
    let src = fs.readFileSync(winFile, 'utf8')
    const original = src
    checked++

    // Fix: unindented checkAuth line followed by blank line and indented useEffect
    // Pattern: \nuseEffect(() => { checkAuth(router, '...') }, [])\n\n  useEffect
    // Should be: \n  useEffect(() => { checkAuth(router, '...') }, [])\n\n  useEffect
    
    // Replace unindented checkAuth useEffect with properly indented version
    src = src.replace(
      /^useEffect\(\(\) => \{ checkAuth\(router, '([^']+)'\) \}, \[\]\)$/mg,
      "  useEffect(() => { checkAuth(router, '$1') }, [])"
    )

    // Also fix double-inserted checkAuth (sometimes inserted twice)
    src = src.replace(
      /  useEffect\(\(\) => \{ checkAuth\(router, '([^']+)'\) \}, \[\]\)\n\n  useEffect\(\(\) => \{ checkAuth\(router, '([^']+)'\) \}, \[\]\)/g,
      "  useEffect(() => { checkAuth(router, '$1') }, [])"
    )

    if (src !== original) {
      fs.writeFileSync(winFile, src, 'utf8')
      const short = file.replace('apps/web/src/app/', '')
      console.log('FIXED: ' + short)
      fixed++
    }

    // Verify no remaining unindented checkAuth
    if (src.match(/^useEffect\(\(\) => \{ checkAuth/m)) {
      stillBroken.push(file.replace('apps/web/src/app/', ''))
    }
  }
}

console.log('\nChecked: ' + checked + ', Fixed: ' + fixed)
if (stillBroken.length > 0) {
  console.log('\nStill broken:')
  stillBroken.forEach(f => console.log('  ' + f))
} else {
  console.log('All checkAuth lines properly indented.')
}
