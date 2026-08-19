// fix-missing-paren.js
// Fixes fetch/apiFetch calls missing closing ) after options object
// Run from C:\Probitechai\examify:  node fix-missing-paren.js

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

for (const dir of dirs) {
  for (const file of getAllPages(dir)) {
    const winFile = file.replace(/\//g, path.sep)
    let src = fs.readFileSync(winFile, 'utf8')
    const original = src
    const lines = src.split('\n')
    const out = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Detect: line contains fetch( or apiFetch( with an options object
      // that ends with } but is missing the closing )
      // Signs:
      //   - line contains await fetch( or await apiFetch(
      //   - line ends with } (closing the options object) but NOT })
      //   - next non-empty line starts with const/if/set/await (not a continuation)

      const isFetchLine = line.match(/await\s+(ap)?[Ff]etch\(/) 
      const endsWithBrace = line.trimEnd().endsWith('}')
      const notClosed = !line.trimEnd().endsWith('})')  && !line.trimEnd().endsWith('},')

      if (isFetchLine && endsWithBrace && notClosed) {
        // Find next non-empty line
        let j = i + 1
        while (j < lines.length && lines[j].trim() === '') j++
        const nextLine = j < lines.length ? lines[j].trim() : ''
        
        // If next line is a statement (not closing paren or continuation)
        const isStatement = nextLine.match(/^(const|let|var|if|set|await|return|throw|\/\/)/)
        
        if (isStatement) {
          // Add missing ) to close the fetch call
          out.push(line + ')')
          console.log('  Fixed line ' + (i+1) + ': added missing ) in ' + file.replace('apps/web/src/app/',''))
          continue
        }
      }

      out.push(line)
    }

    src = out.join('\n')

    if (src !== original) {
      fs.writeFileSync(winFile, src, 'utf8')
      console.log('FIXED: ' + file.replace('apps/web/src/app/', ''))
      fixed++
    }
  }
}

console.log('\nFixed: ' + fixed + ' files')
