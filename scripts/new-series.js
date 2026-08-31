'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const slug = process.argv.slice(2).find((argument) => !argument.startsWith('-')) || '';
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: npm run new-series -- short-lowercase-slug');
  process.exit(1);
}
const target = path.join(root, 'data', `${slug}.json`);
if (fs.existsSync(target)) {
  console.error(`data/${slug}.json already exists.`);
  process.exit(1);
}
const template = fs.readFileSync(path.join(root, 'data', '_template.json'), 'utf8').replace('replace-with-series-url', slug);
fs.writeFileSync(target, template);
console.log(`Created data/${slug}.json. Edit it and run npm run dev.`);
