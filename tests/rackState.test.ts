import { test } from "node:test";
import assert from "node:assert/strict";
import { RackState } from "../src/rackState.js";

test("toggleOff does nothing while the Rack is not running", () => {
  const r = new RackState();
  assert.equal(r.toggleOff(), false);
});

test("toggleOff releases the open dialog's wait", async () => {
  const r = new RackState();
  r.active = true;
  r.open = true;
  const wait = r.waitForClose();
  assert.equal(r.toggleOff(), true);
  await wait; // would hang the test if not released
});

test("mid-process presses are swallowed without closing anything", async () => {
  const r = new RackState();
  r.active = true;
  r.open = false;
  let released = false;
  void r.waitForClose().then(() => { released = true; });
  assert.equal(r.toggleOff(), true);
  await new Promise((res) => setImmediate(res));
  assert.equal(released, false);
});
