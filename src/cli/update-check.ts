import https from 'https';

export async function checkForUpdates(currentVersion: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      'https://registry.npmjs.org/framer-export/latest',
      { timeout: 3000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const latest = json.version;
            if (!latest) return resolve(null);
            if (latest !== currentVersion) return resolve(latest);
            resolve(null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}
