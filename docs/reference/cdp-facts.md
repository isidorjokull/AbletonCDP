# CDP facts

Verified facts about the CDP (Composers Desktop Project, Release 8) programs this extension runs. Every fact here was found by running the binary, not by reading the documentation alone. A date in parentheses is the day the fact was verified; a fact without a date was verified before dates were recorded, so re-check it before relying on an edge case.

When a new fact supersedes one here, replace the old one rather than adding beside it.

Where the binaries live:

- The Intel (x86_64) build of CDP 8 is installed in `~/cdpr8/_cdp/_cdprogs/` and runs under Rosetta 2. It is not an arm64 build. `src/config.ts` resolves the folder; the `CDP_BIN_DIR` environment variable overrides it.
- One program, `filter`, is run from a patched native arm64 build in `~/CDP8/NewRelease/` (see `## filter`). `getNativeCdpBinDir()` resolves that folder; `CDP_NATIVE_BIN_DIR` overrides it.
- The binaries are relocatable: `otool -L` shows only `/usr/lib/libSystem.B.dylib` and `/usr/lib/libc++.1.dylib`, with no Homebrew libraries and no `@rpath` (2026-09-12).
- The HTML documentation is in `~/cdpr8/docs/html/*.htm`; `alphindex.htm` is the A to Z index of 483 functions (2026-07-05). There is no licence file anywhere under `~/cdpr8` (only PDFs in `docs/`); confirm CDP 8's licence on GitHub before redistributing any binary (2026-09-12).
- The real program names differ from the guesses in the original plan: there is no `sfpitch` and no `sfgran`.

## blur

Spectral processes. Each takes analysis files, so the tool runs `pvoc anal 1` first and `pvoc synth` after, on mono channels only (see `## pvoc` and the stereo rules).

- `blur blur in.ana out.ana N` (Spectral Blur). The tool forces `N` to be odd.
- `blur chorus 2 in.ana out.ana fspread` (Spectral Chorus).
- `blur drunk in.ana out.ana range starttime duration -z` (Spectral Drunk): a random walk through the analysis frames. Pass `duration` = the input length (from `getAudioDuration`) to keep the length; `-z` drops zero steps (2026-07-05).
- `blur spread in.ana out.ana -fN -sSPREAD` (Spectral Spread): `-f` is the number of formant channels, `-s` the spread from 0 to 1 (2026-07-05).
- `blur weave` takes a text file listing the weave steps, which the tool writes from its sliders.

## bounce

- `bounce bounce in out count startgap shorten endlevel ewarp`. Stereo-native.

## caltrain

- `blurfact` must not exceed the clip length (2026-10-04).

## cantor

- `cantor set <mode> in out …`: the mode goes BEFORE the file names, although the usage text shows it after them. With no arguments, or with two, the program prints no usable usage, which is why it was first skipped (2026-07-05; syntax found 2026-10-04).
- It writes a numbered sequence `out0.wav`, `out1.wav`, … instead of one file. The tool runs it in a private temporary subfolder and joins the pieces with `concatAudio` (2026-10-04).
- Mono-only, so it is wrapped (2026-10-04).

## cascade

- Mode 1 is stereo-native (2026-10-04).
- With `-N4`, `clipsize` must be greater than 0.06 (2026-10-04).

## clip

- Mode 2 is mono-only, so it is wrapped (2026-10-04).

## combine

- `combine mean <mode> a.ana b.ana out.ana …` (Spectral Mean) and `combine <method> a.ana b.ana out.ana …` (Spectral Combine) are two-input spectral processes (2026-10-26). The two-input rules in `## Cross-program rules` apply.

## constrict

- `constrict constrict in out constriction`. Stereo-native.

## distmore, distrep, distshift, distwarp

- `distmore`, `distrep`, `distshift` and `distwarp` mode 2 are mono-only, so they are wrapped (2026-10-04).

## distort

All `distort` (waveset) processes are mono-only and go through `runWithStereoSupport`, except where noted.

- `distort overload 1 in out cliplevel depth` (Overload).
- `distort fractal in out scaling loudness` (Fractal). `scaling` must be an integer.
- `distort repeat in out multiplier -cN` (Waveset Repeat) (2026-07-05).
- `distort reverse in out cyclecnt` (Waveset Reverse) (2026-07-05).
- `distort divide in out N [-i]` (Waveset Divide): a frequency divider that makes sub-octaves. `N` is an integer from 2 to 16; `-i` gives a cleaner result (2026-07-05).
- `distort interpolate in out multiplier` (Waveset Interpolate): repeats and interpolates wavecycles, which stretches the sound by `multiplier` (an integer, at least 2) (2026-07-05).
- `distort telescope in out cyclecnt [-a]` (Waveset Telescope): collapses `cyclecnt` cycles into one, which shortens the sound. `-a` uses the average cycle length (2026-07-05).
- `distort omit in out A B` (Waveset Omit): silences `A` of every `B` cycles. `A` must be less than `B`, so the tool clamps `A` to `min(A, B − 1)` (2026-07-05).
- `distort multiply in out N [-s]`, `distort reform 1–7 in out` and `distort reform 8 in out exag`, `distort average in out cyclecnt`, and `distort pitch in out octvary -c<cyclelen>` (2026-10-04).
- `distort envel`: modes 1 and 2 are `distort envel 1|2 in out cyclecnt -t<trough> [-e<exp>]`; mode 3 is `distort envel 3 in out cyclecnt trough [-e<exp>]` (here `trough` is positional); mode 4 is `distort envel 4 in out envfile cyclecnt` and takes no `-t` or `-e` (2026-10-04). In mode 4 the envelope file's times are arbitrary units, stretched to each group of wavecycles (2026-10-22).
- Every numeric argument of `distort envel` may be a breakpoint file, positional (`cyclecnt`, the mode-3 trough) and flagged (`-t<file>`, `-e<file>`) alike; non-integer values are fine (2026-10-22). The Waveset Envelope tool uses this for its drawn curves, with the CDP Express defaults 64 (cycles), 0.006 (trough) and 6 (exponent). CDP Express's `IMPOSE_ENV_m1` and `IMPOSE_ENV_m2` are `distort envel 1` and `2` (2026-10-22).
- `distort replim`: `-f` ranges from 440 Hz to the Nyquist frequency (2026-10-04).
- `distort pulsed` takes an envelope breakpoint file and a transposition breakpoint file, which the tool writes. The transposition glide is limited to ±12 semitones (2026-10-04).
- `distort harmonic` takes a text file of `harmonic amp` pairs, which the tool writes from its sliders.
- `distort filter` can delete every cycle and leave a file with only a header. The tool checks for this (2026-10-04).
- `distort interact 1|2 a b out` (Waveset Interact) is a two-input process (2026-10-26).

## envel

`envel` processes are stereo-native unless noted (2026-07-05).

- `envel impose` modes: 1 takes a donor sound file, 2 a binary `.env` file, 3 a text breakpoint file with values 0 to 1, and 4 a text breakpoint file in dB. Modes 1 and 2 envelope the whole file; with modes 3 and 4 the breakpoints "may start and end anytime", which effectively edits the sound (2026-07-05).
- `envel impose 3 in.wav brk.txt out.wav` MULTIPLIES the signal by the curve, as a gain gate: a value of 0 gives silence (−inf dB) and a value of 1 keeps the source level. It is stereo-native. The breakpoint file holds whitespace-separated `time value` pairs, at least two, with strictly ascending times (2026-07-05). The Envelope Trigger tool writes this file from its beat, time, random and bounce generators, so it needs no donor file.
- `envel warp <mode> in out wsize [values…]` (Envelope Warp): mode 2 reverses (`wsize` only), 3 exaggerates (plus an exaggeration factor), 7 flattens (plus a power), and 11 corrugates (plus `trofdel`, an integer of at least 2, then a ridge value, which the tool fixes at 2). Per-mode help cannot be printed (`envel warp <n>` answers `UNKNOWN MODE`), so these argument counts were found by trial. Modes 9 and 12 need other argument counts and are not exposed (2026-07-05).
- `envel tremolo 1 in out frq depth gain` (Tremolo); `frq` ranges from 0 to 500 Hz (2026-07-05).
- `envel swell in out peaktime peaktype` (Swell); `peaktype` 1 is exponential. The tool computes `peaktime` from a fraction of the duration measured with ffprobe (2026-07-05).
- `envel replace 1 a b out wsize` (Envelope Transfer) is a two-input process. `wsize` ranges from 5 ms to the file length (2026-10-26).

## envnu

- `envnu peakchop 1 in out wsize pkwidth risetime tempo gain` (Peak Chop). Stereo-native (2026-07-05).

## extend

- `extend scramble 1 in out minseg maxseg outdur` (Scramble). Stereo-native.
- `extend zigzag 1 in out start end dur minzig` (Zigzag). Mono-only, so it is wrapped. CDP stops with an error when `start` or `end` lie outside the file, so the tool clamps them to the real file duration measured with ffprobe (2026-07-05).
- `extend freeze 1 in out outdur delay rand pshift ampcut start end gain` (Iteration Freeze). The tool clamps `delay` to 0.9 × the segment length, and `start`/`end` to the file duration, for the same reason as zigzag (2026-07-05).
- `extend iterate`, `drunk`, `baktobak`, `loop` and `doublets` are stereo-native (2026-10-04).
- `extend baktobak` output length = 2 × (duration − join) (2026-10-04).
- `extend loop 1` output length ≈ duration × len / step (2026-10-04).

## fastconv

- `fastconv -f in impulse out dry` (Convolve) is used instead of `modify convolve`, which is about 100 times slower and clips. Its output is peak-normalised afterwards with `normalizePeak` (2026-10-26).

## filter

- `filter bank` has a heap overflow in CDP's own source (root cause found 2026-10-22): `dev/filter/filters0.c` (lines 239–240) writes `dz->iparam[FLT_FRQ_INDEX]` (index 21) and `dz->iparam[FLT_TIMES_CNT]` (index 20) for every bank, but the plain banks (FLTBANKN and FLTBANKU) allocate only 18 iparams. The Intel build then spins forever under Rosetta at 100% CPU with no output; the native arm64 build crashes at random with SIGBUS or SIGSEGV in roughly 1 in 3 to 1 in 36 runs; AddressSanitizer flags it in 36 of 36 runs (2026-10-22).
- The fix moves those two lines inside the `if(FLTBANKV||FLTBANKV2)` block just above them. It was applied with the user's agreement on branch `fix/filter-bank-iparam-overflow` of `~/CDP8` (a clone of github `shakfu/CDP8`), commit 15a64bb: AddressSanitizer findings went from 36/36 to 0/36, crashes to 0 in 60 runs, and the audio output is byte-identical (same md5). It is built into `~/CDP8/NewRelease/filter`, which the Filter Bank tool runs; the tool explains what it needs if that binary is missing (2026-10-22). The fix is worth reporting upstream.
- To rebuild: `cmake -S ~/CDP8 -B <dir> -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DUSE_LOCAL_PORTAUDIO=ON && make -C <dir> filter`, which writes into `~/CDP8/NewRelease/`. Use a fresh build folder: the existing `~/CDP8/build` refers to a cmake (3.30.2) that has been removed. The per-folder `CMakeLists.txt` files hard-set `CMAKE_C_FLAGS`, so sanitizer flags need a hand-built compile (2026-10-22).
- `filter sweeping` mode numbers in the HTML docs are wrong. The docs say 1 high-pass, 2 low-pass, 3 band-pass, 4 notch; the CDP 8 binary measures as 2 band-pass, 3 low-pass and 4 high-pass, so 1 is notch by elimination. `filters.ts` follows the binary. Measure a documented mode number (white noise plus ffmpeg band RMS) before trusting it (2026-10-22).
- `filter sweeping` with `lofrq` and `hifrq` set to the same breakpoint file is a plain filter whose frequency follows the curve (2026-10-27).
- `filter phasing` and `filter sweeping` are stereo-native (2026-10-04).
- `filter lohi` provides the Lo/Hi Pass tool (2026-10-26).

## focus

- `focus hold` takes a text file of `time holddur` pairs, which the tool writes.
- `focus exag` accepts 0.001 to 1000, positive values only (2026-10-04).
- `focus fold` (Octave Fold), `focus focus` (Spectral Focus) and `focus accu` (a mode of an existing tool) were added 2026-10-26.

## formants

- `formants vocode a.ana b.ana out.ana -pN …` (Vocoder) and `formants get b.ana out.for -pN` followed by `formants put 1|2 …` (Formant Transfer) are two-input processes. `-pN` is at most 12 at the default analysis settings (2026-10-26).

## fractal

- `fractal wave` is stereo-native (2026-10-04).
- `fractal wave` with `-m8` and a 12-semitone contour runs away on CPU, so `-m` is capped at 6 (2026-10-04).
- It takes a contour data file that the tool writes. The contour's final time must equal the clip length, or the output is truncated (2026-10-04).

## glisten

- `glisten glisten in.ana out.ana grpdiv setdur [-ppitch] [-ddurrand] [-vdivrand]` (Glisten): partitions the spectrum at random into `grpdiv` groups and plays them in sequence, like a spectral arpeggiator. `grpdiv` must be a power-of-two divisor of the channel count (2, 4, 8, 16, 32 or 64 work; 5 answers `INVALID DATA`), so the tool offers it as a select (2026-07-05).

## grain

- `grain timewarp in out ratio` (Granular timewarp).
- `grain reverse`, `reorder`, `omit` and `duplicate` are stereo-native (2026-10-04).
- Every `grain` process needs `-l<gate>` tuned to the material, or it fails with `No grains found`. Test them on percussive material (noise bursts), not on sines (2026-10-04).

## hilite

- `hilite filter 1–12` provides the Spectral Filter tool (2026-10-26).

## hover, hover2

- `hover hover in out frq loc frqrand locrand splice dur` (Hover): a zigzag scrub-read at `frq` Hz around `loc` seconds, a scanning granular freeze. It is mono-only (a stereo input gives an empty output), so it is wrapped. The tool passes `loc` as a fraction of the duration, fixes `splice` at 5 ms and sets `dur` to the input length (2026-07-05).
- `hover2` is mono-only, so it is wrapped (2026-10-04).

## interlx

- `interlx out.wav L.wav R.wav` merges two mono files into one stereo file. `runWithStereoSupport` uses it to rejoin the channels.

## modify

Modes of `modify`: loudness, space, speed, revecho, brassage, sausage, radical, spaceform, scaledpan, findpan, convolve, stack and shudder (2026-07-05).

- `modify brassage 6 in out velocity density grainsize pitchshft amp space bsplice esplice [-jjitter]` (Brassage), the flagship granulator. `velocity` is speed, the inverse of time-stretch; 0 would need an output length, so the minimum is 0.1. `density` is overlap; `grainsize` is in ms and must exceed twice the splice, so the minimum is 11; `space` 0.5 is centre, and exactly 0 forces multichannel output. It is stereo-producing (see the stereo rules), so it is called directly, not wrapped (2026-07-05).
- `modify brassage 6` reads breakpoint times as INPUT time: a velocity ramp from 1 to 0.25 over 3 s gives 5.4 s (the integral of dx/v), not 7.5 s. Every one of its parameters may be a breakpoint file. A `space` curve pans the grain stream; keep it off exactly 0 (2026-10-27).
- `modify radical 1` reverses (Reverse tool, 2026-10-26).
- `modify radical 2 in out repeats chunklen -sscatter [-n]` (Shred): `chunklen` is valid from about 0.0174 s (768 samples) to half the duration; `scatter` is at most 8 and must be less than the number of chunks. Stereo-native (2026-10-04).
- `modify radical 3 in out dur -l<down> -h<up>` (Scrub): a `dur` shorter than the input exits 0 and writes an EMPTY file, so the tool clamps `dur` to at least the input length. Stereo-native (2026-10-04).
- `modify radical 4 in out bits srdiv` (Bitcrush): stereo-native. At 3 bits or fewer a quiet (−30 dB) clip quantises to pure silence, so the slider minimum is 3 (2026-10-04).
- `modify radical 5 in out frq` (Ring Mod): stereo-native (2026-10-04).
- `modify radical 6 a b out` (Cross Modulate) is a two-input process (2026-10-26).
- `modify stack in out transpos count lean atkoffset gain dur -n` (Stack): the span is `transpos × (count − 1)`. Large downward spans run effectively forever (8 copies at −24 semitones, a layer 14 octaves down, hung at 100% CPU), so the tool caps the span to −36/+60 semitones. Stereo-native (2026-10-04).
- `modify speed 2 in out semitones`, `modify speed 5 in out accel goaltime` and `modify speed 6 in out vibrate vibdepth` (Vari-speed): stereo-native and tape-style, so the duration changes (2026-10-04). The transpose and the vibrato rate and depth accept breakpoint files, which the drawn curves use (2026-10-26).
- `modify revecho 1 in out delayms mix feedback tail` (Delay) is stereo-native. `modify revecho 3 in out -r<rolloff 0–1> -s<size> -e<count> -n` (Stadium) is stereo-producing: mono in gives 2 channels out (2026-10-04).
- `modify shudder` mangles its output file name (`out put.wav` becomes `ou.wav`), so it runs in a private temporary subfolder and the tool takes whatever `.wav` appears there. Its widths range from 0.02 to 3 s. Stereo-native (2026-10-04).
- `modify convolve` is about 100 times slower than `fastconv` and clips; Convolve uses `fastconv` (2026-10-26).

## morph

Two-input spectral processes; the two-input rules in `## Cross-program rules` apply (2026-10-26).

- `morph bridge`'s real flags are `-a offset -b sf2 -c sa2 -d ef2 -e ea2 -f start -g end`. The HTML docs list different letters. The flags must appear in a to g order, and `start`/`end` must lie inside the shorter file (2026-10-26).
- `morph morph` times must be greater than 0.0058 s and no more than the length of the shorter file; the exponents range from 0.02 to 50 (2026-10-26).
- `morph glide` needs single analysis windows, taken with `spec grab` (2026-10-26).

## multiosc

- `multiosc` (FM Drone generator): `frq1` to `frq4` accept breakpoint files. The output is near full scale (2026-10-27).

## newdelay

- Stereo-native. `mix` must be at least 0.001 (2026-10-04).

## newtex

- Hangs even when asked for its usage. Do not use it (2026-10-04).

## pitch

- `pitch tune 2` takes a text file of MIDI notes, and `pitch chord` a text file of semitone offsets, which the tools write.

## pvoc

- `pvoc anal` FAILS on stereo input with `Application doesn't work with this type of infile`. Spectral tools therefore analyse each mono channel: `pvoc anal 1` → process → `pvoc synth` (the shared `spectralOp` helper in `src/tools/spectral-more.ts`), inside `runWithStereoSupport`. Use `pvocex2` for pitch shift, time stretch and freeze.
- `pvoc anal` records the original sample type, so in a two-input process a 24-bit partner of a 16-bit clip fails with `Incompatible original-sample-type` (2026-10-26).

## pvocex2

- `pvocex2 -P<ratio> in.wav out.wav` shifts pitch, with ratio = 2^(semitones/12). Stereo-safe.
- `pvocex2 -T<ratio> in.wav out.wav` stretches time; a very large ratio is the Spectral Freeze. Stereo-safe.
- `pvocex2` pads its output with trailing silence: 3 s in gives 3.69 s at `-T1`, 7.40 s at `-T2` and 3.67 s at any `-P`. There is no latency (a click at 1 s stays at 1 s × ratio), so `runPvocex2` trims the end to ratio × input length. Pitch Shift, Time Stretch and Spectral Freeze go through it (2026-10-26).

## quirk

- Mono-only, so it is wrapped (2026-10-04).

## reverb

- `reverb in out rgain mix rvbtime absorb lpfreq trailertime`. It always outputs 2 channels (mono in gives stereo out, self-spatialising; stereo in is mixed to mono first), so it must NOT go through `runWithStereoSupport`. The output is longer than the input (tail plus trailer) (2026-07-05).
- CDP's `mix` is inverted: 1.0 is fully dry and 0.0 fully wet, and exactly 1.0 crashes with no output. The tool exposes `wet` and passes `mix = clamp(1 − wet, 0.02, 0.98)`. `lpfreq = 0` disables the low-pass (2026-07-05).
- It prints its full usage banner on every run, which tangles with greps; redirect with `>/dev/null 2>&1` when you only want the output file.

## rmverb

- Stereo-producing, like `reverb` (2026-10-04).

## selfsim, sorter

- `sorter` is mono-only, so it is wrapped (2026-10-04). `selfsim` is one of the binaries first launched in the 2026-10-04 build.

## sfecho

- `sfecho echo in out delay atten totaldur` (Echo): stereo-native. `delay` must be at least the file duration, which gives discrete full-clip repeats, so the tool computes `delay = duration + gap` (2026-07-05).

## spec

- `spec grab in.ana out.ana time` takes a single analysis window, which `morph glide` needs (2026-10-26).

## specfnu

- Fails with `No valid pitch found` on unpitched input (2026-10-04).

## specfold

- `specfold specfold 1 in.ana out.ana startch len cnt` (Spectral Fold): `startch` and `len` are analysis CHANNEL indices, valid from 1 to 509 after `pvoc anal 1` (2026-07-05).

## specnu

- `specnu rand -t` must not exceed the clip length (2026-10-04).

## spectstr

- `spectstr stretch in.ana out.ana stretch dratio drand` (Spectral Stretch): takes ANALYSIS files. The usage text misleadingly says `stretch time infile`; the literal `time` token must NOT be passed (2026-07-05).

## spin

- `spin stereo` accepts ONLY stereo input (2026-10-04).

## splinter

- `p1` and `p2` range from 0 to 50, `shrcnt` from 2 to 256. Mono-only, so it is wrapped (2026-10-04).

## strange

- Modes: shift, glis, waver and invert, all spectral (2026-07-05).
- `strange shift 1 in.ana out.ana frqshift` (Frequency Shifter): a linear shift in Hz of ALL partials, which breaks harmonicity and gives inharmonic, metallic sounds (2026-07-05).
- `strange waver`: `vibfrq` ranges from 0.33 to 172 (2026-10-04).

## stretch

- `stretch spectrum -d0` is rejected (2026-10-04).
- `stretch time 1` with a breakpoint file interpolates linearly in SPEED (1/stretch), not in stretch: a curve from 1 to 4 and back to 1 over 3 s gives 5.55 s, not 7.5 s. This matches the integral of dt/s(t). Curved Time Stretch uses it (2026-10-26).

## superaccu

- `superaccu superaccu 1 in.ana out.ana -d<decay> -g<glis>` (Spectral Sustain). Omit a flag when its value is 0 (2026-07-05).

## synfilt

- `synfilt` (Pitched Noise generator) runs on long past its data's last time: 3 s of data gives 8.9 s at Q 200. That is why `finishGenerated` cuts every generator result to the exact length (2026-10-27).

## synspline

- `synspline` (Spline Wave generator) needs `-v<rate>` BEFORE `-d<drift>`; the documented order fails with `drift step must be set`. It rejects an explicit `-s0` or `-i0`. Its `frq`, `splinecnt` and `interpval` accept breakpoint files, and non-integer counts are fine (2026-10-27).

## synth

- `synth wave` and `synth noise` take a breakpoint frequency and a breakpoint amplitude, and always write 16-bit files (2026-10-27).

## tapdelay

- Takes a text file with one `time amp pan` line per tap, which the tool writes. It needs at least 2 taps; a single hard-panned tap fails (2026-10-04).
- Stereo-producing, like `reverb` (2026-10-04).

## Cross-program rules

### Stereo handling

| Kind | Programs | What the tool does |
|------|----------|--------------------|
| Stereo-native | `bounce`, `extend scramble`, `constrict`; `envel` (every mode used), `envnu peakchop`, `sfecho` (2026-07-05); `modify radical 2–5`, `modify stack`, `modify speed`, `modify revecho 1`, `modify shudder`, `newdelay`, `filter phasing`, `filter sweeping`, `cascade` mode 1, `fractal wave`, `grain reverse/reorder/omit/duplicate`, `extend iterate/drunk/baktobak/loop/doublets` (2026-10-04) | Runs the program once on the stereo file. |
| Stereo-producing | `reverb`, `modify brassage` (2026-07-05); `modify revecho 3` (Stadium), `rmverb`, `tapdelay` (2026-10-04) | Always writes 2 channels (mono in gives stereo out; stereo in is mixed to mono first). Runs once and must NOT be wrapped. Reverb is the one tool where mono in, stereo out is correct. |
| Mono-only | `hover` (stereo in gives an empty file, 2026-07-05); `cantor`, `sorter`, `quirk`, `clip` mode 2, `distmore`, `distshift`, `distwarp` mode 2, `splinter`, `distrep`, `hover2` (2026-10-04); every `distort` waveset process; every `blur`/`pvoc` spectral process | Goes through `runWithStereoSupport`. |
| Stereo-only | `spin stereo` (2026-10-04) | Accepts only stereo input. |

- `runWithStereoSupport` (`src/runner.ts`) splits a stereo file with ffmpeg's `channelsplit` filter, processes each mono channel, and rejoins them with `interlx`. ffmpeg's `-map_channel` was removed in ffmpeg 7 (the machine has ffmpeg 8.1.1), so the `channelsplit` filter is required.
- A wrapped tool must receive `tempDir` as BOTH its temporary folder and its output folder, or the output lands next to the source file (2026-07-05).
- `runPairWithStereoSupport` does the same for two inputs, pairing left with left and right with right (2026-10-26).

### Inputs

- Clips whose files are not WAV (for example `.aif` factory samples) must go through `ensureWavInput` before CDP (2026-07-05).
- Several programs stop with an error on a time outside the file, so tools clamp times to the duration measured with ffprobe (`getAudioDuration`) (2026-07-05).

### Two-input processes

- Both inputs must match in sample rate, channel count AND sample type (`pvoc anal` records the original sample type) (2026-10-26).
- `conformPair` (`src/runner.ts`) converts the pair to the first file's rate and codec, at the wider channel count: a mono partner becomes dual-mono, and the clip is never downmixed (2026-10-26).

### Breakpoint files (time-varying parameters)

- A breakpoint file path is accepted wherever CDP's usage says a parameter "may vary over time", positional and flagged alike. Non-integer values are fine (verified on `distort envel` 2026-10-22).
- Times must be STRICTLY increasing: equal times fail with `ERROR: Times … not in increasing order` and exit code 255, so the curve converter nudges jumps at least 1 ms apart (2026-10-22).
- CDP joins breakpoints with straight lines only. A glide in pitch is therefore a curve in Hz, which `hzPairs` (`src/tools/generators.ts`) approximates by subdividing (2026-10-27).
- Some programs read breakpoint times as input time (`modify brassage 6`) and some interpolate in speed (`stretch time 1`); see those sections.

### Data-file tools

Several processes take a text file that the tool writes to `tempDir` from its sliders and deletes afterwards: `distort harmonic` (`harmonic amp` pairs), `distort pulsed` (envelope and transposition breakpoints, glide limited to ±12), `focus hold` (`time holddur` pairs), `blur weave` (a step list), `pitch tune 2` and `pitch chord` (MIDI notes and semitone offsets), `tapdelay` (`time amp pan` per tap; a single hard-panned tap fails) and `fractal wave` (a contour whose final time must equal the clip length).

### Progress text is not an error

- Binaries print lines like `0 min  0.00 sec0 min  2.00 sec` to stdout or stderr as a progress meter. That is success. Judge a run by its exit code and whether the output file exists, not by its text.

### Errors on stdout, and failures that exit 0

- CDP reports bad parameters on STDOUT, not stderr, as `ERROR: Parameter[n] Value (x) out of range (lo to hi)`, where `n` is 1-based and counted after the file names. That message is the authoritative range (2026-10-04). `runCdp` keeps the last 4000 characters of stdout and appends its `ERROR`/`Invalid` lines to the thrown message.
- Some failures exit 0: `modify radical 3` with a short `dur` writes an empty file, and `distort filter` can write a header-only file. Some parameters ask for effectively unbounded work (`modify stack`, `fractal wave -m8`). Clamp in the tool file, not only in the slider (2026-10-04).
- `runCdp` kills any CDP process that runs longer than 5 minutes (2026-10-04).

### Discovering a program's syntax

- Never trust the original plan or guess the flag order. The HTML docs can be wrong about mode numbers (`filter sweeping`) and flag letters (`morph bridge`), and usage texts can be wrong about argument order (`cantor`, `spectstr`, `synspline`).
- The syntax in `docs/CDP-SHORTLIST.md` was copied from the HTML docs, not run; verify it before building a tool from it (2026-10-04).
- Read `~/cdpr8/docs/html/*.htm` first. For a binary the extension already uses, run it with no arguments for its subcommand list, then `./<bin> <subcommand>` for that mode's usage (for example `./distort`, then `./distort divide`). Some per-mode help cannot be printed (`envel warp <n>`).
- Verify a new command on `scratchpad/audio/mono.wav` AND `stereo.wav` before writing the tool file.

### Gatekeeper: never batch-launch binaries

- Each CDP binary that has never been run raises a Gatekeeper assessment and an "Allow Anyway" dialog. Running about 190 of them in a shell loop jammed `syspolicyd`, stalled every new process on the machine and ended in a forced power-off (2026-10-04).
- The quarantine flags explained it: binaries already approved carried `00c1;…;Arc`, never-run ones `0081;…` (the 0x40 "user approved" bit unset). An earlier test (2026-09-12) that concluded quarantine does not block `spawn()` passed only because `pvocex2` had already been approved; that conclusion is wrong for never-run binaries (corrected 2026-10-04).
- The quarantine attribute was removed from all 232 binaries with `xattr -d com.apple.quarantine *`; a run after the removal was not verified. Every binary the extension uses has since been launched once without a dialog (2026-10-04).
- If an unused binary must be run, run ONE, with a hard timeout (`perl -e 'alarm 8; exec @ARGV' ./bin …`), and stop if it does not return at once.
- For distribution: binaries inside a downloaded `.ablx` may be blocked on a recipient's Mac. Retest before shipping (2026-10-04).

### Verifying a tool with real binaries

- Use a tsx harness in the scratchpad that imports the real `src/tools/*.ts` and calls the registry wrappers (`toolById(id).run(src, params, dir, { tempo })`); tsx resolves the `.js` import specifiers, and `getCdpBinDir()` finds the binaries. Build the params as `processClip` does, by laying them over `toolDefaults(spec)`: a curves param's own default does not carry its targets' values.
- Assert channel counts (`ffprobe … stream=channels`) and durations. These catch the two most common regressions: broken stereo wrapping, and a wrong argument order producing a nonsense length.
- Fixtures to regenerate in the scratchpad: `mono.wav` and `stereo.wav`; `perc.wav` and `percst.wav` (noise bursts, needed by the `grain` tools). Two pure sines make a poor stereo fixture (pitch trackers and waveset gates behave oddly on them); use a delayed copy of the mono file instead (2026-10-22).
- Reading levels with ffmpeg `astats`: it prints at the DEFAULT verbosity, so `-v error` suppresses it. Grep `RMS level dB` and take the first line (it prints one line per channel plus an overall one). The value may be the literal `-inf` (true silence). Use this to prove a process actually changed the audio, not just that it wrote a file.
- In the agent's shell a `grep` that matches nothing returns non-zero and stops the rest of a compound command; guard optional greps with `|| true` or split the command.
