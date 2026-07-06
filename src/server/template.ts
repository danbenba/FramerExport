export const SERVE_SCRIPT: string = `#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

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
  accent: '\\x1b[38;2;157;124;216m',
  warning: '\\x1b[38;2;245;167;66m',
  command: '\\x1b[38;2;255;192;159m',
  error: '\\x1b[38;2;224;108;117m',
};

function color(name, value) {
  return ANSI[name] + value + ANSI.reset;
}

function fitValue(value, width) {
  const text = String(value);
  if (text.length <= width) return text;
  if ((text.includes('\\\\') || text.includes('/')) && width > 12) {
    const separator = text.includes('\\\\') ? '\\\\' : '/';
    const prefix = text.startsWith(separator) ? separator : '';
    const parts = text.split(/[\\\\/]+/).filter(Boolean);
    const compact = prefix + parts.map((part, index) => {
      if (index === parts.length - 1) return part;
      if (/^[A-Za-z]:$/.test(part)) return part;
      return part.length > 5 ? part.slice(0, 3) + '..' : part;
    }).join(separator);
    if (compact.length <= width) return compact;
    const tail = Math.max(8, Math.floor(width * 0.45));
    const head = Math.max(0, width - tail - 4);
    return compact.slice(0, head) + separator + '..' + separator + compact.slice(-tail);
  }
  return width <= 3 ? '.'.repeat(Math.max(0, width)) : text.slice(0, width - 2) + '..';
}

function frameLine(label, value, colorName = 'text') {
  const labelText = label.padEnd(10);
  const valueWidth = Math.max(0, 56 - labelText.length);
  const shown = fitValue(value, valueWidth);
  const pad = Math.max(0, 56 - labelText.length - shown.length);
  console.log('  ' + color('border', '│ ') + color('muted', labelText) + color(colorName, shown) + ' '.repeat(pad) + color('border', ' │'));
}

function drawServerUi() {
  console.log('');
  console.log('  ' + color('border', '╭─' + '─'.repeat(56) + '─╮'));
  console.log('  ' + color('border', '│ ') + color('text', '  Framer Export preview server') + ' '.repeat(26) + color('border', ' │'));
  console.log('  ' + color('border', '├─' + '─'.repeat(56) + '─┤'));
  frameLine('URL', 'http://localhost:' + PORT, 'primary');
  frameLine('Root', ROOT, 'soft');
  frameLine('Run', 'node serve.js', 'command');
  frameLine('Mode', 'static mirror + SPA fallback', 'accent');
  console.log('  ' + color('border', '╰─' + '─'.repeat(56) + '─╯'));
  console.log('');
  console.log('  ' + color('success', 'ready') + color('muted', '  press Ctrl+C to stop') + '\\n');
}

server.listen(PORT, () => {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const steps = ['Preparing server', 'Checking exported files', 'Binding local port', 'Serving static mirror'];
  const stepColors = ['text', 'info', 'warning', 'success'];
  let i = 0;
  const timer = setInterval(() => {
    const stepIndex = Math.min(steps.length - 1, Math.floor(i / 6));
    const step = steps[stepIndex];
    const dots = color('error', '.'.repeat(i % 4).padEnd(3, ' '));
    process.stdout.write('\\r\\x1B[2K  ' + color('primary', frames[i % frames.length]) + ' ' + color(stepColors[stepIndex], step) + dots);
    i++;
  }, 80);

  setTimeout(() => {
    clearInterval(timer);
    process.stdout.write('\\r\\x1B[2K');
    drawServerUi();
  }, 1280);
});
`;
