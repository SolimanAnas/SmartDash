import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(ROOT, 'data', 'roster.json');
const raw = readFileSync(path, 'utf8');
const data = JSON.parse(raw);

data.staff.forEach((s, i) => {
  s.name = 'Staff ' + String(i + 1).padStart(3, '0');
  s.phone = '050XXXXXXX';
  s.id = String(i + 1).padStart(4, '0');
});

writeFileSync(path, JSON.stringify(data));
console.log('Anonymized ' + data.staff.length + ' staff');

// verify
const v = JSON.parse(readFileSync(path, 'utf8'));
const s0 = v.staff[0];
console.log('shifts isArray:', Array.isArray(s0.shifts));
console.log('shifts type:', typeof s0.shifts);
console.log('shifts len:', s0.shifts.length);
console.log('shifts[0..4]:', s0.shifts.slice(0, 5).join(','));
