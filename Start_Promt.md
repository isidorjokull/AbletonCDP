# CDP for Live — Ableton Extensions SDK
## Claude Code Execution Plan

---

## Project Summary

Build `cdp-for-live`: an Ableton Extensions SDK plugin (TypeScript/Node.js) that exposes Composers Desktop Project **Release 8** audio processing tools as right-click actions on AudioClips inside Ableton Live Suite 12.4.5+.

**CDP8 source:** `https://github.com/ComposersDesktop/CDP8`
**Approach:** Shell out to local CDP8 binaries via `child_process.spawn`. No WASM in v0.1.

**Target tools (v0.1):**
- `sfpitch` — pitch shift (semitones, no time change)
- `sfgran` — granular processing (density, pitch scatter, time scatter)
- Spectral freeze (CDP spectral family)
- `pvoc` — PVOC-based time stretch (CDP8 has extended PVOC toolset)

**Platform:** macOS/Apple Silicon first. CDP8 built natively as arm64. CDP binary path user-configurable.

---

## Prerequisites (verify before starting)

```
- Live 12.4.5 beta installed at /Applications/Ableton\ Live\ 12\ Beta.app
- Ableton Extensions SDK downloaded and unzipped (ask user for path)
- Node.js v24.16.0 (LTS) — verify: node --version
- Xcode Command Line Tools — verify: xcode-select -p
- CDP8 binaries built for arm64 — see Phase 0b below
  (interim fallback: Intel build via Rosetta — verify: which sfpitch)
- npm available
```

**STOP if any prerequisite is missing. Report which and halt.**

---

## Phase 0 — Read SDK before writing any code

This is mandatory. The SDK API shapes are not in training data.

```bash
# Ask user: "Where did you unzip the Extensions SDK?"
# Then read these paths (adjust to actual SDK location):
find $SDK_PATH -name "*.ts" -not -path "*/node_modules/*" | head -40
find $SDK_PATH -name "*.d.ts" | head -20
find $SDK_PATH -name "manifest*.json" | head -10
find $SDK_PATH -name "README*" -o -name "*.md" | head -10
```

Read and internalize:
1. All `.d.ts` type definition files → learn the actual API (clip.filePath, importAudioFile, etc.)
2. Every bundled example extension → learn manifest format, action handler signature, dialog API
3. The README → learn build/run commands

**Do not guess API method names. Use only what the type definitions confirm.**

Record these in a scratch note before Phase 1:
- Exact method to get AudioClip file path
- Exact method to import a new audio file into the Set
- Manifest `actions` / `scopes` schema
- Dialog / parameter input API
- Entry point export signature

### Reference: CDP_MCP

Before writing any tool argument code, read `https://github.com/DavidPiazza/CDP_MCP` — a Python MCP server wrapping CDP that handles direct binary execution with no interpretation. Use it as a reference for:
- How CDP binaries are called (arg ordering patterns)
- Which CDP8 programs map to which processes
- Program category structure (Spectral, Time Domain, Synthesis, etc.)

---

## Phase 0b — Build CDP8 for Apple Silicon (arm64)

Do this before Phase 1. The official CDP8 Mac download is Intel-only. Building from source produces a native arm64 binary with no Rosetta overhead.

```bash
# 1. Clone CDP8
git clone https://github.com/ComposersDesktop/CDP8.git
cd CDP8

# 2. Find the macOS CMakeLists or Makefile
ls -la
# Look for: CMakeLists.txt, makefile.osx, or similar

# 3. If CMake-based:
mkdir build && cd build
cmake .. -DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_BUILD_TYPE=Release

# 4. Disable portaudio before building — it's the main ARM obstacle
# In CMakeLists.txt, comment out or set OFF any portaudio / soundfile playback targets.
# Programs requiring portaudio are runtime playback tools; our Extension doesn't need them.
# Search: grep -ri "portaudio" CMakeLists.txt

# 5. Build
make -j$(sysctl -n hw.logicalcpu)

# 6. Verify binary architecture
file ./bin/sfpitch
# Expected: Mach-O 64-bit executable arm64

# 7. Test a basic process
./bin/sfpitch --help
```

### Known issue: filter bank bug on M-series Macs

There is a confirmed bug with CDP filter bank processes on M-series Macs. Fix is documented at:
`https://github.com/j-p-higgins/SoundThread/issues/84`

Read that issue and apply the fix to the source before building. It affects: `filter`, `fltbands`, and related filter bank programs. Our four target tools (pitch, granular, spectral freeze, PVOC stretch) are not filter bank tools, but apply the fix anyway for correctness.

### If CMake build fails

Fall back to Makefile approach:
```bash
# Look for makefile.osx or similar in the CDP8 root
make -f makefile.osx ARCH=arm64
# Or try: CFLAGS="-arch arm64" make -f makefile.osx
```

If both fail, **do not continue** — report the error output and halt. Do not proceed with Rosetta silently.

### After successful build

Set the bin directory for the project:
```bash
export CDP_BIN_DIR=/path/to/CDP8/build/bin
# Confirm:
$CDP_BIN_DIR/sfpitch  # should print usage, not "command not found"
```

Note the actual bin path — it will be hardcoded as the default in `config.ts`.

---

## Phase 1 — Scaffold

### 1.1 Create project directory

```
cdp-for-live/
├── CLAUDE.md                 ← this file
├── package.json
├── tsconfig.json
├── manifest.json
├── src/
│   ├── index.ts              ← entry point, registers all actions
│   ├── runner.ts             ← CDP binary executor (child_process)
│   ├── config.ts             ← CDP binary path resolution
│   ├── tools/
│   │   ├── pitch.ts
│   │   ├── granular.ts
│   │   ├── spectral-freeze.ts
│   │   └── timestretch.ts
│   └── ui/
│       └── dialogs.ts        ← parameter dialog definitions per tool
└── dist/                     ← build output (gitignored)
```

### 1.2 package.json

Use the SDK's own `package.json` from a bundled example as the template.
Add no extra dependencies in v0.1 — standard Node.js built-ins only.

```json
{
  "name": "cdp-for-live",
  "version": "0.1.0",
  "description": "CDP audio processing tools as Ableton Live Extensions",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "npm run build && <sdk-start-command>"
  },
  "devDependencies": {
    "typescript": "^5.x"
  }
}
```
Replace `<sdk-start-command>` with exact command from SDK README.

### 1.3 tsconfig.json

Copy from SDK example, adjust `rootDir: "src"` and `outDir: "dist"`.

### 1.4 manifest.json

```json
{
  "name": "CDP for Live",
  "version": "0.1.0",
  "author": "Dori",
  "actions": [
    { "id": "cdp.pitch",           "name": "CDP: Pitch Shift",     "scope": "AudioClip" },
    { "id": "cdp.granular",        "name": "CDP: Granular",        "scope": "AudioClip" },
    { "id": "cdp.spectralFreeze",  "name": "CDP: Spectral Freeze", "scope": "AudioClip" },
    { "id": "cdp.timestretch",     "name": "CDP: Time Stretch",    "scope": "AudioClip" }
  ]
}
```

**Adjust scope field name and action schema to match actual SDK manifest format.**

---

## Phase 2 — CDP runner (`src/runner.ts`)

Core utility. All tools use this. No tool reimplements process spawning.

```typescript
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getCdpBinDir } from './config';

export interface CdpResult {
  outputPath: string;
}

/**
 * Run a CDP binary with args.
 * inputPath  — source audio file
 * outputPath — destination (caller constructs, must be in same dir or writable path)
 * binary     — e.g. 'sfpitch'
 * args       — all positional args AFTER input/output, per CDP usage
 */
export async function runCdp(
  binary: string,
  inputPath: string,
  outputPath: string,
  args: string[]
): Promise<CdpResult> {
  const binDir = getCdpBinDir();
  const binPath = path.join(binDir, binary);

  if (!fs.existsSync(binPath)) {
    throw new Error(
      `CDP binary not found: ${binPath}\nSet CDP_BIN_DIR env or configure in Extension settings.`
    );
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, [inputPath, outputPath, ...args]);

    let stderr = '';
    proc.stderr.on('data', d => (stderr += d.toString()));
    proc.stdout.on('data', d => console.log(d.toString())); // debug only

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`${binary} exited ${code}:\n${stderr}`));
      } else if (!fs.existsSync(outputPath)) {
        reject(new Error(`${binary} ran but output file missing: ${outputPath}`));
      } else {
        resolve({ outputPath });
      }
    });

    proc.on('error', err => reject(new Error(`Failed to spawn ${binary}: ${err.message}`)));
  });
}

/** Build a unique output path alongside the source file. */
export function buildOutputPath(inputPath: string, suffix: string): string {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const ext = path.extname(inputPath);
  return path.join(dir, `${base}_cdp_${suffix}_${Date.now()}${ext}`);
}
```

---

## Phase 3 — Config (`src/config.ts`)

```typescript
/**
 * Resolve CDP8 binary directory.
 * Priority: CDP_BIN_DIR env → common build/install paths → throw.
 */
export function getCdpBinDir(): string {
  if (process.env.CDP_BIN_DIR) return process.env.CDP_BIN_DIR;

  const candidates = [
    // CDP8 built from source (default cmake output)
    `${process.env.HOME}/CDP8/build/bin`,
    `${process.env.HOME}/CDP8/bin`,
    `${process.env.HOME}/cdpr8/bin`,
    // Standard install locations
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${process.env.HOME}/bin`,
  ];

  // Return first dir where sfpitch exists as a signal CDP is installed
  const { existsSync } = require('fs');
  const { join } = require('path');
  for (const dir of candidates) {
    if (existsSync(join(dir, 'sfpitch'))) return dir;
  }

  throw new Error(
    'CDP8 binaries not found.\n' +
    'Build CDP8 from source (see Phase 0b in CLAUDE.md) then set:\n' +
    'export CDP_BIN_DIR=/path/to/CDP8/build/bin'
  );
}
```

---

## Phase 4 — Tool implementations

Implement one at a time. Test each against the running beta before moving to the next.

### 4.1 `src/tools/pitch.ts`

```typescript
import { runCdp, buildOutputPath } from '../runner';

export interface PitchParams {
  semitones: number;   // range: -24 to +24
}

export async function pitchShift(inputPath: string, params: PitchParams): Promise<string> {
  const output = buildOutputPath(inputPath, 'pitch');
  // CDP sfpitch usage: sfpitch infile outfile semitones
  await runCdp('sfpitch', inputPath, output, [String(params.semitones)]);
  return output;
}
```

### 4.2 `src/tools/granular.ts`

```typescript
import { runCdp, buildOutputPath } from '../runner';

export interface GranularParams {
  density: number;       // grains per second
  pitchScatter: number;  // semitone scatter (0–12)
  timeScatter: number;   // position scatter in ms
  duration: number;      // output duration multiplier
}

export async function granular(inputPath: string, params: GranularParams): Promise<string> {
  const output = buildOutputPath(inputPath, 'gran');
  // Verify exact sfgran arg order against CDP docs / man page
  await runCdp('sfgran', inputPath, output, [
    String(params.density),
    String(params.pitchScatter),
    String(params.timeScatter),
    String(params.duration),
  ]);
  return output;
}
```

### 4.3 `src/tools/spectral-freeze.ts`

```typescript
import { runCdp, buildOutputPath } from '../runner';

export interface SpectralFreezeParams {
  position: number;    // position in file to freeze (0.0–1.0)
  duration: number;    // output duration in seconds
  windowSize: number;  // FFT window size (256, 512, 1024, 2048)
}

export async function spectralFreeze(inputPath: string, params: SpectralFreezeParams): Promise<string> {
  const output = buildOutputPath(inputPath, 'specfreeze');
  // CDP spectral freeze — verify exact binary name and arg order
  await runCdp('specenv', inputPath, output, [
    String(params.position),
    String(params.duration),
    String(params.windowSize),
  ]);
  return output;
}
```

### 4.4 `src/tools/timestretch.ts`

```typescript
import { runCdp, buildOutputPath } from '../runner';

export interface TimeStretchParams {
  ratio: number;       // 0.25 (4× faster) to 4.0 (4× slower)
}

export async function timeStretch(inputPath: string, params: TimeStretchParams): Promise<string> {
  const output = buildOutputPath(inputPath, 'stretch');
  // CDP8 extends the PVOC toolset significantly. Verify exact binary and arg order
  // against CDP8 docs. Likely candidates: pvoc, pvocex, or a dedicated stretch program.
  // Run: $CDP_BIN_DIR/pvoc to see usage before hardcoding args.
  await runCdp('pvoc', inputPath, output, [String(params.ratio)]);
  return output;
}
```

> ⚠️ **Note for Claude Code:** CDP binary names and exact argument order MUST be verified against the CDP documentation or by running `<binary> --help` before finalising each tool. The names above are based on typical CDP conventions but may differ in the installed version.

---

## Phase 5 — Parameter dialogs (`src/ui/dialogs.ts`)

Use whatever dialog / parameter input API the SDK provides. Verify from SDK type definitions.

Define params for each tool. Each dialog should use the SDK's native input types (number sliders, text fields) — do not build custom HTML unless the SDK provides a webview API.

```typescript
// Adjust to actual SDK dialog API — these are illustrative
export const pitchDialog = {
  title: 'CDP: Pitch Shift',
  params: [
    { id: 'semitones', label: 'Semitones', type: 'number', default: 5, min: -24, max: 24, step: 1 },
  ],
};

export const granularDialog = {
  title: 'CDP: Granular',
  params: [
    { id: 'density',      label: 'Grain density (grains/s)', type: 'number', default: 20,  min: 1,   max: 200, step: 1 },
    { id: 'pitchScatter', label: 'Pitch scatter (semitones)', type: 'number', default: 2,   min: 0,   max: 12,  step: 0.5 },
    { id: 'timeScatter',  label: 'Time scatter (ms)',         type: 'number', default: 50,  min: 0,   max: 500, step: 10 },
    { id: 'duration',     label: 'Duration multiplier',       type: 'number', default: 1.0, min: 0.1, max: 4.0, step: 0.1 },
  ],
};

export const spectralFreezeDialog = {
  title: 'CDP: Spectral Freeze',
  params: [
    { id: 'position',   label: 'Freeze position (0–1)', type: 'number', default: 0.5, min: 0, max: 1,    step: 0.01 },
    { id: 'duration',   label: 'Output duration (s)',   type: 'number', default: 5,   min: 1, max: 60,   step: 1 },
    { id: 'windowSize', label: 'FFT window size',       type: 'select', default: 1024, options: [256, 512, 1024, 2048] },
  ],
};

export const timeStretchDialog = {
  title: 'CDP: Time Stretch',
  params: [
    { id: 'ratio', label: 'Time ratio (0.25–4.0)', type: 'number', default: 2.0, min: 0.25, max: 4.0, step: 0.25 },
  ],
};
```

---

## Phase 6 — Entry point (`src/index.ts`)

Wire everything together. Adjust handler signature to match actual SDK.

```typescript
import { pitchShift }      from './tools/pitch';
import { granular }        from './tools/granular';
import { spectralFreeze }  from './tools/spectral-freeze';
import { timeStretch }     from './tools/timestretch';
import {
  pitchDialog, granularDialog, spectralFreezeDialog, timeStretchDialog,
} from './ui/dialogs';

// SDK will call these handlers. Adjust signature from type definitions.
export const actions = {

  'cdp.pitch': async (context: AudioClipContext) => {
    const params = await context.showDialog(pitchDialog);
    if (!params) return; // user cancelled
    const inputPath = context.clip.filePath; // verify exact property name
    const outputPath = await pitchShift(inputPath, params as any);
    await context.set.importAudioFile(outputPath); // verify exact method
  },

  'cdp.granular': async (context: AudioClipContext) => {
    const params = await context.showDialog(granularDialog);
    if (!params) return;
    const outputPath = await granular(context.clip.filePath, params as any);
    await context.set.importAudioFile(outputPath);
  },

  'cdp.spectralFreeze': async (context: AudioClipContext) => {
    const params = await context.showDialog(spectralFreezeDialog);
    if (!params) return;
    const outputPath = await spectralFreeze(context.clip.filePath, params as any);
    await context.set.importAudioFile(outputPath);
  },

  'cdp.timestretch': async (context: AudioClipContext) => {
    const params = await context.showDialog(timeStretchDialog);
    if (!params) return;
    const outputPath = await timeStretch(context.clip.filePath, params as any);
    await context.set.importAudioFile(outputPath);
  },
};
```

---

## Phase 7 — Error handling

Every action handler must wrap execution in try/catch and surface errors to the user via the SDK's error/alert API (verify method from type definitions).

```typescript
// Wrap each action like this:
'cdp.pitch': async (context: AudioClipContext) => {
  try {
    const params = await context.showDialog(pitchDialog);
    if (!params) return;
    const outputPath = await pitchShift(context.clip.filePath, params as any);
    await context.set.importAudioFile(outputPath);
  } catch (err: any) {
    await context.showError(err.message); // verify SDK error display method
    console.error('[cdp-for-live] pitch error:', err);
  }
},
```

---

## Phase 8 — Build and install

```bash
npm run build
# Then follow SDK packaging/install steps from README
# In Live Settings → Extensions → install cdp-for-live
# Right-click an AudioClip → check for CDP submenu
```

---

## Testing order

1. Verify CDP8 arm64 build: `file $CDP_BIN_DIR/sfpitch` → must show `arm64`, not `x86_64`
2. Verify CDP binaries found by Extension: open Live, right-click AudioClip → "CDP: Pitch Shift" → should open dialog (not error about missing binaries)
3. Pitch shift on a short test clip (known file)
4. Verify output file appears in expected path
5. Verify imported clip appears in Live
6. Repeat for each tool
7. Test cancelling dialog → no crash, no orphaned file
8. Test with CDP_BIN_DIR unset → clear error message pointing to CLAUDE.md Phase 0b

---

## Known unknowns (resolve in Phase 0)

| Unknown | Where to find answer |
|---|---|
| `AudioClip.filePath` exact property name | SDK `.d.ts` type definitions |
| `importAudioFile` exact method + signature | SDK `.d.ts` type definitions |
| Dialog/param API: method name, param schema | SDK examples + `.d.ts` |
| Error display method | SDK `.d.ts` |
| Manifest `actions` exact schema | SDK example manifests |
| Entry point export: `actions` object vs named exports | SDK examples |
| Progress dialog for long-running CDP processes | SDK `.d.ts` |
| Exact CDP8 binary names for each tool | Run `ls $CDP_BIN_DIR` + `<binary> --help` |
| CDP8 PVOC stretch: `pvoc`, `pvocex`, or other? | CDP8 docs + CDP_MCP reference |

---

## Out of scope for v0.1

- WASM compilation of CDP
- Windows support
- CDP tools beyond the four listed
- Batch processing multiple clips
- Preview playback before import
- Undo/redo integration
- Extension settings UI for CDP path (env var is sufficient for now)
