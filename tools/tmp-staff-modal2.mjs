import fs from "node:fs";
const p = "index.html";
let c = fs.readFileSync(p, "utf8");
const start = c.indexOf('<div id="staff-modal"');
let depth = 0;
let i = start;
for (; i < c.length; i++) {
  if (c.slice(i, i+5) === '<div ') depth++;
  else if (c.slice(i, i+6) === '</div>') { depth--; if (depth === 0) { i += 6; break; } }
}
const old = c.slice(start, i);
console.log("OLD LENGTH:", old.length);
console.log("OLD:");
console.log(old);
console.log("---END---");