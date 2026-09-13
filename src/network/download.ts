import https from 'node:https';
import http from 'node:http';
import { promisify } from 'node:util';
import { brotliDecompress, gunzip, inflate } from 'node:zlib';
import { CFG } from '../config/index.js';

export interface DownloadedResource {
  buffer: Buffer;
  url: string;
  contentType: string;
}

async function requestResource(
  url: string,
  redirects: number,
  referer?: string
): Promise<DownloadedResource> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported asset protocol');
  if (redirects > 10) throw new Error('Too many asset redirects');
  return new Promise((resolve, reject) => {
    const proto = parsed.protocol === 'https:' ? https : http;
    const req = proto.get(
      parsed,
      {
        timeout: CFG.dlTimeout,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          ...(referer ? { Referer: referer } : {}),
        },
      },
      (res) => {
        if (res.statusCode! >= 300 && res.statusCode! < 400 && res.headers.location) {
          res.resume();
          requestResource(new URL(res.headers.location, url).href, redirects + 1, referer).then(
            resolve,
            reject
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('aborted', () => reject(new Error('Asset response aborted')));
        res.on('end', async () => {
          try {
            let buffer = Buffer.concat(chunks);
            for (const encoding of (res.headers['content-encoding'] ?? '').split(',').reverse()) {
              if (encoding.trim() === 'gzip') buffer = await promisify(gunzip)(buffer);
              else if (encoding.trim() === 'deflate') buffer = await promisify(inflate)(buffer);
              else if (encoding.trim() === 'br') buffer = await promisify(brotliDecompress)(buffer);
            }
            resolve({ buffer, url, contentType: res.headers['content-type'] ?? '' });
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on('error', reject);

    req.on('timeout', () => req.destroy(new Error('Asset download timeout')));
  });
}

export async function dlResource(
  url: string,
  retries: number = CFG.retries,
  referer?: string
): Promise<DownloadedResource> {
  const attempts = Math.max(1, retries);
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestResource(url, 0, referer);
    } catch (error) {
      if (attempt + 1 >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

export async function dlBuffer(url: string, retries: number = CFG.retries): Promise<Buffer> {
  return (await dlResource(url, retries)).buffer;
}
