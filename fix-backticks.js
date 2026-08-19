// fix-backticks.js
// Run from C:\Probitechai\examify:  node fix-backticks.js

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

// First: inspect the actual bytes around the broken backtick
const testFile = 'apps/web/src/app/admin/announcements/page.tsx'.replace(/\//g, path.sep)
const buf = fs.readFileSync(testFile)
const src = buf.toString('utf8')
const lines = src.split('\n')
const line52 = lines[51] // line 52 (0-indexed: 51)
console.log('Line 52 raw:', JSON.stringify(line52))
console.log('Char codes around position 32:')
for (let i = 28; i < Math.min(40, line52.length); i++) {
  console.log('  pos ' + i + ': char=' + JSON.stringify(line52[i]) + ' code=' + line52.charCodeAt(i))
}

// The REAL backtick is char code 96
// Common corruptions: 
//   8216 = ' (left single quote)
//   8217 = ' (right single quote)  
//   96 = ` (correct backtick)
//   180 = ´ (acute accent)

let totalFixed = 0

for (const dir of dirs) {
  for (const file of getAllPages(dir)) {
    const winFile = file.replace(/\//g, path.sep)
    let content = fs.readFileSync(winFile, 'utf8')
    const original = content

    // Replace curly/smart quotes that got substituted for backticks in template literals
    // These are the common culprits when encoding goes wrong
    content = content
      .replace(/\u2018/g, '`')  // left single quote '
      .replace(/\u2019/g, '`')  // right single quote '
      .replace(/\u00b4/g, '`')  // acute accent ´
      .replace(/\u0060/g, '`')  // should already be backtick but normalize

    if (content !== original) {
      fs.writeFileSync(winFile, content, 'utf8')
      console.log('FIXED: ' + file.replace('apps/web/src/app/', ''))
      totalFixed++
    }
  }
}

console.log('\nTotal fixed: ' + totalFixed)
