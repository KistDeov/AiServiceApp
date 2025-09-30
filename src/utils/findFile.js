import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// In ESM the Node globals __filename and __dirname are not defined.
// Compute them from import.meta.url so this module works when
// the project/package.json uses "type": "module" (or in an asar bundle).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function findFile(filename) {
  const tried = [];

  const pushIf = (p) => {
    if (p) tried.push(p);
  };

  // Common locations to check in dev and packaged apps
  const cwdRoot = path.join(process.cwd(), filename);
  pushIf(cwdRoot);

  const cwdResources = path.join(process.cwd(), 'resources', filename);
  pushIf(cwdResources);

  // process.resourcesPath is set by Electron and points to the resources folder
  const resourcesPath = process.resourcesPath ? path.join(process.resourcesPath, filename) : null;
  pushIf(resourcesPath);

  // When using asar the app files are often in resources/app.asar
  const resourcesAppAsar = process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', filename) : null;
  pushIf(resourcesAppAsar);

  // Or resources/app/...
  const resourcesApp = process.resourcesPath ? path.join(process.resourcesPath, 'app', filename) : null;
  pushIf(resourcesApp);

  // Resources next to the executable (portable or some installers place resources alongside exe)
  const execDir = process.execPath ? path.dirname(process.execPath) : null;
  const execResources = execDir ? path.join(execDir, 'resources', filename) : null;
  pushIf(execResources);

  // Also check sibling resources one level up from execDir (some layouts)
  const execParentResources = execDir ? path.join(execDir, '..', 'resources', filename) : null;
  pushIf(execParentResources);

  // Relative to this module (useful for dev/out paths)
  const moduleRelative = path.join(__dirname, '..', '..', filename);
  pushIf(moduleRelative);

  // Check each candidate and return the first existing path
  for (const p of tried) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {
      // ignore permission errors but include in tried list
    }
  }

  // If not found, throw a descriptive error listing where we looked
  const readable = tried.filter(Boolean).map(p => `- ${p}`).join('\n');
  throw new Error(`${filename} nem található. Megnéztem a következő helyeken:\n${readable}`);
}