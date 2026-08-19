const fs = require('fs')
const path = require('path')
function read(f) { return fs.readFileSync(f.replace(/\//g, path.sep), 'utf8') }

// timetable2 lines 108-125
console.log('\n=== timetable2 lines 108-125 ===')
read('apps/web/src/app/admin/timetable2/page.tsx').split('\n').slice(107,125).forEach((l,i)=>console.log((i+108)+': '+JSON.stringify(l)))

// jamb lines 205-215
console.log('\n=== jamb lines 178-215 ===')
read('apps/web/src/app/student/jamb/page.tsx').split('\n').slice(177,215).forEach((l,i)=>console.log((i+178)+': '+JSON.stringify(l)))

// report-card lines 152-163
console.log('\n=== report-card lines 152-163 ===')
read('apps/web/src/app/admin/report-card/page.tsx').split('\n').slice(151,163).forEach((l,i)=>console.log((i+152)+': '+JSON.stringify(l)))
