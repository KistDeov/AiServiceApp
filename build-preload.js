import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

esbuild.build({
  entryPoints: [path.resolve(__dirname, 'src/preload-esm.js')],
  bundle: true,
  platform: 'node',
  outfile: path.resolve(__dirname, 'src/preload-bundled.js'), // ✅ .js kiterjesztés
  format: 'cjs',
  sourcemap: true,
  allowOverwrite: true,
}).catch(() => process.exit(1));
