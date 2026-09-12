import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { startCdpServer, type Dispatcher } from "../src/server.js";

const CLIP = { handle: { id: 7n }, name: "kick", filePath: "/s/kick.wav" };
const deps: Dispatcher = {
  isRegistered: (id) => id === "cdp.rack",
  resolveClip: () => CLIP,
  execute: () => {},
};

test("serves /cmd over HTTP and returns the dispatch result as JSON", async () => {
  const srv = await startCdpServer(deps, { port: 0 });
  assert.ok(srv, "server should start");

  const res = await fetch(`http://127.0.0.1:${srv.port}/cmd?id=cdp.rack&track=0&arr=0`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.clip, "kick");

  await srv.close();
});

test("propagates error statuses from the dispatcher", async () => {
  const srv = await startCdpServer(deps, { port: 0 });
  assert.ok(srv);

  const res = await fetch(`http://127.0.0.1:${srv.port}/cmd?id=cdp.nope&track=0&arr=0`);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);

  await srv.close();
});

test("binds loopback only, never 0.0.0.0", async () => {
  const srv = await startCdpServer(deps, { port: 0 });
  assert.ok(srv);
  assert.equal(srv.address, "127.0.0.1");
  await srv.close();
});

test("returns null instead of throwing when the port is taken", async () => {
  // Occupy a port, then ask the server for the same one.
  const squatter = net.createServer();
  const taken = await new Promise<number>((resolve) => {
    squatter.listen(0, "127.0.0.1", () => resolve((squatter.address() as net.AddressInfo).port));
  });

  const srv = await startCdpServer(deps, { port: taken });
  assert.equal(srv, null, "a port conflict must not throw - the extension must still load");

  await new Promise<void>((r) => squatter.close(() => r()));
});
