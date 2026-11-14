# Backlog

Open work, one line per item, with the date it was found. Read this at the start of a session; update it at the end. Remove an item when it is done, and move what it taught into `docs/reference/`.

## Unverified in Live 13

- Generators in both menus: on an arrangement selection and on an empty clip slot, including whether `time_selection_start`/`end` are beats and whether Live accepts the overlap backup (2026-10-27).
- The eleven Cross & Morph tools have never been run inside Live (2026-10-26).
- Curve dialogs (Waveset Envelope, Time Stretch, Vari-speed, Brassage): pointer drawing inside Live's dialog WebView (2026-10-22).
- The Max for Live trigger device and the Rack toggle (`/dialog/wait`, `toggleOff`) (device 2026-09-12; toggle 2026-10-09).
- `backup attempt "warped" failed` warnings in the host log (seen 2026-09-20 to 2026-10-05): do the fallback argument shapes succeed?
- Does the dev CLI still kill the host about 10 s after launch (2026-09-12)?

## Defects

- `runCdp` keeps the whole stderr of every run in memory, unbounded (2026-10-04).
- `toolDialogSize` counts mode-hidden params when it sums the dialog height (capped at 680), so mode-heavy dialogs show empty space (noted before 2026-11-14, date not recorded).

## Ideas

- Split `src/tools/registry.ts` (2,267 lines) into one file per group (2026-11-14).
- Single-source the curve format and `bendShape`, now duplicated in `src/ui/curveEditor.ts` and `src/tools/envelope-curve.ts` (2026-10-22).
- A headless endpoint route for generators, so they can be run without a dialog (2026-11-14).
- Build the second-tier processes in section D of `docs/CDP-SHORTLIST.md` (2026-10-04).
- The distribution plan in `DISTRIBUTION.md`: bundle the binaries in the `.ablx` and retest Gatekeeper on another Mac (2026-09-12).
- Test `spec combine` (Spectral Combine) with a louder donor (2026-10-26).
