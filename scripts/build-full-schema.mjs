import fs from 'node:fs';
import path from 'node:path';

const dir = './supabase/migrations';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

let combined = '-- =============================================================\n';
combined += '-- DigiMenu Complete Schema (All 28 Migrations Combined in Order)\n';
combined += '-- Run this first in Supabase SQL Editor before running seed.sql\n';
combined += '-- =============================================================\n\n';

for (const f of files) {
  combined += `-- >>>>> MIGRATION: ${f} >>>>>\n\n`;
  combined += fs.readFileSync(path.join(dir, f), 'utf8');
  combined += '\n\n';
}

fs.writeFileSync('./supabase/full-schema.sql', combined, 'utf8');
console.log('Successfully written full-schema.sql, total size:', combined.length, 'bytes');
