import assert from "node:assert/strict";
import { lstat } from "node:fs/promises";
import { createConnection } from "node:net";

const socketPath = process.env.APERTURE_SUPERVISOR_SOCKET;
assert.ok(socketPath, "isolated socket path is required");
const identity = await lstat(socketPath);
assert.ok(identity.isSocket(), "replacement path must be a socket, not a symlink");
assert.equal(identity.uid, process.getuid(), "replacement socket must belong to the current UID");
assert.equal(identity.mode & 0o777, 0o600, "replacement socket must be private mode 0600");
const requestId = "supervisor-heartbeat";
const response = await new Promise((resolve, reject) => {
  const socket = createConnection(socketPath);
  let data = "";
  socket.setTimeout(2000, () => socket.destroy(new Error("heartbeat acknowledgement timed out")));
  socket.on("error", reject);
  socket.on("connect", () => socket.write(`${JSON.stringify({
    schemaVersion: 4, type: "omp.session-heartbeat", requestId, sessionId: "supervisor-overlap-session",
  })}\n`));
  socket.on("data", chunk => {
    data += chunk;
    if (data.length > 65536) socket.destroy(new Error("heartbeat acknowledgement exceeded bound"));
  });
  socket.on("end", () => {
    try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
  });
});
assert.equal(response.schemaVersion, 4);
assert.equal(response.status, "accepted");
assert.equal(response.requestId, requestId);
const after = await lstat(socketPath);
assert.equal(after.dev, identity.dev, "socket device changed during heartbeat");
assert.equal(after.ino, identity.ino, "socket identity changed during heartbeat");
process.stdout.write(`APERTURE_SUPERVISOR_HEARTBEAT_ACCEPTED uid=${identity.uid} mode=0600\n`);
