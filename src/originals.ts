/** Name of the take lane that holds the untouched originals of processed clips. */
export const ORIGINALS_LANE = "CDP Originals";

const SAME_SPAN_BEATS = 1e-6;
/** The name `placeResult` gives a result: `<original> [<label>]`. */
const RESULT_NAME = /\s\[.+\]$/;

/**
 * True when `clip` is a CDP result (named like one) and some "CDP Originals"
 * lane already holds a clip with its span, so backing it up again would only
 * add another lane.
 */
export function originalAlreadyBackedUp(
  lanes: ReadonlyArray<{ name: string; clips: ReadonlyArray<{ startTime: number; endTime: number }> }>,
  clip: { name: string; startTime: number; endTime: number },
): boolean {
  if (!RESULT_NAME.test(clip.name)) return false;
  return lanes.some(
    (l) =>
      l.name === ORIGINALS_LANE &&
      l.clips.some(
        (c) =>
          Math.abs(c.startTime - clip.startTime) < SAME_SPAN_BEATS &&
          Math.abs(c.endTime - clip.endTime) < SAME_SPAN_BEATS,
      ),
  );
}
