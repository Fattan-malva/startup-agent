import fs from "node:fs";
const p = "index.html";
let c = fs.readFileSync(p, "utf8");
const start = c.indexOf('<div id="staff-modal"');
const end = c.indexOf('</div>', start + 1);
if (start === -1) { console.log("NOT FOUND"); process.exit(1); }
let depth = 0;
let i = start;
for (; i < c.length; i++) {
  if (c.slice(i, i+5) === '<div ') depth++;
  else if (c.slice(i, i+6) === '</div>') { depth--; if (depth === 0) { i += 6; break; } }
}
const old = c.slice(start, i);
console.log("OLD LENGTH:", old.length);
console.log(old.slice(0, 200));
fs.writeFileSync("old-modal.txt", old);