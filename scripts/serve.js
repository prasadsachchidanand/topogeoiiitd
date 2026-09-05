'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.ics': 'text/calendar; charset=utf-8', '.png': 'image/png', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json' };
const port = Number(process.env.PORT || 8080);

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  let target = path.join(dist, pathname.replace(/^\/+/, ''));
  if (pathname.endsWith('/') || !path.extname(target)) target = path.join(target, 'index.html');
  if (!target.startsWith(dist) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    response.statusCode = 404;
    response.end('Page not found');
    return;
  }
  response.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(response);
}).listen(port, () => console.log(`Local preview: http://localhost:${port}`));
