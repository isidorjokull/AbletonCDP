# Distribution plan — sharing CDP for Live without the macOS security dance

Status: **planned, not implemented.** Investigated 2026-09-12.

Goal: hand someone a single file they drop into Live, with no CDP install, no
Terminal, and no "developer cannot be verified" dialogs.

---

## Key finding: Gatekeeper is not the obstacle

> **Correction, 2026-10-04 — this section only holds for binaries the user has
> already approved.** Launching ~190 never-run CDP binaries from a shell raised
> a Gatekeeper "Not Opened / could not verify" dialog per binary. The quarantine
> flags explain it: approved binaries carry `00c1;…`, never-run ones `0081;…`
> (the "user approved" bit unset). The `pvocex2` test below passed because
> `pvocex2` was already approved. So binaries vendored inside a downloaded
> `.ablx` may well be blocked on a recipient's Mac: strip
> `com.apple.quarantine` on install (or sign/notarize) and retest on a clean
> machine before shipping.

**Verified empirically, not assumed.** A fresh copy of `pvocex2` was stamped with
a Safari-style quarantine attribute and executed:

```
$ xattr -w com.apple.quarantine "0081;68000000;Safari;<uuid>" ./qtest
$ ./qtest
rc=1   PVOCEX2 v1.0.2 RWD Nov 2025 ... (usage banner)
```

Byte-identical behaviour to an un-quarantined control. The installed binaries in
`~/cdpr8/_cdp/_cdprogs` *also* still carry `com.apple.quarantine`
(`00c1;6a1f51ef;Arc;...`, from the Arc download) and have always worked.

**Why:** Gatekeeper's quarantine check lives in **LaunchServices**, not in
`exec(2)`. The scary dialog fires for Finder double-clicks and `open`. A bare
Mach-O invoked by `spawn()` from an already-running process — exactly what
`runCdp` does (`src/runner.ts:17`) — never touches that path.

The security steps previously encountered came from double-clicking
`cdp8install.command` / `soundloomE.app` in Finder. The extension never goes
through that door.

**Consequence: no Developer ID ($99/yr), no `codesign`, no `notarytool`, no
stapling. They buy nothing here. Skip them.**

Binaries are also fully relocatable — `otool -L` shows only
`/usr/lib/libSystem.B.dylib` and `/usr/lib/libc++.1.dylib`. No Homebrew dylibs,
no `@rpath`. They can be placed anywhere.

---

## What actually blocks a recipient

1. **Hardcoded path.** `src/config.ts` only searches a few fixed locations
   (`$HOME/cdpr8/_cdp/_cdprogs` first), which only match if they installed CDP
   identically; `CDP_BIN_DIR` overrides.
2. **Requiring a CDP R8 install** (69 MB + running `cdp8install.command`, which
   *is* a Finder launch and therefore *is* where the dialog appears). Avoidable —
   only **20 of 232 binaries** are ever invoked, totalling **7.3 MB**.
3. **ffmpeg/ffprobe.** `getFfmpegPath()` probes `/opt/homebrew/bin`,
   `/usr/local/bin`, … and otherwise throws "brew install ffmpeg". A
   non-technical recipient has no Homebrew.
4. **Rosetta 2.** Binaries are `Mach-O 64-bit executable x86_64`. Without
   Rosetta, `spawn` fails `Bad CPU type in executable` with no OS prompt (the
   auto-install prompt is also a LaunchServices behaviour).
5. **Live 12 developer mode** + Extensions SDK beta. Unavoidable.

### The 20 binaries actually used

```
blur bounce constrict distort envel envnu extend glisten grain hover
interlx modify pvoc pvocex2 reverb sfecho specfold spectstr strange superaccu
```

(7.34 MB total. Derived from every `runCdp(...)` call site in `src/`.)

---

## The plan

### 1. Vendor the binaries — `vendor/cdp/` (7.3 MB)

`extensions-cli package` supports `-i/--include`, **relative paths only**
(absolute paths are rejected: "Included path must be relative").

```bash
extensions-cli package . -o cdp-for-live.ablx -i vendor
```

**Verified: the zip preserves the executable bit.**

```
-rwxr-xr-x  4.5 unx   121048 bl    44741 defN  vendor/cdp/pvocex2
```

Result: one ~8 MB `.ablx`, nothing for the recipient to install.

### 2. Make `getCdpBinDir()` prefer the bundled copy

Resolve relative to the bundle, keeping `CDP_BIN_DIR` and the existing
candidates as fallbacks:

```ts
const bundled = join(__dirname, "..", "vendor", "cdp");   // dist/ → bundle root
if (pathExists(join(bundled, "pvocex2"))) return bundled;
```

- `__dirname` is available because esbuild emits **CJS** (`build.ts`).
- `pathExists` already falls back to `/bin/test` when the Extension Host sandbox
  refuses `existsSync` (CLAUDE.md gotcha #10), so reading outside
  `storageDirectory` is fine.

### 3. (Optional) Bundle ffmpeg/ffprobe too

Same mechanism; add the bundled dir as the first candidate in `findBinary()`.

Caveats:
- ~80 MB for the static pair — roughly 10× the bundle size.
- **The common static builds are GPL.** Redistributing one inherits GPL
  obligations across the whole bundle. Use an LGPL build (no `--enable-gpl`) or
  keep the Homebrew requirement and just improve the error message.

### 4. Open unknown — test in Live

Does Live's `.ablx` installer preserve `0755` when unpacking? The zip carries
the bit correctly, but Live's unzip behaviour is unverified and **cannot be
determined statically — it needs a real install**.

If the bit is dropped, `chmod` on first run from the extension:
`spawn("/bin/chmod", ["+x", ...])` — permitted, since `child_process` is allowed
under the sandbox.

---

## Licensing

CDP Release 8 is open-sourced by the Composers Desktop Project, so
redistributing the binaries is likely fine with attribution — but **no licence
file was found anywhere under `~/cdpr8`** (only PDFs in `docs/`). Confirm
against the CDP8 GitHub repo's LICENSE before shipping binaries. Add a
`THIRD-PARTY.md` crediting CDP either way.

---

## Effort

- **Steps 1, 2, 4** — ~1 hour. Single-file drop-in requiring only Live 12 dev
  mode + ffmpeg. This is the recommended scope.
- **Plus step 3** — zero external dependencies, but ~10× size and a licence
  decision.
