'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const dataDir = path.join(root, 'data');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));

config.siteUrl = String(process.env.SITE_URL || config.siteUrl).replace(/\/+$/, '');
config.basePath = String(process.env.BASE_PATH ?? config.basePath ?? '').trim();
if (config.basePath && !config.basePath.startsWith('/')) config.basePath = `/${config.basePath}`;
config.basePath = config.basePath.replace(/\/+$/, '');
if (!/^https?:\/\//.test(config.siteUrl)) throw new Error('siteUrl must be a complete https:// URL.');

const now = process.env.BUILD_NOW ? new Date(process.env.BUILD_NOW) : new Date();
if (Number.isNaN(now.getTime())) throw new Error('BUILD_NOW is invalid.');
const assetVersion = String(process.env.GITHUB_SHA || now.getTime()).slice(0, 12);

const read = (file) => fs.readFileSync(file, 'utf8');
const write = (relative, contents) => {
  const target = path.join(dist, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeXml(value = '') {
  return escapeHtml(value).replaceAll('&#039;', '&apos;');
}

function stripMarkup(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\(?:operatorname|mathrm|mathbf|mathbb|mathcal|text)\{([^}]*)\}/g, '$1')
    .replace(/[\\${}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value, max = 158) {
  const clean = stripMarkup(value);
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function slugify(value) {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function pathUrl(value = '/') {
  const clean = `/${String(value).replace(/^\/+/, '')}`;
  return `${config.basePath}${clean}` || '/';
}

function absoluteUrl(value = '/') {
  return `${config.siteUrl}${pathUrl(value)}`;
}

function parseStart(date, time) {
  const clock = String(time || '').match(/(\d{1,2}):(\d{2})/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !clock) return null;
  const iso = `${date}T${String(clock[1]).padStart(2, '0')}:${clock[2]}:00+05:30`;
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? null : { iso, instant };
}

function slugFromLink(link = '') {
  return String(link).match(/\/series\/([^/]+)/)?.[1] || '';
}

function uniqueReferences(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.citation) return false;
    const key = `${item.type || ''}|${item.citation}|${item.url || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadContent() {
  const files = fs.readdirSync(dataDir).filter((file) => file.endsWith('.json') && !file.startsWith('_') && file !== 'talks.json').sort();
  const usedIds = new Set();
  return files.map((filename) => {
    const parsed = JSON.parse(read(path.join(dataDir, filename)));
    let meta;
    let sourceTalks;
    if (Array.isArray(parsed)) {
      if (!parsed.length) throw new Error(`${filename}: no talks found.`);
      const first = parsed[0];
      meta = {
        slug: slugFromLink(first.seriesLink) || slugify(first.series), name: first.series,
        speaker: first.speaker, affiliation: first.affiliation, personalPage: first.personalPage,
        mail: first.mail, description: first.description, about: parsed.find((talk) => talk.about)?.about || '',
        zoomLink: first.zoomLink, meetingId: first.meetingId, passcode: first.passcode,
        references: uniqueReferences(parsed.flatMap((talk) => talk.references || []))
      };
      sourceTalks = parsed;
    } else if (parsed?.series && Array.isArray(parsed.talks)) {
      meta = { ...parsed.series, slug: parsed.series.slug || path.basename(filename, '.json') };
      meta.references = uniqueReferences(meta.references || []);
      sourceTalks = parsed.talks;
    } else {
      throw new Error(`${filename}: expected a series object with talks.`);
    }

    if (!meta.slug || !meta.name || !meta.speaker) throw new Error(`${filename}: series slug, name, and speaker are required.`);
    const talks = sourceTalks.map((raw, index) => {
      for (const field of ['id', 'title', 'date', 'time', 'abstract']) {
        if (!raw[field]) throw new Error(`${filename}: talks[${index}].${field} is required.`);
      }
      if (usedIds.has(raw.id)) throw new Error(`${filename}: duplicate id ${raw.id}.`);
      usedIds.add(raw.id);
      const start = parseStart(raw.date, raw.time);
      if (!start) throw new Error(`${filename}: invalid date/time for ${raw.id}.`);
      const durationMinutes = Number(raw.durationMinutes ?? config.defaultDurationMinutes);
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        throw new Error(`${filename}: durationMinutes must be a positive number for ${raw.id}.`);
      }
      return {
        ...raw,
        series: raw.series || meta.name,
        speaker: raw.speaker || meta.speaker,
        affiliation: raw.affiliation || meta.affiliation || '',
        personalPage: raw.personalPage || meta.personalPage || '',
        mail: raw.mail || meta.mail || '',
        description: raw.description || meta.description || '',
        about: raw.about || meta.about || '',
        zoomLink: raw.zoomLink || meta.zoomLink || '',
        meetingId: raw.meetingId || meta.meetingId || '',
        passcode: raw.passcode || meta.passcode || '',
        seriesLink: `/series/${meta.slug}/`,
        durationMinutes,
        start: start.instant,
        startIso: start.iso,
        end: new Date(start.instant.getTime() + durationMinutes * 60_000)
      };
    }).sort((a, b) => a.start - b.start);
    return { filename, meta, talks, original: parsed };
  });
}

const collections = loadContent();
const talks = collections.flatMap((collection) => collection.talks).sort((a, b) => a.start - b.start);

function withBasePath(value) {
  if (!config.basePath || typeof value !== 'string') return value;
  return value.startsWith('/') && !value.startsWith('//') ? pathUrl(value) : value;
}

function publicData(value) {
  if (Array.isArray(value)) return value.map(publicData);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicData(item)]));
  return withBasePath(value);
}

function applyBasePath(html) {
  html = html.replace(
    /fetch\((['"])((?:\/|\.\/|\.\.\/)components\/(?:navbar|footer)\.html)\1\)/g,
    "fetch($1$2$1, { cache: 'no-store' })"
  );
  if (!config.basePath) return html;
  return html
    .replace(/(href|src)="\/(?!\/)/g, `$1="${config.basePath}/`)
    .replace(/fetch\((['"])\/(?!\/)/g, `fetch($1${config.basePath}/`);
}

function eventSchema(talk) {
  return {
    '@context': 'https://schema.org', '@type': 'EducationEvent', name: talk.title,
    description: truncate(talk.abstract, 500), startDate: talk.startIso, endDate: talk.end.toISOString(),
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    url: absoluteUrl(talk.seriesLink), location: { '@type': 'VirtualLocation', url: absoluteUrl(talk.seriesLink) },
    performer: { '@type': 'Person', name: talk.speaker, url: talk.personalPage || undefined, affiliation: talk.affiliation ? { '@type': 'Organization', name: talk.affiliation } : undefined },
    organizer: { '@type': 'Organization', name: config.title, url: absoluteUrl('/') }
  };
}

function enhanceHead(html, { title, description, urlPath, schema, robots = 'index, follow' }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(truncate(description));
  const canonical = absoluteUrl(urlPath);
  html = html.replace(/<title([^>]*)>[\s\S]*?<\/title>/i, `<title$1>${safeTitle}</title>`);
  const additions = `
    <meta name="description" content="${safeDescription}">
    <meta name="robots" content="${robots}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)} feed" href="/feed.xml">
    <link rel="alternate" type="text/calendar" title="${escapeHtml(config.title)} calendar" href="/calendar.ics">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escapeHtml(config.title)}">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:image" content="${escapeHtml(absoluteUrl('/assets/logo.png'))}">
    <meta name="twitter:card" content="summary">
    <link rel="stylesheet" href="/assets/theme.css?v=${assetVersion}">
    <script src="/assets/theme.js?v=${assetVersion}"></script>
    ${schema ? `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>` : ''}`;
  return html.replace('</head>', `${additions}\n</head>`);
}

function copyDirectory(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (item) => !item.endsWith('.DS_Store') && !item.includes(`${path.sep}dist${path.sep}`)
  });
}

function buildStaticFiles() {
  for (const directory of ['assets', 'components', 'notes', 'register', 'series']) {
    copyDirectory(path.join(root, directory), path.join(dist, directory));
  }
  for (const component of ['navbar.html', 'footer.html']) {
    const target = path.join(dist, 'components', component);
    fs.writeFileSync(target, applyBasePath(read(target)));
  }
  write('latex2Json.html', read(path.join(root, 'latex2Json.html')));

  const organization = {
    '@context': 'https://schema.org', '@type': 'Organization', name: config.title,
    url: absoluteUrl('/'), logo: absoluteUrl('/assets/logo.png'), email: config.contactEmail,
    parentOrganization: { '@type': 'CollegeOrUniversity', name: config.institution, url: 'https://www.iiitd.ac.in/' }, sameAs: [config.youtubeUrl]
  };
  write('index.html', applyBasePath(enhanceHead(read(path.join(root, 'index.html')), {
    title: `${config.title} - ${config.institution}`, description: config.description, urlPath: '/', schema: organization
  })));
  write('schedule/index.html', applyBasePath(enhanceHead(read(path.join(root, 'schedule', 'index.html')), {
    title: `Schedule - ${config.title} - ${config.institution}`, description: `Upcoming ${config.title} talks at ${config.institution}.`, urlPath: '/schedule/'
  })));
  write('archive/index.html', applyBasePath(enhanceHead(read(path.join(root, 'archive', 'index.html')), {
    title: `Archive - ${config.title} - ${config.institution}`, description: `Past topology and geometry talks, lecture series, recordings, and notes at ${config.institution}.`, urlPath: '/archive/'
  })));

  for (const page of ['index.html', 'admin.html']) {
    const source = path.join(root, 'register', page);
    const target = path.join(dist, 'register', page);
    const urlPath = `/register/${page === 'index.html' ? '' : page}`;
    fs.writeFileSync(target, applyBasePath(enhanceHead(read(source), {
      title: page === 'index.html' ? `Subscribe - ${config.title}` : `Administration - ${config.title}`,
      description: `Registration for the ${config.title}.`, urlPath, robots: 'noindex, nofollow'
    })));
  }
}

function buildData() {
  fs.mkdirSync(path.join(dist, 'data'), { recursive: true });
  collections.forEach((collection) => {
    const normalized = {
      series: publicData({ ...collection.meta }),
      talks: publicData(collection.talks.map(({ start, startIso, end, ...talk }) => talk))
    };
    write(`data/${collection.filename}`, JSON.stringify(normalized, null, 2));
  });
  const merged = talks.map(({ start, startIso, end, ...talk }) => publicData(talk));
  write('data/talks.json', JSON.stringify(merged, null, 2));
}

function buildSeriesPages() {
  const template = read(path.join(root, 'series-template.html'));
  collections.forEach((collection) => {
    const { meta } = collection;
    const jsName = String(meta.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
    let html = template
      .replaceAll('__SERIES_SLUG__', meta.slug)
      .replaceAll('__SERIES_DATA_URL__', pathUrl(`/data/${collection.filename}`))
      .replaceAll('__SERIES_NAME_JS__', jsName);
    html = enhanceHead(html, {
      title: `${meta.name} - ${config.title}`,
      description: meta.description || `${meta.name}, a lecture series by ${meta.speaker}.`,
      urlPath: `/series/${meta.slug}/`, schema: collection.talks.map(eventSchema)
    });
    write(`series/${meta.slug}/index.html`, applyBasePath(html));
  });
}

function icsEscape(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildFeeds() {
  const events = talks.map((talk) => `BEGIN:VEVENT\r\nUID:${icsEscape(talk.id)}@topogeoiiitd\r\nDTSTAMP:${icsDate(now)}\r\nDTSTART:${icsDate(talk.start)}\r\nDTEND:${icsDate(talk.end)}\r\nSUMMARY:${icsEscape(talk.title)}\r\nDESCRIPTION:${icsEscape(`Speaker: ${talk.speaker}\n${talk.abstract}\n\n${absoluteUrl(talk.seriesLink)}`)}\r\nLOCATION:Online\r\nURL:${absoluteUrl(talk.seriesLink)}\r\nEND:VEVENT`).join('\r\n');
  write('calendar.ics', `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//${icsEscape(config.title)}//EN\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:${icsEscape(config.title)}\r\n${events}\r\nEND:VCALENDAR\r\n`);

  const items = [...talks].sort((a, b) => b.start - a.start).slice(0, 30).map((talk) => `<item><title>${escapeXml(talk.title)}</title><link>${escapeXml(absoluteUrl(talk.seriesLink))}</link><guid>${escapeXml(`${absoluteUrl(talk.seriesLink)}#${talk.id}`)}</guid><pubDate>${talk.start.toUTCString()}</pubDate><description>${escapeXml(truncate(`${talk.speaker}. ${talk.abstract}`, 500))}</description></item>`).join('\n');
  write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${escapeXml(config.title)}</title><link>${escapeXml(absoluteUrl('/'))}</link><description>${escapeXml(config.description)}</description>${items}</channel></rss>\n`);
}

function buildSeoFiles() {
  const latest = talks.at(-1)?.date || now.toISOString().slice(0, 10);
  const paths = ['/', '/schedule/', '/archive/', ...collections.map((collection) => `/series/${collection.meta.slug}/`)];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((item) => `  <url><loc>${escapeXml(absoluteUrl(item))}</loc><lastmod>${latest}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`);
  write('manifest.webmanifest', JSON.stringify({ name: config.title, short_name: 'TopoGeo IIITD', start_url: pathUrl('/'), display: 'standalone', background_color: '#f9fafb', theme_color: '#1e3a8a', icons: [{ src: pathUrl('/assets/logo.png'), sizes: '1024x1024', type: 'image/png' }] }, null, 2));
}

function build() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  buildStaticFiles();
  buildData();
  buildSeriesPages();
  buildFeeds();
  buildSeoFiles();
  console.log(`Built the original design with ${talks.length} talks and ${collections.length} automatic series pages.`);
}

build();
