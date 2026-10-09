# CDP shortlist — unused processes worth adding

Compiled 2026-10-04 from the local CDP docs (`~/cdpr8/docs/html/*.htm`) and online sources, compared against the 47 tools in `src/tools/registry.ts`.

**Nothing here has been run.** All syntax is copied from the docs; arg order, stereo behaviour and output length are unverified. Before building any of these, verify on `mono.wav` and `stereo.wav`.

**Binary column:** *approved* = the binary is already used by a shipped tool, so Gatekeeper has passed it. *new* = never launched; run one at a time with a timeout (see the "never batch-launch" memory).

**Data column:** *gen* = the process needs a text data file, which the tool would synthesise from sliders the way Envelope Trigger does.

Selection rule: one clip in, one clip out, no file picker, and a result the existing tools don't already give.

## A. General sound design (first pass)

| # | Tool idea | Command | What it gives | Binary |
|---|---|---|---|---|
| A1 | Spectral Trace | `hilite trace 1 in.ana out.ana N` (modes 2–4 add lofrq/hifrq; `hilite bltr in out blurring tracing` adds blur) | Keeps only the N loudest partials per window; the classic watery CDP sound. Wishart: "complex weaving melodies" (*Tongues of Fire*). | `hilite` new |
| A2 | Inharmonic Stretch | `stretch spectrum 1-2 in.ana out.ana frq_divide maxstretch exponent [-ddepth]` | Stretches the frequency axis: harmonic → bell (*Vox 5*). Not the same as the existing Spectral Stretch (time). | `stretch` new |
| A3 | Resonant Filter Bank | `filter bank 1-6 in out Q gain lofrq hifrq [param] [-sscat] [-d]` | Harmonic / subharmonic / equal-interval resonators; "sonorous, chordal". Push gain. | `filter` new |
| A4 | Spectral Arpeggiator | `hilite arpeg 1-4 in.ana out.ana wave rate`; `hilite pluck in out gain` | LFO sweeps the spectrum, boosting partials; pluck accents each entry. Tempo-syncable via `RunCtx`. | `hilite` new |
| A5 | Formant tools | `focus exag in.ana out.ana exaggeration`; `specfnu specfnu 1/2/3/10/19 …` | Sharpen, squeeze, vibrate or randomise formants while keeping the vowel shape. | `focus`, `specfnu` new |
| A6 | Iterate | `extend iterate 1 in out outdur [-ddelay] [-rrand] [-pshift] [-aampcut] [-ffade]` | Repeats with random pitch/level/timing drift; natural-sounding repetition. | `extend` approved |
| A7 | Grain Reverse / Reorder | `grain reverse in out [-lgate]`; `grain reorder in out code`; `grain omit`; `grain duplicate` | Reverses the order of attacks, each still played forwards. Needs a gateable, grainy source. | `grain` approved |
| A8 | Cascade | `cascade cascade 1-5 in out clipsize echos clipmax [-rrand] [-Nshredno -Cshredcnt]` | Echo-bursts of successive segments over the source, panned, optionally shredded. | `cascade` new |
| A9 | Sorter | `sorter sorter 1-5 in out esiz [-ssmooth] [-oopch] [-ppch]` | Chops and re-orders by loudness or length (crescendo, accelerando…). | `sorter` new |
| A10 | Pitched Delay | `newdelay newdelay in out midipitch mix feedback` | Comb resonator tuned to a MIDI note. | `newdelay` new |
| A11 | Waver / Shepard Glide | `strange waver 1 in.ana out.ana vibfrq stretch botfrq`; `strange glis 1 in out -fN glisrate` | Wobble between harmonic and inharmonic; endless rising/falling tone that keeps the source's articulation. | `strange` approved |
| A12 | Scatter / Noise / Shuffle | `blur scatter in out keep [-bblocksize]`; `blur noise in out noise`; `specnu rand in out [-t] [-g]` | Random spectral thinning, dissolve toward noise, window-order shuffle. | `blur` approved, `specnu` new |

## B. Distortion

| # | Tool idea | Command | What it gives | Data | Binary |
|---|---|---|---|---|---|
| B1 | Waveset Harmonics | `distort harmonic in out harmonics-file [-ppre_atten]` | Adds faster copies of each wavecycle on top of itself: dense, buzzy overtone distortion. File is `harmonic_number amplitude` pairs (2–1024). | gen | `distort` approved |
| B2 | Waveset Hold | `distort replace in out cyclecnt` | Strongest cycle replaces its neighbours; high counts give stepped sample-and-hold tones. | – | `distort` approved |
| B3 | Waveset Delete | `distort delete 1-3 in out cyclecnt` | Keeps 1 in N (or the strongest) cycle: time-compressed, roughened. | – | `distort` approved |
| B4 | Waveset Shuffle | `distort shuffle in out domain-image [-ccyclecnt]` | Permutes cycle groups by a letter pattern (`abcd-aacccbdd`); roughness plus stretch. Offer presets in a select. | – | `distort` approved |
| B5 | Waveset Gate | `distort filter 1-3 in out freq [freq2]` | Drops cycles longer/shorter than a frequency; sounds like a gate, not an EQ. KVR users use this to pull wavetables out of any sound. | – | `distort` approved |
| B6 | Pulse Train | `distort pulsed 1 in out stime dur frq frand trand arand transp tranrand` | Imposes a glissing impulse train on the sound. | – | `distort` approved |
| B7 | Repeat + Lowpass | `distort replim in out multiplier [-ccyclecnt] [-fhilim]` | Waveset Repeat that discards cycles above a frequency. Could be a mode on the existing Waveset Repeat. | – | `distort` approved |
| B8 | Quirk | `quirk quirk 1-2 in out powfac` | Raises samples to a power per half-waveset: flat-top (<1) or pinched (>1) waveforms. Mono. | – | `quirk` new |
| B9 | Clip | `clip clip 1 in out level`; `clip clip 2 in out fraction` | Hard clip at a level, or clip each half-wave at a fraction of its own peak (level-independent fuzz). | – | `clip` new |
| B10 | Waveset Octave-Up | `distmore double in out mult` | Raises each waveset 1–4 octaves; often heard as brightness, not pitch. Mono. | – | `distmore` new |
| B11 | Waveset Shift / Swap | `distshift distshift 1 in out grpcnt shift`; `distshift distshift 2 in out grpcnt` | Slides or swaps alternate half-cycles; large groups scramble radically. Mono. | – | `distshift` new |
| B12 | Waveset Warp | `distwarp distwarp 1-2 in out warp [wavesetcnt]` | Progressive sample multiplier; can produce a distinct added pitch. | – | `distwarp` new |
| B13 | Splinter | `splinter splinter 1-4 in out target wcnt shrcnt ocnt p1 p2` | A waveset group repeats, shrinking and rising, into or out of the sound. | – | `splinter` new |
| B14 | Fractal Wave | `fractal wave 1 in out shape [-mmaxfrac] [-tstr] [-iwarp]` | Transposition contour repeated at every time-scale. Takes multichannel input. Distinct from the existing Fractal (`distort fractal`). | gen | `fractal` new |
| B15 | Spectral Roughen | `caltrain caltrain in.ana out.ana blurfact blurabov [-llocut]`; `blur avrg in out N` | Time-blurs only the top of the spectrum; averages energy across channels. Grit without clipping. | – | `caltrain` new, `blur` approved |
| B16 | Spectral Invert | `strange invert 1-2 in.ana out.ana` | Swaps the loud and quiet ends of the spectral envelope; mode 2 keeps the amplitude envelope. | – | `strange` approved |

Cheap extra from the KVR thread: a "DC offset before processing" option on the existing waveset tools. It moves the zero-crossings, so every waveset tool gives a different result ("brilliantly wacky"). One ffmpeg `dcshift` step.

## C. Ambient and stretching

| # | Tool idea | Command | What it gives | Data | Binary |
|---|---|---|---|---|---|
| C1 | Drunk Walk | `extend drunk 1 in out outdur locus ambitus step clock [-ssplicelen] [-cclokrand] [-ooverlap]` | Random walk through the clip, splicing segments to any output length. Mode 2 adds "sober" straight-play holds. | – | `extend` approved |
| C2 | Tune to Chord | `pitch tune 2 in.ana out.ana pitch_template [-ffocus] [-cclarity] [-bbcut]`; time-varying: `tunevary tunevary …` | Pulls every partial onto a chord or its harmonics: "a very natural sounding resonance". Template is a list of MIDI pitches from a chord select. | gen | `pitch`, `tunevary` new |
| C3 | Fugu (back-to-back) | `extend baktobak in out join_time splice-length` | Reversed copy spliced to the forward one: swells in, decays out. Instant pad from any attack-decay sound. | – | `extend` approved |
| C4 | Spectral Step | `focus step in.ana out.ana timestep` | Spectral sample-and-hold at a regular interval; small steps granulate, large steps make held chords. | – | `focus` new |
| C5 | Spectral Hold | `focus hold in.ana out.ana datafile` | Holds chosen moments for chosen durations, then moves on; output is longer. File is `time hold-duration` pairs. | gen | `focus` new |
| C6 | Advancing Loop | `extend loop 1-3 in out [dur] start len step [-wsplen] [-sscat]` | A loop window that creeps through the clip; pulsing stretch. | – | `extend` approved |
| C7 | Waveset Stretch | `distrep distrep 1 in out multiplier cyclecnt [-ssplicelen]`; `distortt repeat in out gpcnt rpt offset dur` | Long, grainy stretch by repeating wavesets, with splices; `distortt` takes a target duration. Mono. | – | `distrep`, `distortt` new |
| C8 | Room Reverb | `rmverb [flags] in out rmsize egain mix fback absorb lpfreq trtime` | Nested-allpass room, denser than the existing `reverb`. | – | `rmverb` new |
| C9 | Tap Delay | `tapdelay in out tapgain feedback mix taps.txt [trailtime]` | Multi-tap delay with per-tap stereo position. Taps file generated from a pattern select. | gen | `tapdelay` new |
| C10 | Self-similar | `selfsim selfsim in.ana out.ana index` | Replaces quiet windows with their most similar loud ones: a "feature repeater" that smooths toward a drone. Mono analysis. | – | `selfsim` new |
| C11 | Spectral Chord | `pitch chord in.ana out.ana transpose_file [-bbot] [-ttop] [-x]` | Stacks transposed copies of the spectrum. Spectral cousin of the existing Stack. | gen | `pitch` new |
| C12 | Doublets | `extend doublets in out segdur repets [-s]` | Slices and repeats each slice N times; `-s` stays in sync with the source length. | – | `extend` approved |
| C13 | Hover 2 | `hover2 hover2 in out frq loc frqrand locrand dur [-s] [-n]` | Hover with mirrored reads, so no clicks at the turnarounds. Mono, wrap like Hover. | – | `hover2` new |
| C14 | Spectral Weave | `blur weave in.ana out.ana weavfile` | Fixed forward/back step pattern through the windows; smoother than Drunk, can lengthen. | gen | `blur` approved |
| C15 | Sweeping Filter | `filter sweeping 1-4 in out acuity gain lofrq hifrq sweepfrq [-pphase]` | Slow resonant sweeps and wah. Best in band-pass or low-pass. | – | `filter` new |
| C16 | Stereo Spin | `spin stereo 1 in out rate dopl xbuf [-bboost] [-aatt]` | Rotates a stereo image with Doppler shift. Stereo input only. | – | `spin` new |
| C17 | New Texture | `newtex newtex 1 in out transposes dur chans maxrange step spacetype [-ssplice] [-nnumber]` | Brassage + drunk + texture in one; long evolving cloud. Set `chans` to 2. Biggest dialog here. | gen | `newtex` new |

A1 (Trace), A2 (Inharmonic Stretch), A3 (Filter Bank) and A11 (Shepard Glide) also belong in the ambient set.

Not worth adding for stretching: `stretch time` (the existing Time Stretch and Spectral Stretch cover it, unless time-varying stretch is wanted) and `psow stretch`/`psow sustain` (need a pitch-trace file and only suit voice).

## D. Second tier

- `motor motor 1 …` — fast pulse-stream inside a slower pulse; many parameters.
- `scramble scramble 1-4 …` — waveset-order scramble (the R8 program, not `extend scramble`).
- `modify shudder` — gestural stereo tremor; stereo input only; approved binary.
- `pulser pulser 1-2`, `iterline`, `madrid` (set `ochans` 2), `envspeak` — pulsed and syncopated repetition.
- `texture simple …` — Wishart's main generator; needs a generated note-data file.

## E. Blocked: needs a second sound

`morph morph`, `newmorph`, `formants vocode`, `combine cross`, `specenv`, `distort interact`, `modify convolve`, `fastconv`. Well regarded online (formant transfer, morphing), but the UI has one clip and no file picker. Possible route: a "CDP: Set as Donor" context action that stores a clip's path, which two-input tools then read.

## F. Skipped

Multichannel spatialisers (`crystal`, `crumble`, `tangent`, `transit`, `panorama`, `mch*`), synthesis programs (no clip input), `psow`/`fofex`/`tweet`, and housekeeping/info utilities.

## Sources

- Local: `~/cdpr8/docs/html/` — `cdistort.htm`, `cgroextd.htm`, `chilite.htm`, `cfocus.htm`, `cstretch.htm`, `cblur.htm`, `cstrange.htm`, `cpitch.htm`, `cgrofilt.htm`, `cgromody.htm`, `cgromc.htm`, `cxreverb.htm`, `cr8new.htm`
- [Trevor Wishart — Computer Sound Transformation](https://www.trevorwishart.co.uk/transformation.html)
- [CDM — How to get started with SoundThread and CDP](https://cdm.link/how-to-get-started-with-soundthread-and-cdp/)
- [KVR — Composers Desktop Project, still relevant?](https://www.kvraudio.com/forum/viewtopic.php?t=446446)
- [SoundThread — CDP processes you would like to see added next](https://github.com/j-p-higgins/SoundThread/discussions/59)
- [CDP docs — Waveset DISTORT functions](https://www.composersdesktop.com/docs/html/cdistort.htm)
- [CDP docs — Spectral guide](https://www.composersdesktop.com/docs/guide/cdpspect.html)

## Status (2026-10-04, after the build pass)

Built and verified on mono + stereo, under the sandbox replica and in jsdom (98 tools total):

- **A:** A1 Trace (with blur = `bltr`), A2 Inharmonic Stretch, A4 Arpeggio, A5 Formants (`specfnu` 1/2/3) + Spectral Exaggerate, A6 Iterate, A7 Grain Reorder, A8 Cascade (mode 1), A9 Sorter, A10 Resonant Delay, A11 Waver + Glide, A12 Scatter, Noise, Shuffle (`blur shuffle`) and Randomise (`specnu rand`).
- **B:** B1–B6, B7 (as an "Only below" slider on Waveset Repeat; CDP's limit starts at 440 Hz), B8–B14, B15 (Top Blur = `caltrain`, Roughen = `blur avrg`), B16.
- **C:** C1–C16.
- **D:** Shudder. Also Cantor (`cantor set 1`).

Not built:

- **A3 Resonant Filter Bank** — `filter bank` hangs at random on this machine (same command: instant once, never returns the next time).
- **C17 New Texture** — `newtex` hangs even when asked for its usage text.
- Smaller extras: `hilite pluck`, `specfnu` modes 10/19, `tunevary`, `distortt repeat`, the DC-offset option, and the rest of section D.

Corrections to the syntax above, found by running: `cantor set <mode> in out …` (mode first; writes a numbered file sequence); `extend baktobak` mirrors the part AFTER the join time; `distort pulsed` transposition is ±12; `splinter` pulse rates are 0–50 Hz; `modify revecho 3` roll-off is 0–1; `blur weave` steps above ~24 windows write empty files.

