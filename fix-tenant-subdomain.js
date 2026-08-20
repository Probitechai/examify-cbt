// fix-tenant-subdomain.js
// Run from C:\Probitechai\examify:  node fix-tenant-subdomain.js

const fs = require('fs')
const path = require('path')

const filePath = 'apps/api/src/middleware/tenant.ts'.replace(/\//g, path.sep)
let src = fs.readFileSync(filePath, 'utf8')

const oldStr = `  subdomain = headerSubdomain ?? hostSubdomain`

const newStr = `  subdomain = headerSubdomain ?? hostSubdomain

  // Fallback: read subdomain from request body (used by login form on non-subdomain URLs)
  if (!subdomain) {
    try {
      const body = request.body as any
      if (body?.subdomain) subdomain = body.subdomain
    } catch {}
  }`

if (src.includes(oldStr)) {
  fs.writeFileSync(filePath, src.replace(oldStr, newStr), 'utf8')
  console.log('FIXED: tenant.ts updated')
  console.log('Now run: git add . && git commit -m "Fix: read subdomain from body in tenant middleware" && git push')
} else {
  console.log('PATTERN NOT FOUND - showing line 21:')
  const lines = src.split('\n')
  console.log(JSON.stringify(lines[20]))
}
