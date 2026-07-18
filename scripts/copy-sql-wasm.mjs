import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.join(process.cwd(), 'public', 'vendor');

await mkdir(outputDirectory, { recursive: true });
await copyFile(
  path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm-browser.wasm'),
  path.join(outputDirectory, 'sql-wasm-browser.wasm'),
);
