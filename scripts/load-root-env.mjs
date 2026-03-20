import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(scriptDir, '..');

function mergeEnvFile(targetEnv, envPath, protectedKeys) {
  if (!existsSync(envPath)) {
    return;
  }

  const parsed = parse(readFileSync(envPath));

  for (const [key, value] of Object.entries(parsed)) {
    if (protectedKeys.has(key)) {
      continue;
    }

    targetEnv[key] = value;
  }
}

export function loadRootEnv(targetEnv = process.env) {
  const protectedKeys = new Set(Object.keys(targetEnv));

  mergeEnvFile(targetEnv, path.join(repoRoot, '.env'), protectedKeys);
  mergeEnvFile(targetEnv, path.join(repoRoot, '.env.local'), protectedKeys);

  return targetEnv;
}

export default loadRootEnv(process.env);
