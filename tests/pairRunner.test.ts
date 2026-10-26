import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  conformTo, runPairWithStereoSupport, reverseAudio, normalizePeak, getChannelCount, getAudioDuration,
} from "../src/runner.js";
import { getFfmpegPath, getFfprobePath } from "../src/config.js";

let binDir: string;
let work: string;
let savedBinDir: string | undefined;

const ff = (...args: string[]) => execFileSync(getFfmpegPath(), ["-v", "error", "-y", ...args]);
const rate = (f: string) => Number(execFileSync(getFfprobePath(), ["-v", "error", "-select_streams", "a:0",
  "-show_entries", "stream=sample_rate", "-of", "csv=p=0", f]).toString().trim());
/** Overall peak in dBFS, from astats (which reports on stderr). */
function astatsPeak(f: string): number {
  const txt = execFileSync("/bin/sh", ["-c", `"${getFfmpegPath()}" -i "${f}" -af astats -f null - 2>&1 | grep "Peak level dB" | tail -1`], { encoding: "utf8" });
  return Number(txt.split(":").at(-1));
}

let mono44: string, stereo44: string, mono48: string;

before(() => {
  savedBinDir = process.env["CDP_BIN_DIR"];
  binDir = mkdtempSync(join(tmpdir(), "cdp-fakebin-"));
  work = mkdtempSync(join(tmpdir(), "cdp-pair-"));
  process.env["CDP_BIN_DIR"] = binDir;
  // interlx out L R → a real stereo merge, so channel counts can be asserted.
  const p = join(binDir, "interlx");
  writeFileSync(p, `#!/bin/sh\n"${getFfmpegPath()}" -v error -y -i "$2" -i "$3" -filter_complex "[0:a][1:a]join=inputs=2:channel_layout=stereo" "$1"\n`);
  chmodSync(p, 0o755);
  mono44 = join(work, "m44.wav"); stereo44 = join(work, "s44.wav"); mono48 = join(work, "m48.wav");
  ff("-f", "lavfi", "-i", "sine=frequency=220:duration=1", "-ar", "44100", "-ac", "1", mono44);
  ff("-f", "lavfi", "-i", "sine=frequency=330:duration=1", "-ar", "44100", "-ac", "2", stereo44);
  ff("-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", "-ar", "48000", "-ac", "1", mono48);
});

after(() => {
  if (savedBinDir === undefined) delete process.env["CDP_BIN_DIR"];
  else process.env["CDP_BIN_DIR"] = savedBinDir;
  rmSync(binDir, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

test("conformTo matches the reference's sample rate and channel count", async () => {
  const out = await conformTo(mono48, stereo44, work);
  assert.equal(rate(out), 44100);
  assert.equal(await getChannelCount(out), 2);
});

test("conformTo returns the file itself when it already matches", async () => {
  assert.equal(await conformTo(mono44, mono44, work), mono44);
});

test("runPairWithStereoSupport pairs channels L with L and R with R", async () => {
  const calls: string[] = [];
  const out = join(work, "pair-st.wav");
  await runPairWithStereoSupport(stereo44, mono48, out, work, async (a, b, o) => {
    calls.push(`${await getChannelCount(a)}/${await getChannelCount(b)}`);
    copyFileSync(a, o);
  });
  assert.deepEqual(calls, ["1/1", "1/1"]);
  assert.equal(await getChannelCount(out), 2);
});

test("runPairWithStereoSupport runs once when both are mono", async () => {
  const out = join(work, "pair-mono.wav");
  let runs = 0;
  await runPairWithStereoSupport(mono44, mono48, out, work, async (a, b, o) => {
    runs++;
    assert.equal(rate(b), 44100);
    copyFileSync(a, o);
  });
  assert.equal(runs, 1);
  assert.equal(await getChannelCount(out), 1);
});

test("a mono clip paired with a stereo sound is processed as dual-mono stereo, not downmixed", async () => {
  const out = join(work, "pair-wide.wav");
  let runs = 0;
  await runPairWithStereoSupport(mono44, stereo44, out, work, async (a, _b, o) => { runs++; copyFileSync(a, o); });
  assert.equal(runs, 2);
  assert.equal(await getChannelCount(out), 2);
});

test("conformTo also matches the sample type (pvoc rejects a 24-bit partner of a 16-bit sound)", async () => {
  const s24 = join(work, "s24.wav");
  ff("-i", mono44, "-c:a", "pcm_s24le", s24);
  const out = await conformTo(s24, mono44, work); // mono44 is 16-bit
  const codec = execFileSync(getFfprobePath(), ["-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", out]).toString().trim();
  assert.equal(codec, "pcm_s16le");
});

test("reverseAudio keeps the length", async () => {
  const out = await reverseAudio(mono44, work);
  assert.ok(Math.abs((await getAudioDuration(out)) - 1) < 0.01);
});

test("normalizePeak brings the peak to the target level", async () => {
  const quiet = join(work, "quiet.wav");
  ff("-i", mono44, "-af", "volume=-30dB", "-c:a", "pcm_f32le", quiet);
  const out = join(work, "norm.wav");
  await normalizePeak(quiet, out, -1);
  assert.ok(Math.abs(astatsPeak(out) - -1) < 0.3, `peak ${astatsPeak(out)}`);
});
