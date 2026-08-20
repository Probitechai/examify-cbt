const fs = require('fs')
const path = require('path')

const filePath = 'apps/api/src/middleware/tenant.ts'.replace(/\//g, path.sep)
let src = fs.readFileSync(filePath, 'utf8')

const oldStr = `  if (request.url.startsWith('/api/admissions/pay/')) return`
const newStr = `  if (request.url.startsWith('/api/admissions/pay/')) return
  if (request.method === 'OPTIONS') return`

if (src.includes(oldStr)) {
  fs.writeFileSync(filePath, src.replace(oldStr, newStr), 'utf8')
  console.log('FIXED: OPTIONS preflight requests now bypass tenant middleware')
} else {
  console.log('PATTERN NOT FOUND')
  src.split('\n').slice(8,13).forEach((l,i) => console.log((i+9)+': '+JSON.stringify(l)))
}
