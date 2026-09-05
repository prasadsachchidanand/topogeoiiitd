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

function formatDate(talk) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  }).format(talk.start);
}

function formatTime(talk) {
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    hour: '2-digit', minute: '2-digit'
  }).format(talk.start);
  return `${clock} IST`;
}

function isUpcoming(talk) {
  return talk.end >= now;
}

function publicAbstract(value = '') {
  return String(value).replace(/\r?\n/g, '<br>');
}

function zoomCard(talk) {
  if (!isUpcoming(talk)) {
    return `<div class="bg-gray-100 p-4 rounded-lg">
      <h4 class="font-bold mb-2 text-gray-600"><i class="fas fa-check-circle mr-1"></i> Talk Concluded</h4>
      <p class="text-gray-500 text-sm">${talk.recording ? 'This talk has ended — see the recording.' : 'This talk has ended.'}</p>
    </div>`;
  }
  return `<div class="bg-blue-50 p-4 rounded-lg">
    <h4 class="font-bold mb-2 text-blue-800">Zoom Meeting</h4>
    <p class="mb-2"><span class="font-medium text-gray-700">Link:</span> ${talk.zoomLink ? `<a href="${escapeHtml(talk.zoomLink)}" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">Join Meeting</a>` : 'TBA'}</p>
    <p class="mb-2"><span class="font-medium text-gray-700">Meeting ID:</span> ${escapeHtml(talk.meetingId || 'TBA')}</p>
    <p><span class="font-medium text-gray-700">Passcode:</span> ${escapeHtml(talk.passcode || 'TBA')}</p>
  </div>`;
}

function resources(talk) {
  if (!talk.recording && !talk.notes) return '';
  return `<div class="mt-4 pt-4 border-t border-gray-200">
    <h4 class="font-semibold text-gray-800 mb-2">Post-Lecture Resources:</h4>
    <div class="flex flex-wrap gap-3">
      ${talk.recording ? `<a href="${escapeHtml(talk.recording)}" class="inline-flex items-center px-3 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors" target="_blank" rel="noopener noreferrer"><i class="fas fa-video mr-2"></i>Watch Recording</a>` : ''}
      ${talk.notes ? `<a href="${escapeHtml(talk.notes)}" class="inline-flex items-center px-3 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 transition-colors" target="_blank"><i class="fas fa-file-alt mr-2"></i>Lecture Notes</a>` : ''}
    </div>
  </div>`;
}

function homepageTalk(talk) {
  if (!talk) return '<p class="text-gray-600">No upcoming talks scheduled at this time. Check back later!</p>';
  return `<div id="${escapeHtml(talk.id)}" class="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500 scroll-mt-24">
    <div class="flex flex-col md:flex-row justify-between gap-4">
      <div class="max-w-full md:max-w-[65%]">
        <h3 class="text-xl font-bold text-blue-700">${escapeHtml(talk.title)}</h3>
        <p class="text-gray-600 mb-2">Speaker: ${talk.personalPage ? `<a href="${escapeHtml(talk.personalPage)}" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">${escapeHtml(talk.speaker)}</a>` : escapeHtml(talk.speaker)}</p>
        <p class="text-gray-600 mb-2">${escapeHtml(talk.series)}${talk.part ? ` - ${escapeHtml(talk.part)}` : ''}</p>
        <p class="text-gray-700 mb-2 flex items-center"><i class="far fa-calendar-alt mr-2"></i>${formatDate(talk)}</p>
        <p class="text-gray-700 mb-4 flex items-center"><i class="far fa-clock mr-2"></i>${formatTime(talk)}</p>
        ${talk.abstract ? `<p class="text-gray-700 mb-4 text-justify"><strong>Abstract:</strong> ${publicAbstract(talk.abstract)}</p>` : ''}
        <a href="${escapeHtml(talk.seriesLink)}#${escapeHtml(talk.id)}" class="text-blue-600 hover:underline">View Series Details</a>
      </div>
      <div class="w-full md:w-1/3">${zoomCard(talk)}</div>
    </div>
  </div>`;
}

function scheduleTalk(talk) {
  return `<div id="${escapeHtml(talk.id)}" class="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500 scroll-mt-24">
    <div class="flex flex-col md:flex-row justify-between gap-4">
      <div class="max-w-full md:max-w-[65%]">
        <h3 class="text-xl font-bold text-blue-700">${escapeHtml(talk.title)}</h3>
        <p class="text-gray-600 mb-2">Speaker: ${talk.personalPage ? `<a href="${escapeHtml(talk.personalPage)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${escapeHtml(talk.speaker)}</a>` : escapeHtml(talk.speaker)}</p>
        <p class="text-gray-600 mb-2">${escapeHtml(talk.series)}${talk.part ? ` - ${escapeHtml(talk.part)}` : ''}</p>
        <p class="text-gray-700 mb-2 flex items-center"><i class="far fa-calendar-alt mr-2"></i>${formatDate(talk)}</p>
        <p class="text-gray-700 mb-4 flex items-center"><i class="far fa-clock mr-2"></i>${formatTime(talk)}</p>
        ${talk.abstract ? `<p class="text-gray-700 mb-4 text-justify"><strong>Abstract:</strong> ${publicAbstract(talk.abstract)}</p>` : ''}
        <a href="${escapeHtml(talk.seriesLink)}#${escapeHtml(talk.id)}" class="text-blue-600 hover:underline">View Series Details</a>
      </div>
      <div class="w-full md:w-1/3">${zoomCard(talk)}
        <button class="calendar-btn mt-3 w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 focus:outline-none transition-colors flex items-center justify-center" data-talk-id="${escapeHtml(talk.id)}"><i class="fas fa-calendar-plus mr-2"></i>Add to Calendar</button>
      </div>
    </div>
  </div>`;
}

function scheduleMarkup(items) {
  if (!items.length) return '<p class="text-gray-600 text-center py-8">No upcoming talks scheduled at this time.</p>';
  const grouped = new Map();
  items.forEach((talk) => grouped.set(talk.series, [...(grouped.get(talk.series) || []), talk]));
  return [...grouped].map(([series, seriesTalks]) => {
    const id = slugify(series);
    return `<div class="border border-gray-200 rounded-lg">
      <button class="accordion-btn w-full text-left p-4 bg-blue-100 text-blue-800 font-semibold flex justify-between items-center hover:bg-blue-200 focus:outline-none transition-colors" data-target="${id}-talks">${escapeHtml(series)} (${seriesTalks.length} talk${seriesTalks.length === 1 ? '' : 's'})<i class="fas fa-chevron-down transition-transform"></i></button>
      <div class="accordion-content space-y-8 p-4 hidden" id="${id}-talks">${seriesTalks.map(scheduleTalk).join('')}</div>
    </div>`;
  }).join('');
}

function archiveMarkup(items) {
  if (!items.length) return '<div class="bg-white rounded-lg shadow-md p-6"><p class="text-gray-600 text-center">No past talks are available yet.</p></div>';
  const grouped = new Map();
  items.forEach((talk) => grouped.set(talk.series, [...(grouped.get(talk.series) || []), talk]));
  return [...grouped]
    .sort((a, b) => Math.max(...b[1].map((talk) => talk.start)) - Math.max(...a[1].map((talk) => talk.start)))
    .slice(0, 6)
    .map(([series, seriesTalks], index) => {
      const id = slugify(series);
      const color = ['series-badge-blue', 'series-badge-green', 'series-badge-purple', 'series-badge-orange', 'series-badge-pink', 'series-badge-indigo'][index % 6];
      const cards = seriesTalks.map((talk) => `<div id="${escapeHtml(talk.id)}" class="talk-card border-t border-gray-200 p-6 scroll-mt-24">
        <div class="flex flex-col md:flex-row justify-between gap-6">
          <div class="content">
            <h3 class="text-xl font-bold text-blue-700 mb-2">${escapeHtml(talk.title)}</h3>
            ${talk.part ? `<p class="text-gray-600 mb-3 font-medium">${escapeHtml(talk.part)} of the series</p>` : ''}
            <div class="flex flex-wrap gap-4 mb-4 text-gray-700">
              <p class="flex items-center"><i class="far fa-calendar-alt mr-2 text-blue-600"></i>${formatDate(talk)}</p>
              <p class="flex items-center"><i class="far fa-clock mr-2 text-blue-600"></i>${formatTime(talk)}</p>
            </div>
            ${talk.speaker ? `<div class="mb-4 p-3 bg-gray-50 rounded-lg"><p class="font-medium text-gray-800"><i class="fas fa-user mr-2 text-blue-600"></i>Speaker: ${escapeHtml(talk.speaker)}${talk.affiliation ? `, ${escapeHtml(talk.affiliation)}` : ''}</p></div>` : ''}
            ${talk.abstract ? `<div class="mb-4"><p class="text-gray-700 text-justify"><strong class="text-gray-800">Abstract:</strong> ${publicAbstract(talk.abstract)}</p></div>` : ''}
            ${resources(talk)}
          </div>
          <div class="w-full md:w-1/3"><div class="bg-blue-50 p-4 rounded-lg">
            <h4 class="font-bold mb-3 text-blue-800 flex items-center"><i class="fas fa-link mr-2"></i>Quick Links</h4>
            <div class="space-y-2"><a href="${escapeHtml(talk.seriesLink)}#${escapeHtml(talk.id)}" class="block text-blue-600 hover:text-blue-800 hover:underline transition-colors"><i class="fas fa-info-circle mr-2"></i>View Series Details</a></div>
          </div></div>
        </div>
      </div>`).join('');
      return `<div class="bg-white rounded-lg shadow-md border border-gray-200">
        <button class="accordion-button w-full text-left p-6 bg-blue-50 text-blue-800 font-bold text-lg flex justify-between items-center hover:bg-blue-100 focus:outline-none transition-colors rounded-t-lg" onclick="toggleSeries(this, '${id}')">${escapeHtml(series)}<span class="flex items-center gap-3"><span class="${color} px-3 py-1 rounded-full text-sm font-medium">${seriesTalks.length} talk${seriesTalks.length === 1 ? '' : 's'}</span><i class="fas fa-chevron-down chevron-icon text-blue-600"></i></span></button>
        <div class="accordion-content" id="${id}-talks">${cards}</div>
      </div>`;
    }).join('');
}

function seriesSchedule(collection) {
  return collection.talks.map((talk) => `<div id="${escapeHtml(talk.id)}" class="talk-card bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500 scroll-mt-24">
    <div class="flex flex-col md:flex-row justify-between gap-4">
      <div class="content">
        <h3 class="text-xl font-bold text-blue-700">${escapeHtml(talk.title)}</h3>
        ${talk.part ? `<p class="text-gray-600 mb-2">${escapeHtml(talk.part)} of the series</p>` : ''}
        <p class="text-gray-700 mb-2 flex items-center"><i class="far fa-calendar-alt mr-2"></i>${formatDate(talk)}</p>
        <p class="text-gray-700 mb-4 flex items-center"><i class="far fa-clock mr-2"></i>${formatTime(talk)}</p>
        ${talk.abstract ? `<p class="text-gray-700 mb-4"><strong>Abstract:</strong> ${publicAbstract(talk.abstract)}</p>` : ''}
        ${resources(talk)}
      </div>
      <div class="zoom-details w-full md:w-1/3">${zoomCard(talk)}</div>
    </div>
  </div>`).join('');
}

function referencesMarkup(meta) {
  const refs = uniqueReferences(meta.references || []);
  if (!refs.length) return '';
  const groups = [
    ['book', 'Books'], ['paper', 'Papers'], ['script', 'Lecture Notes']
  ].map(([type, label]) => {
    const matching = refs.filter((ref) => ref.type === type);
    if (!matching.length) return '';
    return `<div${type === 'script' ? '' : ' class="mb-4"'}><h3 class="text-lg font-semibold mb-3 text-blue-700">${label}</h3><ul class="list-disc list-inside text-gray-700 space-y-2">${matching.map((ref) => `<li>${ref.url ? `<a href="${escapeHtml(ref.url)}" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">${escapeHtml(ref.citation)}</a>` : escapeHtml(ref.citation)}</li>`).join('')}</ul></div>`;
  }).join('');
  return `        <!-- References (hidden if no references exist) -->
        <section id="references-section" class="mb-12">
          <h2 class="text-3xl font-bold mb-6 text-blue-800 border-b-2 border-blue-200 pb-2">References</h2>
          <div class="bg-white rounded-lg shadow-md p-6">${groups}</div>
        </section>`;
}

function preRenderSeries(html, collection) {
  const { meta } = collection;
  const personal = meta.personalPage || meta.homepage || meta.website || '';
  html = html
    .replace(/(<h1 id="series-title"[^>]*>)[\s\S]*?(<\/h1>)/, (_, open, close) => `${open}${escapeHtml(meta.name)}${close}`)
    .replace(/(<p class="font-semibold" id="speaker-name">)[\s\S]*?(<\/p>)/, (_, open, close) => `${open}Speaker: ${escapeHtml(meta.speaker)}${close}`)
    .replace(/(<p class="text-lg" id="speaker-affiliation">)[\s\S]*?(<\/p>)/, (_, open, close) => `${open}${escapeHtml(meta.affiliation || '')}${close}`)
    .replace(/(<p id="series-description"[^>]*>)[\s\S]*?(<\/p>)/, (_, open, close) => `${open}${meta.description || ''}${close}`)
    .replace(/<p id="series-prerequisites"[^>]*>[\s\S]*?<\/p>/, () => meta.prerequisites ? `<p id="series-prerequisites" class="text-gray-700"><strong>Prerequisites:</strong> ${meta.prerequisites}</p>` : '<p id="series-prerequisites" class="text-gray-700 hidden"></p>')
    .replace(/(<div id="series-schedule"[^>]*>)[\s\S]*?(<\/div>)/, (_, open, close) => `${open}${seriesSchedule(collection)}${close}`)
    .replace(/        <!-- References \(hidden if no references exist\) -->[\s\S]*?        <!-- Speaker Bio -->/, () => `${referencesMarkup(meta)}\n\n        <!-- Speaker Bio -->`)
    .replace(/<h3 id="speaker-bio-name"[\s\S]*?<\/h3>/, () => `<h3 id="speaker-bio-name" class="text-xl font-bold"><a id="speaker-name-link"${personal ? ` href="${escapeHtml(personal)}" target="_blank" rel="noopener noreferrer"` : ''} class="hover:text-blue-600 transition-colors duration-200">${escapeHtml(meta.speaker)}</a></h3>`)
    .replace(/(<p id="speaker-bio-affiliation"[^>]*>)[\s\S]*?(<\/p>)/, (_, open, close) => `${open}${escapeHtml(meta.affiliation || '')}${close}`)
    .replace(/(<p id="speaker-bio-description"[^>]*>)[\s\S]*?(<\/p>)/, (_, open, close) => `${open}${escapeHtml(meta.about || '')}${close}`)
    .replace(/<a id="speaker-email"[\s\S]*?<\/a>/, () => `<a id="speaker-email"${meta.mail ? ` href="mailto:${escapeHtml(meta.mail)}"` : ''} class="text-blue-600 hover:underline">${escapeHtml(meta.mail || 'Not available')}</a>`)
    .replace(/<div id="speaker-personal-page-container"[^>]*>/, () => `<div id="speaker-personal-page-container" class="flex items-center${personal ? '' : ' hidden'}">`)
    .replace(/<a id="speaker-personal-page"[^>]*>[\s\S]*?<\/a>/, () => `<a id="speaker-personal-page" href="${escapeHtml(personal || '#')}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">Visit Page</a>`);
  return html;
}

function inlineComponents(html) {
  const navbar = read(path.join(root, 'components', 'navbar.html'));
  const footer = read(path.join(root, 'components', 'footer.html'));
  return html
    .replace('<div id="navbar-container"></div>', () => `<div id="navbar-container">${navbar}</div>`)
    .replace('<div id="footer-container" class="mt-auto"></div>', () => `<div id="footer-container" class="mt-auto">${footer}</div>`)
    .replaceAll('await loadNavbar();', 'initializeNavbar();')
    .replaceAll('await loadFooter();', '// Footer is already present in the page.');
}

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
  const talkUrl = `${absoluteUrl(talk.seriesLink)}#${encodeURIComponent(talk.id)}`;
  return {
    '@context': 'https://schema.org', '@type': 'EducationEvent', '@id': talkUrl, name: talk.title,
    description: truncate(talk.abstract, 500), startDate: talk.startIso, endDate: talk.end.toISOString(),
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    url: talkUrl, location: { '@type': 'VirtualLocation', url: talkUrl },
    performer: { '@type': 'Person', name: talk.speaker, url: talk.personalPage || undefined, affiliation: talk.affiliation ? { '@type': 'Organization', name: talk.affiliation } : undefined },
    organizer: { '@type': 'Organization', name: config.title, url: absoluteUrl('/') }
  };
}

function enhanceHead(html, { title, description, urlPath, schema, robots = 'index, follow' }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(truncate(description));
  const canonical = absoluteUrl(urlPath);
  html = html.replace(/<title([^>]*)>[\s\S]*?<\/title>/i, (_, attributes) => `<title${attributes}>${safeTitle}</title>`);
  html = html.replace(/\s*<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/i, '');
  const additions = `
    <meta name="description" content="${safeDescription}">
    <meta name="robots" content="${robots}">
    ${config.googleSiteVerification ? `<meta name="google-site-verification" content="${escapeHtml(config.googleSiteVerification)}">` : ''}
    <meta name="theme-color" content="#1e3a8a">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)} feed" href="/feed.xml">
    <link rel="alternate" type="text/calendar" title="${escapeHtml(config.title)} calendar" href="/calendar.ics">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escapeHtml(config.title)}">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:image" content="${escapeHtml(absoluteUrl('/assets/logo.png'))}">
    <meta name="twitter:card" content="summary">
    <link rel="stylesheet" href="/assets/site.css?v=${assetVersion}">
    <link rel="stylesheet" href="/assets/theme.css?v=${assetVersion}">
    <script src="/assets/theme.js?v=${assetVersion}"></script>
    ${schema ? `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>` : ''}`;
  return html.replace('</head>', () => `${additions}\n</head>`);
}

function copyDirectory(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (item) => !item.endsWith('.DS_Store') && !item.includes(`${path.sep}dist${path.sep}`)
  });
}

function buildStaticFiles() {
  for (const directory of ['assets', 'components', 'notes', 'register']) {
    copyDirectory(path.join(root, directory), path.join(dist, directory));
  }
  for (const component of ['navbar.html', 'footer.html']) {
    const target = path.join(dist, 'components', component);
    fs.writeFileSync(target, applyBasePath(read(target)));
  }
  write('latex2Json.html', applyBasePath(enhanceHead(read(path.join(root, 'latex2Json.html')), {
    title: `Internal JSON Helper - ${config.title}`,
    description: 'Internal content preparation tool.',
    urlPath: '/latex2Json.html',
    robots: 'noindex, nofollow'
  })));

  const organization = {
    '@type': 'Organization', '@id': `${absoluteUrl('/')}#organization`, name: config.title,
    url: absoluteUrl('/'), logo: absoluteUrl('/assets/logo.png'), email: config.contactEmail,
    parentOrganization: { '@type': 'CollegeOrUniversity', name: config.institution, url: 'https://www.iiitd.ac.in/' }, sameAs: [config.youtubeUrl]
  };
  const website = {
    '@type': 'WebSite', '@id': `${absoluteUrl('/')}#website`, url: absoluteUrl('/'),
    name: config.title, description: config.description, publisher: { '@id': organization['@id'] }
  };
  let homepage = read(path.join(root, 'index.html'));
  homepage = homepage.replace('<div id="upcoming-talks" class="space-y-8"></div>', () => `<div id="upcoming-talks" class="space-y-8">${homepageTalk(talks.find(isUpcoming))}</div>`);
  homepage = inlineComponents(homepage);
  write('index.html', applyBasePath(enhanceHead(homepage, {
    title: `${config.title} - ${config.institution}`, description: config.description, urlPath: '/',
    schema: { '@context': 'https://schema.org', '@graph': [organization, website] }
  })));

  let schedulePage = read(path.join(root, 'schedule', 'index.html'));
  schedulePage = schedulePage.replace(/<div id="schedule-talks" class="space-y-4">[\s\S]*?<\/div>\s*<\/section>/, () => `<div id="schedule-talks" class="space-y-4">${scheduleMarkup(talks.filter(isUpcoming))}</div>\n        </section>`);
  schedulePage = inlineComponents(schedulePage);
  write('schedule/index.html', applyBasePath(enhanceHead(schedulePage, {
    title: `Schedule - ${config.title} - ${config.institution}`, description: `Upcoming ${config.title} talks at ${config.institution}.`, urlPath: '/schedule/'
  })));

  let archivePage = read(path.join(root, 'archive', 'index.html'));
  const pastTalks = talks.filter((talk) => talk.end < now).sort((a, b) => b.start - a.start);
  const pastSeriesCount = new Set(pastTalks.map((talk) => talk.series)).size;
  archivePage = archivePage
    .replace('<span id="results-count">Loading talks...</span>', () => `<span id="results-count">Showing ${pastTalks.length} talk${pastTalks.length === 1 ? '' : 's'} across ${pastSeriesCount} series</span>`)
    .replace('<option value="all">All Years</option>', () => `<option value="all">All Years (${pastTalks.length})</option>`)
    .replace(/        <!-- Loading State -->[\s\S]*?        <!-- Archive -->/, '        <div id="loading-state" class="hidden"></div>\n\n        <!-- Archive -->')
    .replace('<section class="mb-12" id="archive-section" style="display: none;">', '<section class="mb-12" id="archive-section">')
    .replace('<div id="archive-talks" class="space-y-6"></div>', () => `<div id="archive-talks" class="space-y-6">${archiveMarkup(pastTalks)}</div>`);
  archivePage = inlineComponents(archivePage);
  write('archive/index.html', applyBasePath(enhanceHead(archivePage, {
    title: `Archive - ${config.title} - ${config.institution}`, description: `Past topology and geometry talks, lecture series, recordings, and notes at ${config.institution}.`, urlPath: '/archive/'
  })));

  for (const page of ['index.html', 'admin.html']) {
    const source = path.join(root, 'register', page);
    const target = path.join(dist, 'register', page);
    const urlPath = `/register/${page === 'index.html' ? '' : page}`;
    fs.writeFileSync(target, applyBasePath(enhanceHead(inlineComponents(read(source)), {
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
      .replaceAll('__SERIES_SLUG__', () => meta.slug)
      .replaceAll('__SERIES_DATA_URL__', () => pathUrl(`/data/${collection.filename}`))
      .replaceAll('__SERIES_NAME_JS__', () => jsName);
    html = preRenderSeries(html, collection);
    html = inlineComponents(html);
    const breadcrumb = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Archive', item: absoluteUrl('/archive/') },
        { '@type': 'ListItem', position: 3, name: meta.name, item: absoluteUrl(`/series/${meta.slug}/`) }
      ]
    };
    html = enhanceHead(html, {
      title: `${meta.name} - ${config.title}`,
      description: meta.description || `${meta.name}, a lecture series by ${meta.speaker}.`,
      urlPath: `/series/${meta.slug}/`, schema: [breadcrumb, ...collection.talks.map(eventSchema)]
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
  const events = talks.map((talk) => {
    const talkUrl = `${absoluteUrl(talk.seriesLink)}#${encodeURIComponent(talk.id)}`;
    return `BEGIN:VEVENT\r\nUID:${icsEscape(talk.id)}@topogeoiiitd\r\nDTSTAMP:${icsDate(now)}\r\nDTSTART:${icsDate(talk.start)}\r\nDTEND:${icsDate(talk.end)}\r\nSUMMARY:${icsEscape(talk.title)}\r\nDESCRIPTION:${icsEscape(`Speaker: ${talk.speaker}\n${talk.abstract}\n\n${talkUrl}`)}\r\nLOCATION:Online\r\nURL:${talkUrl}\r\nEND:VEVENT`;
  }).join('\r\n');
  write('calendar.ics', `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//${icsEscape(config.title)}//EN\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:${icsEscape(config.title)}\r\n${events}\r\nEND:VCALENDAR\r\n`);

  const items = [...talks].sort((a, b) => b.start - a.start).slice(0, 30).map((talk) => {
    const talkUrl = `${absoluteUrl(talk.seriesLink)}#${encodeURIComponent(talk.id)}`;
    return `<item><title>${escapeXml(talk.title)}</title><link>${escapeXml(talkUrl)}</link><guid>${escapeXml(talkUrl)}</guid><pubDate>${talk.start.toUTCString()}</pubDate><description>${escapeXml(truncate(`${talk.speaker}. ${talk.abstract}`, 500))}</description></item>`;
  }).join('\n');
  write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${escapeXml(config.title)}</title><link>${escapeXml(absoluteUrl('/'))}</link><description>${escapeXml(config.description)}</description>${items}</channel></rss>\n`);
}

function buildSeoFiles() {
  const lastModified = now.toISOString().slice(0, 10);
  const paths = ['/', '/schedule/', '/archive/', ...collections.map((collection) => `/series/${collection.meta.slug}/`)];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((item) => `  <url><loc>${escapeXml(absoluteUrl(item))}</loc><lastmod>${lastModified}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`);
  write('manifest.webmanifest', JSON.stringify({ name: config.title, short_name: 'TopoGeo IIITD', start_url: pathUrl('/'), display: 'standalone', background_color: '#f9fafb', theme_color: '#1e3a8a', icons: [{ src: pathUrl('/assets/logo.png'), sizes: '256x256', type: 'image/png' }] }, null, 2));
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
