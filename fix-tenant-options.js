const fs = require('fs')
const path = require('path')

const filePath = 'apps/api/src/middleware/tenant.ts'.replace(/\//g, path.sep)
let src = fs.readFileSync(filePath, 'utf8')

// Find the start of the middleware function and add OPTIONS bypass
// Look for the line that reads the host header
const oldStr = `  const host = request.headers['host'] ?? ''`
const newStr = `  // Skip tenant resolution for CORS preflight requests
  if (request.method === 'OPTIONS') {
    return
  }

  const host = request.headers['host'] ?? ''`

if (src.includes(oldStr)) {
  fs.writeFileSync(filePath, src.replace(oldStr, newStr), 'utf8')
  console.log('FIXED: tenant middleware now skips OPTIONS preflight requests')
} else {
  console.log('PATTERN NOT FOUND - showing first 20 lines:')
  src.split('\n').slice(0,20).forEach((l,i) => console.log((i+1)+': '+l))
}
