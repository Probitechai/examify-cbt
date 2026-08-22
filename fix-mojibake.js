const fs = require('fs');
const iconv = require('iconv-lite');

const files = [
  'apps/web/src/app/admin/users/import/page.tsx',
];

for (const file of files) {
  const corrupted = fs.readFileSync(file, 'utf8');
  const bytes = iconv.encode(corrupted, 'win1252');
  const fixed = iconv.decode(bytes, 'utf8');
  fs.writeFileSync(file, fixed, 'utf8');
  console.log('Fixed:', file);
}