export const SERVE_SCRIPT: string = `#!/usr/bin/env node
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
  '.mp4':       'video/mp4',
  '.webm':      'video/webm',
  '.ogg':       'video/ogg',
  '.framercms': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';

  let filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const serveFile = (pathToFile) => {
    fs.readFile(pathToFile, (err, data) => {
      if (err) {
        // SPA Fallback: if it's not a file, serve index.html
        if (url !== '/index.html' && !path.extname(url)) {
          return serveFile(path.join(ROOT, 'index.html'));
        }
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext  = path.extname(pathToFile).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(data);
    });
  };

  serveFile(filePath);
});

server.listen(PORT, () => {
  console.log('\\x1b[32m%s\\x1b[0m', '  🚀 Cooksite Local Server Running');
  console.log('\\x1b[36m%s\\x1b[0m', '  ├─ URL:      http://localhost:' + PORT);
  console.log('\\x1b[35m%s\\x1b[0m', '  └─ Directory: ' + ROOT);
  console.log('\\n  Press Ctrl+C to stop.');
});
`;
