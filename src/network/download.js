import https from 'https';
import http from 'http';
import { URL } from 'url';
import { CFG } from '../config/index.js';

export function dlBuffer(url, retries = CFG.retries) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const go = (left) => {
      const req = proto.get(url, { timeout: CFG.dlTimeout }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return dlBuffer(new URL(res.headers.location, url).href, left).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return left > 1
            ? setTimeout(() => go(left - 1), 300)
            : reject(new Error(`HTTP ${res.statusCode}`));
        }
        const ch = [];
        res.on('data', (c) => ch.push(c));
        res.on('end', () => resolve(Buffer.concat(ch)));
        res.on('error', (e) => (left > 1 ? setTimeout(() => go(left - 1), 300) : reject(e)));
      });
      req.on('error', (e) => (left > 1 ? setTimeout(() => go(left - 1), 300) : reject(e)));
      req.on('timeout', () => {
        req.destroy();
        left > 1 ? setTimeout(() => go(left - 1), 300) : reject(new Error('Timeout'));
      });
    };
    go(retries);
  });
}
