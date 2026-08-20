const fs = require('fs')
const path = require('path')

const filePath = 'apps/api/src/middleware/tenant.ts'.replace(/\//g, path.sep)
let src = fs.readFileSync(filePath, 'utf8')

// Replace the simple OPTIONS return with a proper CORS preflight response
const oldStr = `  if (request.method === 'OPTIONS') return`
const newStr = `  if (request.method === 'OPTIONS') {
    const origin = request.headers['origin'] ?? '*'
    reply
      .header('Access-Control-Allow-Origin', origin)
      .header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      .header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-School-Subdomain')
      .header('Access-Control-Allow-Credentials', 'true')
      .header('Access-Control-Max-Age', '86400')
      .status(204)
      .send()
    return
  }`

if (src.includes(oldStr)) {
  fs.writeFileSync(filePath, src.replace(oldStr, newStr), 'utf8')
  console.log('FIXED: OPTIONS preflight now returns proper CORS headers')
} else {
  console.log('PATTERN NOT FOUND')
  src.split('\n').slice(8,14).forEach((l,i) => console.log((i+9)+': '+JSON.stringify(l)))
}
