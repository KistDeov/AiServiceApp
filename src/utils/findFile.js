import fs from 'fs';
import path from 'path';

export function findFile(filename) {
  const rootPath = path.join(process.cwd(), filename);
  const resourcePath = path.join(process.cwd(), 'resources', filename);

  if (fs.existsSync(rootPath)) {
    return rootPath;
  } else if (fs.existsSync(resourcePath)) {
    return resourcePath;
  } else {
    throw new Error(`${filename} nem található sem a gyökérben, sem a resources mappában.`);
  }
}