'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const basePath = String(process.env.BASE_PATH ?? config.basePath ?? '').replace(/\/+$/, '');
const errors = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function visibleMarkup(html) {
  return html.slice(html.search(/<body\b/i), html.search(/<script\b/i)).replaceAll(basePath, '');
}

function localTarget(value) {
  if (!value || value.startsWith('#') || /^(?:https?:|mailto:|tel:|data:|javascript:)/.test(value)) return null;
  let clean = value.split(/[?#]/)[0];
  if (basePath && clean.startsWith(basePath)) clean = clean.slice(basePath.length);
  clean = decodeURIComponent(clean.replace(/^\/+/, ''));
  return clean.endsWith('/') || !path.extname(clean) ? path.join(dist, clean, 'index.html') : path.join(dist, clean);
}

if (!fs.existsSync(dist)) {
  console.error('dist/ is missing. Run npm run build first.');
  process.exit(1);
}

for (const required of ['index.html', 'schedule/index.html', 'archive/index.html', 'data/talks.json', 'sitemap.xml', 'robots.txt', 'feed.xml', 'calendar.ics']) {
  if (!fs.existsSync(path.join(dist, required))) errors.push(`Missing ${required}`);
}

for (const relative of ['index.html', 'schedule/index.html', 'archive/index.html']) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const generated = fs.readFileSync(path.join(dist, relative), 'utf8');
  if (visibleMarkup(source) !== visibleMarkup(generated)) errors.push(`${relative}: visible structure differs from the original design.`);
}

const template = fs.readFileSync(path.join(root, 'series-template.html'), 'utf8');
const seriesFiles = fs.readdirSync(path.join(dist, 'series'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dist, 'series', entry.name, 'index.html')))
  .map((entry) => path.join(dist, 'series', entry.name, 'index.html'));
for (const file of seriesFiles) {
  if (visibleMarkup(template) !== visibleMarkup(fs.readFileSync(file, 'utf8'))) {
    errors.push(`${path.relative(dist, file)}: visible structure differs from series-template.html.`);
  }
}

const htmlFiles = walk(dist).filter((file) => file.endsWith('.html'));
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const relative = path.relative(dist, file);
  if (/__SERIES_[A-Z_]+__/.test(html)) errors.push(`${relative}: unresolved series-template placeholder.`);
  if (/<html\b/i.test(html) && !/<title[^>]*>[^<]+<\/title>/.test(html)) errors.push(`${relative}: missing page title.`);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (match[1].includes('${')) continue;
    const target = localTarget(match[1]);
    if (target && !fs.existsSync(target)) errors.push(`${relative}: broken local reference ${match[1]}`);
  }
}

const talks = JSON.parse(fs.readFileSync(path.join(dist, 'data', 'talks.json'), 'utf8'));
const expectedSeries = new Set(talks.map((talk) => String(talk.seriesLink).replace(basePath, '').match(/\/series\/([^/]+)/)?.[1]).filter(Boolean));
for (const slug of expectedSeries) {
  if (!fs.existsSync(path.join(dist, 'series', slug, 'index.html'))) errors.push(`Missing generated series page: ${slug}`);
}

if (errors.length) {
  console.error(`Validation failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(`Validated ${talks.length} talks and ${expectedSeries.size} series. Visual structure matches the original pages.`);
