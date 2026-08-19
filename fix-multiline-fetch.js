// fix-multiline-fetch.js
// Fixes multi-line apiFetch/fetch calls missing method: and closing })
// Run from C:\Probitechai\examify:  node fix-multiline-fetch.js

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
    let i = 0

    while (i < lines.length) {
      const line = lines[i]

      // Detect: await apiFetch(`url`, {   — opens options object but...
      // next line is body: JSON.stringify(...) with NO method: before it
      // and line after that is NOT }) but a new statement
      if (line.match(/await\s+(ap)?[Ff]etch\(`[^`]+`,\s*\{$/) ||
          line.match(/await\s+(ap)?[Ff]etch\(`[^`]+`\s*,\s*\{\s*$/)) {
        
        // Collect lines of the options object
        const optLines = [line]
        let j = i + 1
        let depth = 1 // one { opened on this line
        let hasMethod = false
        let hasBody = false
        let closedProperly = false

        while (j < lines.length && depth > 0) {
          const ol = lines[j]
          if (ol.includes('method:')) hasMethod = true
          if (ol.includes('body:')) hasBody = true
          
          for (const ch of ol) {
            if (ch === '{') depth++
            if (ch === '}') depth--
          }
          
          if (depth === 0) {
            // Check if this closing line also closes the apiFetch call
            if (ol.trimEnd().endsWith('})') || ol.trimEnd().endsWith('}),')) {
              closedProperly = true
            }
            optLines.push(ol)
            j++
            break
          }
          optLines.push(ol)
          j++
        }

        // If not closed properly — missing closing )
        if (!closedProperly && hasBody) {
          // Add the ) to the last option line
          const lastOptLine = optLines[optLines.length - 1]
          optLines[optLines.length - 1] = lastOptLine + ')'
          
          // Also add method: 'POST' if missing (before body:)
          if (!hasMethod) {
            for (let k = 0; k < optLines.length; k++) {
              if (optLines[k].includes('body:')) {
                const indent = optLines[k].match(/^(\s*)/)[1]
                optLines.splice(k, 0, indent + "method: 'POST',")
                break
              }
            }
          }
          
          optLines.forEach(l => out.push(l))
          console.log('  Fixed multi-line fetch at line ' + (i+1) + ' in ' + file.replace('apps/web/src/app/',''))
          i = j
          continue
        }

        // Otherwise output as-is
        optLines.forEach(l => out.push(l))
        i = j
        continue
      }

      out.push(line)
      i++
    }

    src = out.join('\n')
    if (src !== original) {
      fs.writeFileSync(winFile, src, 'utf8')
      console.log('FIXED: ' + file.replace('apps/web/src/app/',''))
      fixed++
    }
  }
}

console.log('\nFixed: ' + fixed + ' files')
