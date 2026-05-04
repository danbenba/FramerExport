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

const ANSI = {
  reset: '\\x1b[0m',
  primary: '\\x1b[38;2;250;178;131m',
  soft: '\\x1b[38;2;255;192;159m',
  text: '\\x1b[38;2;238;238;238m',
  muted: '\\x1b[38;2;128;128;128m',
  border: '\\x1b[38;2;72;72;72m',
  success: '\\x1b[38;2;127;216;143m',
  info: '\\x1b[38;2;86;182;194m',
};

function color(name, value) {
  return ANSI[name] + value + ANSI.reset;
}

function frameLine(label, value) {
  const text = '  ' + label.padEnd(10) + value;
  const pad = Math.max(0, 56 - text.length);
  console.log('  ' + color('border', '│ ') + color('muted', label.padEnd(10)) + color('text', value) + ' '.repeat(pad) + color('border', ' │'));
}

function drawServerUi() {
  const logo = [
    '███████╗██████╗  █████╗ ███╗   ███╗███████╗██████╗ ',
    '██╔════╝██╔══██╗██╔══██╗████╗ ████║██╔════╝██╔══██╗',
    '█████╗  ██████╔╝███████║██╔████╔██║█████╗  ██████╔╝',
    '███████╗██╗  ██╗██████╗  ██████╗ ██████╗ ████████╗',
    '██╔════╝╚██╗██╔╝██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝',
    '█████╗   ╚███╔╝ ██████╔╝██║   ██║██████╔╝   ██║   ',
  ];

  console.log('');
  for (const line of logo) console.log('  ' + color('primary', line));
  console.log('');
  console.log('  ' + color('border', '╭─' + '─'.repeat(56) + '─╮'));
  console.log('  ' + color('border', '│ ') + color('text', '  Framer Export local server') + ' '.repeat(28) + color('border', ' │'));
  console.log('  ' + color('border', '├─' + '─'.repeat(56) + '─┤'));
  frameLine('URL', 'http://localhost:' + PORT);
  frameLine('Root', ROOT);
  frameLine('Mode', 'static mirror + SPA fallback');
  console.log('  ' + color('border', '╰─' + '─'.repeat(56) + '─╯'));
  console.log('');
  console.log('  ' + color('success', 'ready') + color('muted', '  press Ctrl+C to stop') + '\\n');
}

server.listen(PORT, () => {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write('\\r\\x1B[2K  ' + color('primary', frames[i % frames.length]) + ' ' + color('muted', 'starting Framer Export server'));
    i++;
  }, 80);

  setTimeout(() => {
    clearInterval(timer);
    process.stdout.write('\\r\\x1B[2K');
    drawServerUi();
  }, 720);
});
`;
