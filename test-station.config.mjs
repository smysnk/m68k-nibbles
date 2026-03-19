const rootDir = import.meta.dirname;
const interpreterDir = `${rootDir}/references/m68k-interpreter`;

export default {
  schemaVersion: "1",
  project: {
    name: "m68k-nibbles",
    rootDir,
    outputDir: ".test-results/test-station",
    rawDir: ".test-results/test-station/raw"
  },
  workspaceDiscovery: {
    provider: "manual",
    packages: ["quality", "runtime", "ide", "browser", "benchmark"]
  },
  execution: {
    continueOnError: true,
    defaultCoverage: false
  },
  enrichers: {
    sourceAnalysis: {
      enabled: true
    }
  },
  render: {
    html: true,
    console: true,
    defaultView: "package",
    includeDetailedAnalysisToggle: true
  },
  suites: [
    {
      id: "nibbles-type-check",
      label: "Vendored Interpreter Type Check",
      adapter: "shell",
      package: "quality",
      cwd: interpreterDir,
      command: ["yarn", "type-check"],
      module: "tooling",
      theme: "types",
      coverage: {
        enabled: false
      }
    },
    {
      id: "nibbles-build",
      label: "Vendored Interpreter Build",
      adapter: "shell",
      package: "quality",
      cwd: interpreterDir,
      command: ["yarn", "build"],
      module: "tooling",
      theme: "build",
      coverage: {
        enabled: false
      }
    },
    {
      id: "nibbles-loader",
      label: "Nibbles Loader Compatibility",
      adapter: "vitest",
      package: "runtime",
      cwd: interpreterDir,
      command: [
        "yarn",
        "vitest",
        "run",
        "--config",
        "packages/interpreter/vitest.config.ts",
        "packages/interpreter/src/programLoader.test.ts"
      ],
      module: "runtime",
      theme: "loader",
      coverage: {
        enabled: true,
        mode: "second-pass"
      }
    },
    {
      id: "nibbles-runtime",
      label: "Nibbles Runtime And Terminal",
      adapter: "vitest",
      package: "runtime",
      cwd: interpreterDir,
      command: [
        "yarn",
        "vitest",
        "run",
        "--config",
        "packages/interpreter/vitest.config.ts",
        "packages/interpreter/src/core/emulator.test.ts"
      ],
      module: "runtime",
      theme: "playability",
      coverage: {
        enabled: true,
        mode: "second-pass"
      }
    },
    {
      id: "nibbles-ide-flow",
      label: "Nibbles IDE Flow",
      adapter: "vitest",
      package: "ide",
      cwd: interpreterDir,
      command: [
        "yarn",
        "vitest",
        "run",
        "--config",
        "vitest.config.ts",
        "tests/integration/workspace.integration.test.tsx"
      ],
      module: "experience",
      theme: "terminal",
      coverage: {
        enabled: true,
        mode: "second-pass"
      }
    },
    {
      id: "nibbles-browser-e2e",
      label: "Nibbles Browser E2E",
      adapter: "shell",
      package: "browser",
      cwd: interpreterDir,
      command: ["yarn", "test:e2e"],
      module: "experience",
      theme: "browser",
      coverage: {
        enabled: false
      }
    },
    {
      id: "nibbles-browser-benchmark",
      label: "Nibbles Browser Gameplay Benchmark",
      adapter: "shell",
      package: "benchmark",
      cwd: interpreterDir,
      command: ["yarn", "test:performance:browser:test-station"],
      resultFormat: "suite-json-v1",
      module: "experience",
      theme: "benchmark",
      coverage: {
        enabled: false
      }
    }
  ],
  adapters: []
};
