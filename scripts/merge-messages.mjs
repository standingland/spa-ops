// Usage: node scripts/merge-messages.mjs <th-patch.json> <en-patch.json>
// Deep-merges a patch into messages/th.json and messages/en.json.
import fs from 'node:fs';

function merge(a, b) {
  for (const [k, v] of Object.entries(b)) {
    a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] ?? {}, v) : v;
  }
  return a;
}
const [thPatch, enPatch] = process.argv.slice(2);
for (const [file, patch] of [['messages/th.json', thPatch], ['messages/en.json', enPatch]]) {
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  const merged = merge(base, JSON.parse(fs.readFileSync(patch, 'utf8')));
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
}
