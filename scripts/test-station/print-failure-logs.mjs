import fs from 'node:fs';
import path from 'node:path';

const reportPath = process.env.TEST_STATION_REPORT_PATH || './.test-results/test-station/report.json';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function printHeading(title) {
  process.stdout.write(`\n===== ${title} =====\n`);
}

function printBlock(label, content) {
  if (!content || !String(content).trim()) {
    return;
  }

  printHeading(label);
  process.stdout.write(String(content).trimEnd());
  process.stdout.write('\n');
}

function collectFailedSuites(report) {
  const packages = Array.isArray(report.packages) ? report.packages : [];
  const failedSuites = [];

  for (const pkg of packages) {
    const suites = Array.isArray(pkg.suites) ? pkg.suites : [];
    for (const suite of suites) {
      if (suite.status && suite.status !== 'passed') {
        failedSuites.push({
          packageName: pkg.name ?? 'unknown',
          suite,
        });
      }
    }
  }

  return failedSuites;
}

function printSuiteFailure(packageName, suite, reportDir) {
  printHeading(`${packageName} / ${suite.label ?? suite.id ?? 'unknown suite'}`);
  process.stdout.write(`status: ${suite.status ?? 'unknown'}\n`);
  if (suite.command) {
    process.stdout.write(`command: ${suite.command}\n`);
  }
  if (suite.cwd) {
    process.stdout.write(`cwd: ${suite.cwd}\n`);
  }

  const output = suite.output ?? {};
  printBlock('suite stdout', output.stdout);
  printBlock('suite stderr', output.stderr);

  const tests = Array.isArray(suite.tests) ? suite.tests : [];
  const failedTests = tests.filter((test) => test.status && test.status !== 'passed');
  for (const test of failedTests) {
    printHeading(`failed test: ${test.fullName ?? test.name ?? 'unknown test'}`);
    const failureMessages = Array.isArray(test.failureMessages) ? test.failureMessages.join('\n\n') : '';
    printBlock('failure messages', failureMessages);
    const rawDetails = test.rawDetails ?? {};
    printBlock('test stdout', rawDetails.stdout);
    printBlock('test stderr', rawDetails.stderr);
  }

  const rawArtifacts = Array.isArray(suite.rawArtifacts) ? suite.rawArtifacts : [];
  for (const artifact of rawArtifacts) {
    if (!artifact?.relativePath || !artifact.relativePath.endsWith('.log')) {
      continue;
    }

    const artifactPathCandidates = [
      typeof artifact.href === 'string' ? path.join(reportDir, artifact.href) : null,
      path.join(reportDir, 'raw', artifact.relativePath),
      path.join(reportDir, artifact.relativePath),
    ].filter(Boolean);
    const artifactPath = artifactPathCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;
    const content =
      typeof artifact.content === 'string' && artifact.content.length > 0
        ? artifact.content
        : artifactPath
          ? fs.readFileSync(artifactPath, 'utf8')
          : '';
    printBlock(`artifact log: ${artifact.relativePath}`, content);
  }
}

if (!fs.existsSync(reportPath)) {
  printHeading('test-station report missing');
  process.stdout.write(`No report found at ${reportPath}\n`);
  process.exit(0);
}

const report = readJson(reportPath);
const failedSuites = collectFailedSuites(report);

if (failedSuites.length === 0) {
  printHeading('test-station failure logs');
  process.stdout.write('No failing suites were found in the report.\n');
  process.exit(0);
}

const reportDir = path.dirname(reportPath);
printHeading('test-station summary');
process.stdout.write(
  `failed packages: ${report.summary?.failedPackages ?? 0}, failed tests: ${report.summary?.failedTests ?? 0}\n`
);

for (const { packageName, suite } of failedSuites) {
  printSuiteFailure(packageName, suite, reportDir);
}
