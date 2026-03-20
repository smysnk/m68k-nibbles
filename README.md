# m68k-nibbles

[![tests](https://img.shields.io/endpoint?url=https%3A%2F%2Ftest-station.smysnk.com%2Fapi%2Fbadges%2Ftests.json%3FprojectKey%3Dm68k-nibbles)](https://test-station.smysnk.com/projects/m68k-nibbles)
[![coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Ftest-station.smysnk.com%2Fapi%2Fbadges%2Fcoverage.json%3FprojectKey%3Dm68k-nibbles)](https://test-station.smysnk.com/projects/m68k-nibbles)
[![health](https://img.shields.io/endpoint?url=https%3A%2F%2Ftest-station.smysnk.com%2Fapi%2Fbadges%2Fhealth.json%3FprojectKey%3Dm68k-nibbles)](https://test-station.smysnk.com/projects/m68k-nibbles)
[![npm](https://img.shields.io/badge/npm-unpublished-cb3837?logo=npm&logoColor=white)](package.json)

Report: [Hosted project history](https://test-station.smysnk.com/projects/m68k-nibbles)

Nibbles for the Motorola 68000, with the original `nibbles.asm` source plus a modern terminal-first interpreter and CI/test reporting setup.

![Nibbles demo 0](docs/nibbles0.gif)

![Nibbles demo 1](docs/nibbles1.gif)

## Current Status

- `nibbles.asm` is still the source of truth for the game.
- The repo now includes a vendored React/Yarn workspace version of `m68k-interpreter` in [references/m68k-interpreter](references/m68k-interpreter).
- That interpreter has been extended with the Easy68K subset needed by Nibbles:
  - compatibility loader for the Nibbles assembly dialect
  - runtime support for the instructions and addressing modes used by the game
  - terminal device support for the game’s text-screen output
  - keyboard input and trap handling for gameplay
  - IDE support for loading and running Nibbles directly
- The interpreter is split into separate workspace packages:
  - `packages/interpreter`
  - `packages/ide`
- Test coverage and CI results are now reported through `test-station` for both:
  - the Nibbles-focused project surface
  - the full interpreter workspace

## Run The Browser IDE

The current recommended way to play is through the vendored interpreter workspace.

```sh
coming soon
```

Then open the local Vite URL, click `Load Nibbles`, and press `Run`.

Controls:

- `W`, `A`, `S`, `D`
- arrow keys
- keypad `4`, `5`, `6`, `8`
- `Enter` for menus
