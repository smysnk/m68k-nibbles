#!/usr/bin/env node

import '../load-root-env.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const args = process.argv.slice(2);

const explicitCliPath = normalizeNonEmptyString(process.env.TEST_STATION_CLI_PATH);
const localCliCandidates = [
  explicitCliPath,
  path.join(repoRoot, 'test-station/packages/cli/src/cli.js'),
  path.join(repoRoot, '../test-station/packages/cli/src/cli.js'),
].filter(Boolean);

const localCliPath = localCliCandidates.find((candidate) => fs.existsSync(candidate));
const command = localCliPath ? process.execPath : 'npx';
const commandArgs = localCliPath
  ? [localCliPath, ...args]
  : ['--yes', '@test-station/cli@0.2.19', ...args];

const result = spawnSync(command, commandArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function normalizeNonEmptyString(value) {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
}
