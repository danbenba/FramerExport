import fs from 'node:fs';
import path from 'node:path';
import { runWithLogViewer, formatLogRecords } from '../../src/cli/log-viewer.js';
import { clearLogHistory, getLogHistory, info, log, warn, error } from '../../src/logger/index.js';
import {
  noteDownload,
  noteFile,
  resetProgress,
  setPhase,
  setTotalAssets,
} from '../../src/exporter/progress.js';

const directory = process.argv[2];
const mode = process.argv[3];
clearLogHistory();
try {
  const result = await runWithLogViewer(
    async () => {
      resetProgress();
      setPhase('Downloading test assets');
      setTotalAssets(40);
      for (let index = 1; index <= 40; index++) {
        log('Downloaded asset ' + index + ' café 界 👩🏽‍💻');
        noteDownload(true);
        noteFile('assets/' + index + '.png');
      }
      warn('Retry marker for asset 12');
      error('Missing font marker');
      info('Fixture is waiting');
      let lastBatch = '';
      while (!fs.existsSync(path.join(directory, 'continue'))) {
        const batchPath = path.join(directory, 'append.json');
        if (fs.existsSync(batchPath)) {
          const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8')) as {
            id: string;
            prefix: string;
            count: number;
          };
          if (batch.id !== lastBatch) {
            lastBatch = batch.id;
            for (let index = 1; index <= batch.count; index++) log(`${batch.prefix} ${index}`);
            fs.writeFileSync(path.join(directory, 'appended'), batch.id);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      log('Operation actually settled');
      fs.writeFileSync(path.join(directory, 'export.log'), formatLogRecords(getLogHistory()));
      if (mode === 'failure') throw new Error('Fixture export rejected');
      setPhase('Done');
      return 73;
    },
    { outDir: directory, reduceMotion: mode !== 'animated' }
  );
  console.log('VIEWER_RESULT=' + result);
} catch (error) {
  console.log('VIEWER_FAILURE=' + (error as Error).message);
  process.exitCode = 7;
}
