import assert from "node:assert/strict";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const root = await mkdtemp(join(tmpdir(), "aperture-qml-supervisor-"));
const qml = fileURLToPath(new URL("./qml/Supervisor.qml", import.meta.url));
const fixture = fileURLToPath(new URL("./qml/worker-fixture.mjs", import.meta.url));
let oldOwner = null;
const oldConnections = new Set();
async function closeOldOwner() {
  for (const connection of oldConnections) connection.destroy();
  if (oldOwner?.listening)
    await new Promise((resolve, reject) => oldOwner.close(error => error ? reject(error) : resolve()));
}
try {
  const configRoot = join(root, "config");
  await mkdir(configRoot);
  await copyFile(qml, join(configRoot, "shell.qml"));
  for (const name of ["Service.qml", "WorkerModel.qml", "WorkerBridgeLogic.js", "WorkerOutputLogic.js"])
    await copyFile(fileURLToPath(new URL(`../${name}`, import.meta.url)), join(configRoot, name));
  const heartbeatHelper = join(configRoot, "direct-heartbeat.mjs");
  await copyFile(fileURLToPath(new URL("./qml/direct-heartbeat.mjs", import.meta.url)), heartbeatHelper);
  const scenarios = process.env.APERTURE_SUPERVISOR_SCENARIO
    ? [process.env.APERTURE_SUPERVISOR_SCENARIO]
    : ["readiness", "protocol-retry", "backpressure-retry", "fatal-generic",
      "contention", "unsafe", "exit75", "exit74", "fatal-exit75"];
  for (const scenario of scenarios) {
    const production = scenario === "production-overlap";
    const pluginDir = production ? process.env.APERTURE_SUPERVISOR_PLUGIN_DIR
      : join(root, "plugin paths with spaces # %", scenario);
    assert.ok(pluginDir, "production-overlap requires APERTURE_SUPERVISOR_PLUGIN_DIR");
    const relocatedDir = join(root, "relocated paths with spaces # %", scenario);
    const launchLog = scenario === "readiness" ? join(root, "readiness-launches.jsonl") : "";
    const environment = {
      ...process.env,
      APERTURE_SUPERVISOR_SCENARIO: scenario,
      APERTURE_SUPERVISOR_PLUGIN_DIR: pluginDir,
      APERTURE_SUPERVISOR_SERVICE_URL: pathToFileURL(join(pluginDir, "Service.qml")).href,
      APERTURE_SUPERVISOR_RELOCATED_SERVICE_URL: pathToFileURL(join(relocatedDir, "Service.qml")).href,
      APERTURE_SUPERVISOR_LAUNCH_LOG: launchLog,
      APERTURE_SUPERVISOR_NODE: process.execPath,
      APERTURE_SUPERVISOR_HEARTBEAT_HELPER: heartbeatHelper,
    };
    let oldIdentity = null;
    let oldConnectionCount = 0;
    let release = null;
    if (!production) {
      for (const directory of scenario === "readiness" ? [pluginDir, relocatedDir] : [pluginDir]) {
        const launcher = join(directory, "bin", "aperture-attention-engine");
        await mkdir(join(directory, "bin"), { recursive: true });
        await copyFile(fixture, launcher);
        await chmod(launcher, 0o755);
      }
    } else {
      const runtime = join(root, "runtime");
      const state = join(root, "state");
      const socketDirectory = join(runtime, "omarchy", "aperture");
      await mkdir(socketDirectory, { recursive: true, mode: 0o700 });
      await mkdir(state, { mode: 0o700 });
      // Keep access to the real compositor while isolating the worker socket.
      if (environment.WAYLAND_DISPLAY && !isAbsolute(environment.WAYLAND_DISPLAY)) {
        assert.ok(environment.XDG_RUNTIME_DIR, "relative Wayland display requires the original runtime directory");
        environment.WAYLAND_DISPLAY = join(environment.XDG_RUNTIME_DIR, environment.WAYLAND_DISPLAY);
      }
      environment.XDG_RUNTIME_DIR = runtime;
      environment.XDG_STATE_HOME = state;
      environment.APERTURE_SUPERVISOR_SOCKET = join(socketDirectory, "attention.sock");
      oldOwner = createServer(connection => {
        oldConnectionCount += 1;
        oldConnections.add(connection);
        connection.on("error", () => {});
        connection.on("close", () => oldConnections.delete(connection));
        connection.end();
      });
      await new Promise((resolve, reject) => {
        oldOwner.once("error", reject);
        oldOwner.listen(environment.APERTURE_SUPERVISOR_SOCKET, resolve);
      });
      await chmod(environment.APERTURE_SUPERVISOR_SOCKET, 0o600);
      oldIdentity = await lstat(environment.APERTURE_SUPERVISOR_SOCKET);
      assert.ok(oldIdentity.isSocket());
      assert.equal(oldIdentity.uid, process.getuid());
      assert.equal(oldIdentity.mode & 0o777, 0o600);
    }
    let runtimeFailure = null;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.env.QUICKSHELL_BINARY || "qs", ["-p", join(configRoot, "shell.qml")], {
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), scenario === "readiness" || production ? 30000 : 18000);
      const observe = chunk => {
        output += chunk;
        if (production && release === null && output.includes("APERTURE_SUPERVISOR_TRANSPORT_FAILURE production-overlap")) {
          release = (async () => {
            const held = await lstat(environment.APERTURE_SUPERVISOR_SOCKET);
            assert.equal(held.dev, oldIdentity.dev, "failed generation replaced the old socket device");
            assert.equal(held.ino, oldIdentity.ino, "failed generation stole the old responsive socket");
            assert.ok(oldConnectionCount > 0, "failed generation did not probe the responsive owner");
            await closeOldOwner();
            process.stdout.write("APERTURE_SUPERVISOR_OLD_OWNER_RELEASED\n");
          })().catch(error => {
            runtimeFailure = error;
            child.kill("SIGTERM");
          });
        }
      };
      child.stdout.on("data", chunk => { observe(chunk); process.stdout.write(chunk); });
      child.stderr.on("data", chunk => { observe(chunk); process.stderr.write(chunk); });
      child.on("error", error => { clearTimeout(timer); reject(error); });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, output });
      });
    });
    await release;
    if (runtimeFailure) throw runtimeFailure;
    assert.equal(result.code, 0, result.output || `Quickshell ended via ${result.signal}`);
    assert.ok(!result.output.includes("APERTURE_SUPERVISOR_FAIL"), result.output);
    assert.ok(result.output.includes(`APERTURE_SUPERVISOR_PASS ${scenario}`), result.output);
    if (launchLog) {
      const launches = (await readFile(launchLog, "utf8")).trim().split("\n").map(JSON.parse);
      assert.deepEqual(launches.map(launch => launch.root),
        [pluginDir, pluginDir, pluginDir, relocatedDir, pluginDir, pluginDir, pluginDir],
        "source replacement or service recreation launched the wrong worker");
      for (const launch of launches) {
        assert.deepEqual(launch.livePrevious, [], "worker instances overlapped across service ownership");
        assert.throws(() => process.kill(launch.pid, 0), { code: "ESRCH" },
          "a worker survived service shutdown/destruction");
      }
    }
    if (production) {
      assert.ok(release !== null, "old owner was never released after a transport failure");
      assert.ok(result.output.includes("APERTURE_SUPERVISOR_HEARTBEAT_ACCEPTED"), result.output);
    }
    process.stdout.write(`ok - real QML supervisor ${scenario}\n`);
  }
} finally {
  await closeOldOwner();
  await rm(root, { recursive: true, force: true });
}
