/**
 * Lifecycle of the Rack command, so the trigger button can toggle it: a press
 * while the Rack is up closes it instead of opening a second one.
 *
 * The SDK has no way to close a modal from the extension side, so closing is
 * cooperative: the open dialog long-polls `/dialog/wait` (see server.ts), and
 * `requestClose()` settles that request, whereupon the page posts
 * close_and_send itself.
 */
export class RackState {
  /** The Rack command is running: its dialog is up, or it is processing a pick. */
  active = false;
  /** The dialog itself is on screen, so there is something to close. */
  open = false;
  private waiters: Array<() => void> = [];

  /** Settles when a close is requested. Held by the open dialog's long-poll. */
  waitForClose(): Promise<void> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Releases every pending wait (also used to flush polls of a closed dialog). */
  requestClose(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  /**
   * Called for a trigger press. Returns true if the press was consumed as
   * "close": the dialog is asked to close, or, mid-process, the press is
   * swallowed so it cannot stack a second Rack on the clip being replaced.
   */
  toggleOff(): boolean {
    if (!this.active) return false;
    if (this.open) this.requestClose();
    return true;
  }
}
