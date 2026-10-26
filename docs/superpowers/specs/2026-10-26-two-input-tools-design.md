# Two-input CDP tools ("Cross & Morph")

Status: built autonomously on 2026-10-26 at the user's request ("keep implementing
the CDP Express features, work on your own, I will review later"). Every design
call below is **mine, not the user's**, so it is open to review.

## Why

The last gap between CDP Express and the extension is the processes that take a
second sound. In the user's 2018–19 sample names they account for 92 runs:
morph bridge 13, formants put 11, combine mean 9, combine interleave 9,
formants vocode 7, morph morph 7, combine sum 6, envel replace 6, morph glide 5,
distort interact 5, plus cross modulation and combine cross/max/diff. Most
second inputs were other samples. A minority were the same root sound.

## The second sound

The SDK has no file picker, and its only UI is a modal dialog. But it can walk
`song.tracks`, so **the dialog offers a "Second sound" dropdown**:

- **This clip** and **This clip, reversed**, which cover the "same root" cases
  with no setup.
- **Generated sounds** (added later the same day, standing in for CDP Express's
  `default_mod` and synth entries): white or pink noise, a 55 Hz saw drone and a
  220 Hz sine, each as long as the clip. They are made with ffmpeg rather than
  CDP's `synth`, because that binary has never been launched (Gatekeeper rule).
- **Every other audio clip in the set**: arrangement clips labelled
  `Track · clip @ beat N` (the SDK has no time signature, so no bars) and session clips labelled `Track · clip (slot N)`,
  capped at 200. MIDI clips and the processed clip itself are left out.

Default choice, in order: the clip pinned with the new **"CDP: Use as Second
Sound"** context action (marked ★), then an arrangement clip on another track
that overlaps the target in time (the usual layering case), then the first
other clip, then *This clip, reversed*.

Option values are positional (`a:<track>:<index>`, `s:<track>:<slot>`,
`self`, `self-rev`). The modal blocks Live, so the set cannot change between
picking and processing. Repeat Last reuses the stored value. If that position
no longer holds an audio clip, the run fails with a message to reopen the
dialog. It never silently picks another clip.

The second clip is prepared exactly like the main input. An arrangement clip
is bounced with `renderPreFxAudio` over its own span, so warping and clip gain
are heard as played. Session and take-lane clips use their source-file
region. The tool then conforms it to the main input's sample rate and channel
count with ffmpeg: mono becomes dual-mono and stereo is downmixed.

## Plumbing

- New param type `second` (one per tool, key `second`). The dialog renders it
  as a select fed by `CLIP.sources` (`{options, def}`), which is added to
  `DialogClip`. Randomize leaves it alone. A stale `INIT` value that is no
  longer an option falls back to the default.
- Tools with a `second` param render their dialog per open, as curve tools
  already do.
- `RunCtx` gains `second?: string`, the prepared WAV path. `processClip`
  fills it inside the progress dialog ("Preparing second sound…").
- The pure lister/resolver lives in `src/secondSound.ts`, unit-tested on
  structural track shapes like `dispatch.ts`.
- `runner.ts`: `conformTo` for rate and channels, `runPairWithStereoSupport`
  (L with L, R with R), `reverseAudio`, `normalizePeak`.
- `src/tools/two-input.ts` holds every tool. Spectral ones go through one
  `spectralPair` helper: pvoc anal both, run the op, pvoc synth.
- New group **"Cross & Morph"** in `GROUP_ORDER`.

## Tools (syntax verified on the Intel CDP binaries, 2026-10-26)

| Tool | Command | Notes |
|---|---|---|
| Morph Bridge | `morph bridge 1-6 a b out -a<offset> -b<sf2> -c<sa2> -d<ef2> -e<ea2> -f<start> -g<end>` | **The flags differ from the HTML docs.** The binary's own usage is authoritative. Flags must be in a–g order. Start and end must be within the shorter file. |
| Morph | `morph morph 1-2 a b out as ae fs fe expa expf` | ends ≤ the shorter file, > 0.0058 s; exp 0.02–50 |
| Morph Glide | `spec grab` × 2 → `morph glide ga gb out dur` | the output is `dur` long, not the clip's length |
| Vocoder | `formants vocode a b out -pN [-l -h -g]` | -p max 12 at the default analysis; lo/hi 5–nyquist; gain to 40 |
| Formant Transfer | `formants get b b.for -pN` → `formants put 1\|2 a b.for out [-l -h -g]` | CDP Express defaults 100 / 2000 / 0.8 |
| Spectral Mean | `combine mean 1-8 a b out [-l -h -c -z]` | mode = amplitude rule × (pitch \| frequency) mean |
| Spectral Combine | `combine cross -i` / `sum -c` / `diff -c` / `max` / `interleave leaf` | interleave leaf 1–1042 windows |
| Envelope Transfer | `envel replace 1 a b out wsize` | stereo-native; wsize 5 ms up to the file length |
| Waveset Interact | `distort interact 1\|2 a b out` | mono-only, so wrapped per channel |
| Cross Modulate | `modify radical 6 a b out` | stereo-native for equal channel counts; the output is the shorter length |
| Convolve | `fastconv -f in ir out [dry]` → peak-normalise | chosen over `modify convolve`, which took 9 s on 3 s × 0.4 s and clipped at 0 dBFS; fastconv takes 0.06 s and handles mono/N-channel IRs |

Asymmetric tools get a **Swap roles** toggle. It exchanges the two sounds before
running, so the output follows the second sound's length and the result still
replaces the clip that was right-clicked.

## Non-goals

- More than two inputs (combine max/interleave accept N): this needs a
  multi-select UI.
- Using the phase-vocoder analysis size as a param (CDP Express exposed
  128–16384 points). Every spectral tool here uses `pvoc anal 1` defaults like
  the rest of the extension.
- `newmorph`, `specsphinx`, `spectwin`, `specenv`: these are not in CDP Express
  and their binaries have never been launched (see the Gatekeeper rule).
