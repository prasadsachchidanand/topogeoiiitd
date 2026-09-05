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

function initialMarkup(html) {
  const body = html.match(/<body\b[\s\S]*?<\/body>/i)?.[0] || html;
  return body.replace(/<script\b[\s\S]*?<\/script>/gi, '');
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

for (const required of ['index.html', 'schedule/index.html', 'archive/index.html', 'assets/site.css', 'data/talks.json', 'sitemap.xml', 'robots.txt', 'feed.xml', 'calendar.ics']) {
  if (!fs.existsSync(path.join(dist, required))) errors.push(`Missing ${required}`);
}

const seriesFiles = fs.readdirSync(path.join(dist, 'series'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dist, 'series', entry.name, 'index.html')))
  .map((entry) => path.join(dist, 'series', entry.name, 'index.html'));

const htmlFiles = walk(dist).filter((file) => file.endsWith('.html'));
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const relative = path.relative(dist, file);
  const markup = initialMarkup(html);
  if (/__SERIES_[A-Z_]+__/.test(html)) errors.push(`${relative}: unresolved series-template placeholder.`);
  if (/<html\b/i.test(html) && !/<title[^>]*>[^<]+<\/title>/.test(html)) errors.push(`${relative}: missing page title.`);
  if (/<html\b/i.test(html) && (html.match(/<!doctype html>/gi) || []).length !== 1) errors.push(`${relative}: expected exactly one doctype.`);
  if (html.includes('cdn.tailwindcss.com')) errors.push(`${relative}: Tailwind development CDN is still present.`);
  if (/<html\b/i.test(html) && !html.includes('/assets/site.css?')) errors.push(`${relative}: missing production CSS bundle.`);
  if (/^(?:index|schedule\/index|archive\/index|series\/.*\/index)\.html$/.test(relative)) {
    if (!markup.includes('<nav')) errors.push(`${relative}: navbar is not in the initial HTML.`);
    if (!markup.includes('<footer')) errors.push(`${relative}: footer is not in the initial HTML.`);
    if (/Loading(?: talks)?\.\.\./i.test(markup)) errors.push(`${relative}: loading placeholder remains in the initial HTML.`);
    if ((markup.match(/<h1\b/gi) || []).length !== 1) errors.push(`${relative}: expected one visible h1 heading.`);
  }
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (match[1].includes('${')) continue;
    const target = localTarget(match[1]);
    if (target && !fs.existsSync(target)) errors.push(`${relative}: broken local reference ${match[1]}`);
  }
}

const talks = JSON.parse(fs.readFileSync(path.join(dist, 'data', 'talks.json'), 'utf8'));
const expectedSeries = new Set(talks.map((talk) => String(talk.seriesLink).replace(basePath, '').match(/\/series\/([^/]+)/)?.[1]).filter(Boolean));
for (const slug of expectedSeries) {
  const seriesFile = path.join(dist, 'series', slug, 'index.html');
  if (!fs.existsSync(seriesFile)) {
    errors.push(`Missing generated series page: ${slug}`);
    continue;
  }
  const markup = initialMarkup(fs.readFileSync(seriesFile, 'utf8'));
  for (const talk of talks.filter((item) => String(item.seriesLink).includes(`/series/${slug}/`))) {
    if (!markup.includes(`id="${talk.id}"`)) errors.push(`series/${slug}/index.html: ${talk.id} is not pre-rendered.`);
  }
}

const homepage = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!homepage.includes('name="google-site-verification"')) errors.push('index.html: missing Google site verification tag.');
if (!initialMarkup(homepage).includes('id="upcoming-talks"')) errors.push('index.html: missing upcoming talks content.');

const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
const today = new Date().toISOString().slice(0, 10);
for (const match of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
  if (match[1] > today) errors.push(`sitemap.xml: future lastmod date ${match[1]}.`);
}

if (errors.length) {
  console.error(`Validation failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(`Validated ${talks.length} talks and ${expectedSeries.size} series, including links, metadata, CSS, and pre-rendered content.`);
