# Testing CDP for Live inside Live

There are two kinds of check. The **smoke test** (`npm run live:smoke`) runs a few tools inside a running Live and checks by itself that each result lands in the right place and that each original is backed up. The **manual checklist** at the end covers what a script cannot do, such as opening dialogs and dragging curve points. Do both after any change to placement, the endpoint or a dialog.

## Build the test set once (about three minutes)

The smoke test only ever touches one track, the track named `CDP TEST`. It refuses to start unless that track is laid out exactly as below, so build this set once and keep it.

1. In Live, choose File > New Live Set. Leave the tempo at 120 BPM and the time signature at 4/4.
2. Rename one audio track to `CDP TEST` (select its title bar and press Cmd+R). Use capital letters and one space, exactly as written. You can delete the other tracks or leave them; the test does not touch them.
3. Press Tab to go to the Arrangement View. Keep each clip below shorter than 8 bars (16 seconds), so that it ends before the next one starts. Samples between 4 and 14 seconds long work well.
4. **Clip A.** Drag a stereo sample, at least 2 seconds long, from the browser onto the `CDP TEST` track at bar 1. Double-click the clip to open the Clip View and switch **Warp** off.
5. **Clip B.** Drag a sample (the same one is fine) onto the track at bar 9. Leave **Warp** on.
6. **Clip C.** Drag a sample onto the track at bar 16. Switch **Warp** off. Then drag the clip's left edge to the right until it snaps to bar 17. The clip now starts at bar 17 with its beginning trimmed off, which is what the test needs.
7. Press Tab to go to the Session View. Drag any audio clip into the first (top) clip slot of the `CDP TEST` track.
8. In Finder, make a folder named `ableton_cdp_testsession Project` wherever you keep projects. Back in Live, choose File > Save Live Set As…, open that folder and save the set as `cdp-smoke`. The file is then `ableton_cdp_testsession Project/cdp-smoke.als`. Choosing File > Collect All and Save afterwards copies the samples into the project, so the set keeps working if the original samples move.
9. Optionally, duplicate `cdp-smoke.als` in Finder and keep the copy as a spare, in case the set is ever saved after a test by mistake.

## Run the smoke test

1. Install the build you want to test: run `npm run deploy` in the project folder, then quit and restart Live.
2. Open `cdp-smoke.als`. Close any CDP dialog that is open.
3. In Terminal, in the project folder, run `npm run live:smoke`. Do not use Live while it runs. Each tool shows Live's progress bar while it runs, and the test waits for each one to finish before starting the next.

### What it checks before it changes anything

- That Live is running the same build as the code in front of you. If not, it tells you to run `npm run deploy` and restart Live. To test whatever build is installed anyway, run `npm run live:smoke -- --any-build`.
- That the open set has a track named exactly `CDP TEST`.
- That the track is laid out as described above: clip A at bar 1 with warp off, clip B at bar 9 with warp on, clip C at bar 17 with warp off and its start trimmed, and a clip in the first session slot.

If any of these fail, it says what is wrong, ends with "Nothing was changed", and leaves the set exactly as it was.

### What it runs

It prints one `PASS` or `FAIL` line for each of these eight cases, in this order:

1. Reverse on clip A. The result must start where A started, and a copy of the original A must appear on a "CDP Originals" lane.
2. Reverse again on that result. This must not add another "CDP Originals" lane. This case is known to fail until the fix for the growing lanes lands.
3. Pitch Shift on clip B, which is warped. The result must have warp off and end exactly where B ended.
4. Waveset Repeat on clip C, which is trimmed. The result must start where C started, and a copy of C must appear on a "CDP Originals" lane.
5. Reverb on the clip in the first session slot. The slot must then hold the result.
6. Convolve on the clip at bar 1, using that clip reversed as the second sound. It must finish without an error.
7. Two requests the extension must refuse: opening the Rack, and Reverse with malformed settings. Both must be refused, and the track must be unchanged afterwards.
8. No new errors from the extension in Live's Extension Host log since the test began.

It exits successfully only when all eight pass. It ends by printing how many passed.

### What it changes

Cases 1 to 6 replace clips A, B and C and the session clip with their results, add "CDP Originals" lanes holding the originals, and add the new audio files to the project. All of this happens on the `CDP TEST` track only.

### Afterwards

**Do not save the set.** Either close it and choose "Don't Save", or choose File > Revert to go back to the saved version, ready for the next test. If you saved by mistake, replace `cdp-smoke.als` with your spare copy, or build the set again.

### Settings

- If you set `CDP_TOKEN` for the endpoint, set the same value in Terminal before running the test; it sends it with every request.
- If the endpoint uses another port (`CDP_PORT`), set the same value in Terminal too.

## Manual checklist

The smoke test runs tools without dialogs, so these still need a person. Work through them on a copy of the test set (or revert afterwards).

- [ ] A plain tool's dialog opens from the clip's right-click menu (for example CDP: Reverse), runs, and its result replaces the clip.
- [ ] A dialog with a curve editor opens (for example CDP: Time Stretch or CDP: Waveset Envelope).
- [ ] In that curve editor, dragging a point moves it, and running the tool uses the drawn curve.
- [ ] A dialog with a second-sound picker opens (for example CDP: Convolve) and lists the set's other clips.
- [ ] The Rack (CDP: All Tools…) opens, shows its grid of effects, and runs one.
- [ ] The Max for Live button toggles the Rack: one press opens it on the selected clip, the next press closes it.
- [ ] A generator runs from a time selection: select a range on an audio track in the Arrangement View, right-click it, and choose a CDP: Generate… item. A new clip fills the selection.
- [ ] A generator runs from an empty session slot: right-click an empty slot on an audio track and choose a CDP: Generate… item. A new clip appears in the slot.
- [ ] An error dialog opens when a run fails, names what failed, and closes with its button. One way to make a run fail: rename a session clip's sample file in Finder so that Live shows it as missing, then run any tool on that clip.
