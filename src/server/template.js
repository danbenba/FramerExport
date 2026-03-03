export const SERVE_SCRIPT = `#!/usr/bin/env node
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html':      'text/html; charset=utf-8',
  '.css':       'text/css; charset=utf-8',
  '.js':        'application/javascript; charset=utf-8',
  '.mjs':       'application/javascript; charset=utf-8',
  '.json':      'application/json; charset=utf-8',
  '.png':       'image/png',
  '.jpg':       'image/jpeg',
  '.jpeg':      'image/jpeg',
  '.gif':       'image/gif',
  '.svg':       'image/svg+xml',
  '.webp':      'image/webp',
  '.avif':      'image/avif',
  '.ico':       'image/x-icon',
  '.woff':      'font/woff',
  '.woff2':     'font/woff2',
  '.ttf':       'font/ttf',
  '.otf':       'font/otf',
  '.framercms': 'application/octet-stream',
};

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';

  const filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Serving at http://localhost:' + PORT);
});
`;
