import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SECRETISH_ENV_NAME = /(TOKEN|SECRET|PASSWORD|PRIVATE|ACCESS_KEY|SESSION_KEY|AUTHORIZATION|CREDENTIAL)/i;

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

export function createIngestPayload(options = {}) {
  const reportPath = requireNonEmptyString(options.reportPath, "reportPath");
  const projectKey = requireNonEmptyString(options.projectKey, "projectKey");
  const report = options.report || readJson(reportPath);
  const outputDir = path.resolve(options.outputDir || path.dirname(reportPath));
  const storage = normalizeStorageOptions(options.storage);
  const env = options.env || process.env;
  const cwd = path.resolve(options.cwd || process.cwd());

  return {
    projectKey,
    report: attachArtifactLocations(report, storage),
    source: buildGitHubSourceContext(
      {
        buildStartedAt: options.buildStartedAt,
        buildCompletedAt: options.buildCompletedAt,
        jobStatus: options.jobStatus,
        artifactCount: countOutputFiles(outputDir),
        storage,
        cwd,
      },
      env
    ),
    artifacts: collectOutputArtifacts(outputDir, storage),
  };
}

export function assertRequiredCiMetadata(source) {
  if (!source || typeof source !== "object") {
    throw new Error("source metadata is required");
  }

  if (source.provider !== "github-actions") {
    return;
  }

  const missing = [];
  if (!trimToNull(source.branch)) {
    missing.push("branch");
  }
  if (!Number.isFinite(source.buildNumber)) {
    missing.push("buildNumber");
  }

  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `Missing required GitHub Actions source metadata: ${missing.join(", ")}. `
      + "Check the workflow env for TEST_STATION_BRANCH / TEST_STATION_BUILD_NUMBER."
  );
}

export async function publishIngestPayload(options = {}) {
  const endpoint = requireNonEmptyString(options.endpoint, "endpoint");
  const sharedKey = requireNonEmptyString(options.sharedKey, "sharedKey");
  const payload = options.payload;
  if (!payload || typeof payload !== "object") {
    throw new Error("payload is required");
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required to publish ingest payloads.");
  }

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${sharedKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const body = tryParseJson(text);
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || text || `HTTP ${response.status}`;
    throw new Error(`Ingest publish failed (${response.status}): ${detail}`);
  }

  return body;
}

export function normalizeStorageOptions(storage = {}) {
  return {
    bucket: trimToNull(storage.bucket),
    prefix: normalizeRelativePath(storage.prefix || ""),
    baseUrl: normalizeBaseUrl(storage.baseUrl),
  };
}

export function collectOutputArtifacts(outputDir, storage = {}) {
  return listFilesRecursively(path.resolve(outputDir))
    .map((absolutePath) => toRelativePosixPath(outputDir, absolutePath))
    .sort((left, right) => left.localeCompare(right))
    .map((relativePath) => {
      const locator = createArtifactLocator(relativePath, storage);
      return {
        label: createArtifactLabel(relativePath),
        relativePath,
        href: relativePath,
        kind: "file",
        mediaType: inferMediaType(relativePath),
        storageKey: locator.storageKey,
        sourceUrl: locator.sourceUrl,
      };
    });
}

export function attachArtifactLocations(report, storage = {}) {
  const cloned = structuredClone(report);
  for (const packageEntry of Array.isArray(cloned?.packages) ? cloned.packages : []) {
    for (const suite of Array.isArray(packageEntry?.suites) ? packageEntry.suites : []) {
      for (const artifact of Array.isArray(suite?.rawArtifacts) ? suite.rawArtifacts : []) {
        if (!artifact?.relativePath) {
          continue;
        }
        const relativePath = path.posix.join("raw", normalizeRelativePath(artifact.relativePath));
        const locator = createArtifactLocator(relativePath, storage);
        artifact.storageKey = locator.storageKey;
        artifact.sourceUrl = locator.sourceUrl;
      }
    }
  }
  return cloned;
}

export function buildGitHubSourceContext(options = {}, env = process.env) {
  const event = readGitHubEvent(env.GITHUB_EVENT_PATH);
  const cwd = path.resolve(options.cwd || process.cwd());
  const serverUrl = trimToNull(env.GITHUB_SERVER_URL) || "https://github.com";
  const repositoryUrl = resolveRepositoryUrl(env, event, cwd, serverUrl);
  const repository =
    trimToNull(env.TEST_STATION_REPOSITORY) ||
    trimToNull(env.GITHUB_REPOSITORY) ||
    trimToNull(event?.repository?.full_name) ||
    extractRepositoryFullName(repositoryUrl);
  const provider = resolveSourceProvider(env);
  const runId = resolveRunId(env);
  const branch = resolveBranch(env, event, cwd);
  const tag = resolveTag(env, event, cwd);
  const startedAt =
    normalizeTimestamp(options.buildStartedAt) ||
    normalizeTimestamp(env.TEST_STATION_BUILD_STARTED_AT) ||
    new Date().toISOString();
  const completedAt =
    normalizeTimestamp(options.buildCompletedAt) ||
    normalizeTimestamp(env.TEST_STATION_BUILD_COMPLETED_AT) ||
    new Date().toISOString();
  const semanticVersion = tag && /^v?\d+\.\d+\.\d+([-.+].+)?$/.test(tag) ? tag.replace(/^v/, "") : null;
  const buildNumber = resolveBuildNumber(env);
  const storage = normalizeStorageOptions(options.storage);
  const actor =
    trimToNull(env.TEST_STATION_ACTOR) ||
    trimToNull(env.GITHUB_ACTOR) ||
    trimToNull(env.GITLAB_USER_LOGIN) ||
    null;

  return {
    provider,
    runId,
    runUrl:
      trimToNull(env.TEST_STATION_SOURCE_RUN_URL) ||
      trimToNull(env.GITHUB_RUN_URL) ||
      (provider === "github-actions" && repository && runId
        ? `${serverUrl}/${repository}/actions/runs/${runId}`
        : null),
    repository,
    repositoryUrl,
    defaultBranch: trimToNull(env.TEST_STATION_DEFAULT_BRANCH) || trimToNull(event?.repository?.default_branch),
    branch,
    tag,
    commitSha: resolveCommitSha(env, cwd),
    actor,
    startedAt,
    completedAt,
    buildNumber,
    semanticVersion,
    releaseName: tag,
    versionKey: tag ? `tag:${tag}` : null,
    ci: {
      eventName: trimToNull(env.GITHUB_EVENT_NAME) || trimToNull(env.CI_PIPELINE_SOURCE),
      workflow: trimToNull(env.GITHUB_WORKFLOW),
      workflowRef: trimToNull(env.GITHUB_WORKFLOW_REF),
      workflowSha: trimToNull(env.GITHUB_WORKFLOW_SHA),
      job: trimToNull(env.GITHUB_JOB) || trimToNull(env.CI_JOB_NAME),
      ref: trimToNull(env.GITHUB_REF),
      refName: trimToNull(env.GITHUB_REF_NAME) || branch || tag,
      refType: trimToNull(env.GITHUB_REF_TYPE) || (tag ? "tag" : branch ? "branch" : null),
      runAttempt: parseInteger(env.GITHUB_RUN_ATTEMPT),
      repositoryOwner: trimToNull(env.GITHUB_REPOSITORY_OWNER),
      serverUrl,
      status: trimToNull(options.jobStatus) || trimToNull(env.TEST_STATION_CI_STATUS),
      buildDurationMs: diffTimestamps(startedAt, completedAt),
      artifactCount: Number.isFinite(options.artifactCount) ? options.artifactCount : null,
      environment: captureCiEnvironment(env),
      storage: {
        bucket: storage.bucket,
        prefix: storage.prefix,
        baseUrl: storage.baseUrl,
      },
    },
  };
}

function resolveSourceProvider(env) {
  return (
    trimToNull(env.TEST_STATION_SOURCE_PROVIDER) ||
    (isTruthy(env.GITHUB_ACTIONS) || trimToNull(env.GITHUB_RUN_ID) ? "github-actions" : null) ||
    (isTruthy(env.CI) ? "ci" : null) ||
    "local-cli"
  );
}

function resolveRunId(env) {
  return (
    trimToNull(env.TEST_STATION_SOURCE_RUN_ID) ||
    trimToNull(env.GITHUB_RUN_ID) ||
    trimToNull(env.CI_PIPELINE_ID) ||
    trimToNull(env.BUILD_ID) ||
    null
  );
}

function resolveRepositoryUrl(env, event, cwd, serverUrl) {
  const explicitUrl =
    trimToNull(env.TEST_STATION_REPOSITORY_URL) ||
    trimToNull(event?.repository?.html_url) ||
    normalizeGitRemoteUrl(readGitValue(cwd, ["remote", "get-url", "origin"]));

  if (explicitUrl) {
    return explicitUrl;
  }

  const repository =
    trimToNull(env.TEST_STATION_REPOSITORY) ||
    trimToNull(env.GITHUB_REPOSITORY) ||
    trimToNull(event?.repository?.full_name);

  return repository ? `${serverUrl}/${repository}` : null;
}

function resolveBranch(env, event, cwd) {
  return normalizeGitBranch(
    trimToNull(env.TEST_STATION_BRANCH) ||
      trimToNull(env.GITHUB_HEAD_REF) ||
      trimToNull(event?.pull_request?.head?.ref) ||
      (trimToNull(env.GITHUB_REF_TYPE) === "branch" ? trimToNull(env.GITHUB_REF_NAME) : null) ||
      trimToNull(env.CI_COMMIT_BRANCH) ||
      trimToNull(env.CI_COMMIT_REF_NAME) ||
      trimToNull(env.BITBUCKET_BRANCH) ||
      trimToNull(env.BRANCH_NAME) ||
      trimToNull(env.GIT_BRANCH) ||
      readGitValue(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]) ||
      readGitValue(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
  );
}

function resolveTag(env, event, cwd) {
  return normalizeGitTag(
    trimToNull(env.TEST_STATION_TAG) ||
      (trimToNull(env.GITHUB_REF_TYPE) === "tag" ? trimToNull(env.GITHUB_REF_NAME) : null) ||
      trimToNull(event?.release?.tag_name) ||
      trimToNull(env.CI_COMMIT_TAG) ||
      trimToNull(env.BITBUCKET_TAG) ||
      readGitValue(cwd, ["describe", "--tags", "--exact-match"])
  );
}

function resolveCommitSha(env, cwd) {
  return (
    trimToNull(env.TEST_STATION_COMMIT_SHA) ||
    trimToNull(env.GITHUB_SHA) ||
    trimToNull(env.CI_COMMIT_SHA) ||
    trimToNull(env.BITBUCKET_COMMIT) ||
    readGitValue(cwd, ["rev-parse", "HEAD"]) ||
    null
  );
}

function resolveBuildNumber(env) {
  return parseInteger(
    trimToNull(env.TEST_STATION_BUILD_NUMBER) ||
      trimToNull(env.GITHUB_RUN_NUMBER) ||
      trimToNull(env.BUILD_NUMBER) ||
      trimToNull(env.CI_BUILD_NUMBER) ||
      trimToNull(env.CI_PIPELINE_IID) ||
      trimToNull(env.CIRCLE_BUILD_NUM) ||
      trimToNull(env.TRAVIS_BUILD_NUMBER) ||
      trimToNull(env.APPVEYOR_BUILD_NUMBER) ||
      trimToNull(env.BITBUCKET_BUILD_NUMBER) ||
      trimToNull(env.BUILD_BUILDNUMBER)
  );
}

function readGitHubEvent(eventPath) {
  if (!trimToNull(eventPath) || !fs.existsSync(eventPath)) {
    return {};
  }
  try {
    return readJson(eventPath);
  } catch {
    return {};
  }
}

function readGitValue(cwd, args) {
  try {
    return trimToNull(
      execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
    );
  } catch {
    return null;
  }
}

function listFilesRecursively(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(absolutePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

function countOutputFiles(outputDir) {
  if (!fs.existsSync(outputDir)) {
    return 0;
  }
  return listFilesRecursively(outputDir).length;
}

function createArtifactLocator(relativePath, storage = {}) {
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  const prefix = normalizeRelativePath(storage.prefix || "");
  const objectPath = prefix ? path.posix.join(prefix, normalizedRelativePath) : normalizedRelativePath;
  return {
    storageKey: storage.bucket ? `s3://${storage.bucket}/${objectPath}` : null,
    sourceUrl: storage.baseUrl ? new URL(objectPath, `${storage.baseUrl}/`).toString() : null,
  };
}

function createArtifactLabel(relativePath) {
  switch (relativePath) {
    case "report.json":
      return "Normalized report";
    case "modules.json":
      return "Module rollup";
    case "ownership.json":
      return "Ownership rollup";
    case "index.html":
      return "HTML report";
    default:
      return path.posix.basename(relativePath);
  }
}

function inferMediaType(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  switch (extension) {
    case ".json":
      return "application/json";
    case ".html":
      return "text/html";
    case ".txt":
    case ".log":
    case ".out":
    case ".ndjson":
      return "text/plain";
    default:
      return null;
  }
}

function captureCiEnvironment(env) {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([name]) => isCiEnvironmentName(name) && !SECRETISH_ENV_NAME.test(name))
      .map(([name, value]) => [name, normalizeEnvironmentValue(value)])
      .filter(([, value]) => value !== null)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function isCiEnvironmentName(name) {
  return (
    name === "CI" ||
    name.startsWith("GITHUB_") ||
    name.startsWith("RUNNER_") ||
    name.startsWith("TEST_STATION_")
  );
}

function normalizeEnvironmentValue(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function normalizeGitBranch(value) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\//, "")
    .replace(/^origin\//, "")
    .replace(/^remotes\/origin\//, "");

  return normalized === "HEAD" ? null : normalized;
}

function normalizeGitTag(value) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^refs\/tags\//, "");
}

function normalizeGitRemoteUrl(value) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("git@github.com:")) {
    return `https://github.com/${trimmed.slice("git@github.com:".length).replace(/\.git$/, "")}`;
  }

  if (trimmed.startsWith("ssh://git@github.com/")) {
    return `https://github.com/${trimmed.slice("ssh://git@github.com/".length).replace(/\.git$/, "")}`;
  }

  return trimmed.replace(/\.git$/, "");
}

function extractRepositoryFullName(repositoryUrl) {
  const trimmed = trimToNull(repositoryUrl);
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/github\.com\/([^/]+\/[^/]+?)(?:\/)?$/i);
  return match?.[1] || null;
}

function toRelativePosixPath(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function normalizeRelativePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function normalizeBaseUrl(value) {
  const trimmed = trimToNull(value);
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

function normalizeTimestamp(value) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function diffTimestamps(startedAt, completedAt) {
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) {
    return null;
  }
  return Math.max(0, completed - started);
}

function trimToNull(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

function parseInteger(value) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireNonEmptyString(value, name) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

function isTruthy(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
