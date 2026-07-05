import { runCdp, buildOutputPath } from "../runner.js";

export interface BrassageParams {
  velocity: number;  // speed of advance through the input (inverse timestretch): <1 slower/longer, >1 faster
  density: number;   // grain overlap (>0; <1 leaves silence between grains, >1 overlaps/thickens)
  grainsize: number; // grain length in ms
  pitch: number;     // grain pitch shift in semitones
  jitter: number;    // 0..1 randomisation of grain position
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * CDP `modify brassage 6` — granular reconstitution of the soundfile: rebuilds
 * the sound grain-by-grain with independent control of read speed, grain
 * overlap, size, pitch and position jitter. CDP's flagship granulator.
 *
 * Like reverb it spatialises to STEREO output (mono in → stereo; stereo in is
 * mixed to mono first), so it is NOT run through the mono splitter. `space` is
 * fixed at 0.5 (centre) — exactly 0 would force multichannel output.
 */
export async function brassage(
  inputPath: string,
  params: BrassageParams,
  tempDir: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "brassage", tempDir);
  const velocity = Math.max(0.1, params.velocity); // 0 would require an explicit outlength
  const density = Math.max(0.1, params.density);
  const grainsize = Math.max(11, params.grainsize); // must exceed 2 × splice (5ms)
  // modify brassage 6 in out velocity density grainsize pitchshft amp space bsplice esplice [-jjitter]
  await runCdp("modify", [
    "brassage", "6", inputPath, outputPath,
    String(velocity),
    String(density),
    String(grainsize),
    String(params.pitch),
    "1",    // amp
    "0.5",  // space (centre)
    "5",    // bsplice ms
    "5",    // esplice ms
    `-j${clamp(params.jitter, 0, 1)}`,
  ]);
  return outputPath;
}
