const fs = require('fs');
const path = require('path');

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) results.push(full);
  }
  return results;
}

const files = walk('apps/web/src');
const pattern = /ðŸ|â€|â±|â˜|âš|â†/;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (pattern.test(content)) {
    console.log(file);
  }
}