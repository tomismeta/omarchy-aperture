import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const payloadDir = process.env.APERTURE_ATTENTION_DEV_PAYLOAD_DIR || "";
assert(path.isAbsolute(payloadDir), "APERTURE_ATTENTION_DEV_PAYLOAD_DIR must be absolute");
const extensionPath = path.join(payloadDir, "integrations", "omp", "aperture-omp-extension.mjs");
const loaded = await import(`${pathToFileURL(extensionPath).href}?proof=${Date.now()}`);
assert.equal(typeof loaded.createApertureOmarchyOmpExtension, "function");

const handlers = new Map();
const calls = [];
let nextId = 40;
const commandRunner = async (command, args) => {
  calls.push({ command, args: [...args] });
  if (command === "omarchy-notification-send") {
    const replacementIndex = args.indexOf("--replace-id");
    const id = replacementIndex >= 0 ? args[replacementIndex + 1] : String(++nextId);
    return { stdout: `${id}\n`, stderr: "" };
  }
  return { stdout: "", stderr: "" };
};

const previousNotifications = process.env.PI_NOTIFICATIONS;
process.env.PI_NOTIFICATIONS = "on";
try {
  const extension = loaded.createApertureOmarchyOmpExtension({
    availabilityCheck: async () => true,
    commandRunner,
  });
  await extension({ on: (event, handler) => handlers.set(event, handler) });
  assert.equal(process.env.PI_NOTIFICATIONS, "off");

  const context = { cwd: "/private/project", sessionManager: { sessionId: "session-proof" } };
  await handlers.get("credential_disabled")?.({
    type: "credential_disabled",
    provider: "anthropic",
    disabledCause: "token=secret /private/credential/path",
    credential: "must-not-appear",
  }, context);
  await handlers.get("session_stop")?.({
    type: "session_stop",
    session_id: "session-proof",
    turn_id: 7,
    last_assistant_message: { stopReason: "error" },
  }, context);
  const approval = {
    type: "tool_approval_requested",
    sessionId: "session-proof",
    toolCallId: "approval-proof",
    toolName: "bash",
    reason: "private approval reason",
  };
  await handlers.get("tool_approval_requested")?.(approval, context);
  await handlers.get("tool_approval_requested")?.(approval, context);

  const senderCalls = calls.filter(call => call.command === "omarchy-notification-send");
  assert.equal(senderCalls.length, 4);
  const rendered = JSON.stringify(senderCalls);
  assert(!rendered.includes("token=secret"));
  assert(!rendered.includes("credential/path"));
  assert(!rendered.includes("must-not-appear"));
  assert(!rendered.includes("private approval reason"));

  const credentialCall = senderCalls.find(call => call.args.includes("OMP disabled anthropic authentication"));
  assert(credentialCall);
  assert(credentialCall.args.includes("OMP reported a provider authentication failure."));
  const providerFailureCall = senderCalls.find(call => call.args.includes("OMP agent turn failed"));
  assert(providerFailureCall);
  assert(!rendered.includes("OMP completed a turn"));

  const approvalCalls = senderCalls.filter(call => call.args.includes("OMP needs approval for bash"));
  assert.equal(approvalCalls.length, 2);
  const firstApprovalId = approvalCalls[0].args.includes("--replace-id")
    ? approvalCalls[0].args[approvalCalls[0].args.indexOf("--replace-id") + 1]
    : "43";
  assert.equal(approvalCalls[1].args[approvalCalls[1].args.indexOf("--replace-id") + 1], firstApprovalId);

  await handlers.get("session_shutdown")?.({ type: "session_shutdown" }, context);
  assert.equal(process.env.PI_NOTIFICATIONS, "on");

  console.log(JSON.stringify({
    credentialDisabled: {
      emitted: true,
      summary: "OMP disabled anthropic authentication",
      privateDetailsOmitted: true,
    },
    providerStopReasonError: {
      emittedFailure: true,
      emittedCompletion: false,
      summary: "OMP agent turn failed",
    },
    identicalReplacement: {
      senderCalls: approvalCalls.length,
      nativeIdReused: true,
      artificialDisplayChurn: false,
    },
    builtInNotifications: {
      suppressedWhenSenderAvailable: true,
      restoredOnShutdown: true,
    },
  }, null, 2));
} finally {
  if (previousNotifications === undefined) delete process.env.PI_NOTIFICATIONS;
  else process.env.PI_NOTIFICATIONS = previousNotifications;
}
