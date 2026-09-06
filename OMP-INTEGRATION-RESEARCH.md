# OMP integration research

Research date: 2026-09-06.

## Decision

Keep the existing OMP extension and worker-direct transport for the software available today. Use OMP's supported ExtensionAPI; do not switch production event ingestion to Warp terminal events while the receiving path is unavailable.

This does not require a modified OMP build. The integration-specific component is Aperture's adapter, not a fork of OMP's agent runtime.

For future native integration, reuse OMP's existing structured terminal-event bridge rather than proposing a new OMP event server. Coordinate receiver support with Herdr and propose only demonstrated missing lifecycle facts in OMP.

This note supersedes the earlier, overly broad framing that OMP has no native external event publication or that one missing event necessarily forced the extension architecture. Neither claim was established by the investigation.

## Questions investigated

- Can Aperture consume OMP's built-in Warp events instead of loading its own OMP extension?
- Does the installed terminal stack receive and expose those events?
- Which lifecycle facts are actually missing, rather than merely represented differently?
- Does existing upstream work overlap a proposed integration API?
- What should change in Aperture and this Omarchy plugin now?

## Versions and scope

Remote experiments used an authorized Omarchy machine:

| Component | Installed version |
| --- | --- |
| OMP | 18.1.11 |
| Herdr | 0.8.2 |
| Foot | 1.27.0 |

OMP source research was pinned to [`84843d42410c610ced1253681d3ac0f3f6e622ea`](https://github.com/can1357/oh-my-pi/tree/84843d42410c610ced1253681d3ac0f3f6e622ea). This is the inspected upstream source revision, not a verified build SHA for the installed binary. Herdr and Foot source inspection used their corresponding release tags.

GitHub issue and PR states below were checked on the research date. Searches were bounded, used multiple vocabularies, and are not an exhaustive proof that no differently worded proposal exists.

## Existing OMP capabilities

### Built-in structured terminal-event bridge

OMP's [Warp bridge](https://github.com/can1357/oh-my-pi/blob/84843d42410c610ced1253681d3ac0f3f6e622ea/packages/coding-agent/src/modes/warp-events.ts) translates existing extension events into JSON carried by this terminal sequence:

```text
ESC ] 777;notify;warp://cli-agent;<JSON> BEL
```

Emission is enabled by `WARP_CLI_AGENT_PROTOCOL_VERSION >= 1`. Setting that variable enables the producer; it does not install or verify a receiver.

The bridge emits:

- `session_start`
- `prompt_submit`
- `permission_request`
- `permission_replied`
- `question_asked`
- `tool_complete`
- `stop`
- `stop_failure`

The envelope includes a session ID, cwd, project name, protocol version, and OMP version. Some events include bounded prompt or response text. This is not a metadata-only privacy contract.

The inspected [interactive startup path](https://github.com/can1357/oh-my-pi/blob/84843d42410c610ced1253681d3ac0f3f6e622ea/packages/coding-agent/src/main.ts) installs this built-in bridge. The remote experiment confirmed that it operates with ordinary extension discovery disabled. It is an interactive terminal bridge, not a generic headless publication interface.

The bridge suppresses `stop` when `agent_end.willContinue` is true. Source inspection also examined the maintenance/continuation handling in [AgentSession](https://github.com/can1357/oh-my-pi/blob/84843d42410c610ced1253681d3ac0f3f6e622ea/packages/coding-agent/src/session/agent-session.ts). Arbitrary stop-hook continuation scenarios were not exercised in the remote experiment.

### Collab and RPC

OMP already has [read-only live session sharing through `/collab view`](https://github.com/can1357/oh-my-pi/blob/84843d42410c610ced1253681d3ac0f3f6e622ea/docs/collab.md), including initial snapshots and structured live events while the original session remains interactive. It exposes transcript content over an encrypted WebSocket relay, rather than a minimal attention projection. Pending interactive UI requests are sent only to writable guests in the inspected implementation.

[RPC](https://github.com/can1357/oh-my-pi/blob/84843d42410c610ced1253681d3ac0f3f6e622ea/docs/rpc.md) already publishes structured events over stdio. A process launched in RPC mode is not, by itself, an observer attached to an unrelated running interactive OMP process.

These are real existing capabilities. A future proposal must not describe external structured publication as wholly absent from OMP.

## Remote experiment method

The experiments used a dedicated temporary directory, private HOME/configuration paths, an isolated headless Herdr server and socket, and new probe panes. The live Herdr server, existing OMP sessions, user configuration, and installed Aperture payload were not modified.

Production OMP was launched with:

- `--no-session --no-extensions --no-skills --no-rules --no-lsp --no-title`
- A custom localhost OpenAI-compatible model endpoint.
- The same deterministic model selected for the main, small, and slow model roles.
- The stock `read` and `ask` tools.
- `WARP_CLI_AGENT_PROTOCOL_VERSION=1` for bridge-enabled runs.

The local endpoint returned controlled model responses and tool calls. It was a model stand-in, not a replacement for OMP's lifecycle implementation: the installed OMP binary performed tool execution, approval dialogs, question dialogs, retry, and session changes. No real model credentials were used.

Read approval was explicitly configured with `tools.approval.read: prompt` for approval scenarios. OMP's `always-ask` mode still automatically allows read-tier tools, as documented in [approval mode](https://github.com/can1357/oh-my-pi/blob/84843d42410c610ced1253681d3ac0f3f6e622ea/docs/approval-mode.md).

One session path used `script` to capture the terminal byte stream. Additional direct OMP launches without that recording wrapper compared bridge-enabled and bridge-disabled behavior. Herdr snapshots, subscriptions, and rendered pane contents provided receiver-side observations.

The captured production bridge sequence contained 33 JSON frames. The transcript and temporary scripts were removed after the experiment; observations are recorded below and in the originating assistant/tool conversation. This document is not a retained runnable reproduction bundle.

## Observed OMP lifecycle coverage

| Scenario | Observed bridge output | Interpretation |
| --- | --- | --- |
| Normal completion | `prompt_submit → stop` | Ordinary run completion is already published. |
| Successful read without approval | `prompt_submit → tool_complete(read) → stop` | Successful tool completion is published. |
| Approval accepted | `permission_request → permission_replied → tool_complete(read) → stop` | Request and resolution exist, but the reply omits decision and request identity. |
| Approval denied | `permission_request → permission_replied → stop` | The reply payload does not distinguish approval from denial. No `tool_complete` was observed for the denied call. |
| Question answered | `question_asked → tool_complete(ask) → stop` | The pending question can close on completion of `ask`. |
| Question cancelled with Escape | `question_asked → tool_complete(ask) → stop` with an empty response | The question ends, but the stop payload lacks an explicit user-cancellation outcome. |
| Read of a missing file | `tool_complete(read) → stop` | The tool-complete fields are indistinguishable from a successful read. The controlled model completed normally after receiving the tool failure. |
| Controlled provider HTTP 400 | `prompt_submit → stop_failure` | Terminal provider failure is already published. |
| F5 retry of that failure | Another `stop_failure`, with no intervening start or prompt event | A user-message event is insufficient to observe every start/resumption of work. |
| `/new` | `session_start` with a different session ID | A receiver can detect session replacement without inventing a new session-switch event. |
| Graceful `/exit` | No additional Warp frame | Process/session closure is not explicitly published by this bridge. |

A dedicated `question_resolved` event is not currently demonstrated to be necessary. The tested answer and cancellation paths both emitted `tool_complete` for `ask`; the inspected [AskTool](https://github.com/can1357/oh-my-pi/blob/84843d42410c610ced1253681d3ac0f3f6e622ea/packages/coding-agent/src/tools/ask.ts) has exclusive concurrency. This inference requires an intact stream and does not solve missed events after receiver restart.

Exact approval correlation has a stronger justification: OMP already has `toolCallId` and `approved` at the [approval wrapper](https://github.com/can1357/oh-my-pi/blob/84843d42410c610ced1253681d3ac0f3f6e622ea/packages/coding-agent/src/extensibility/extensions/wrapper.ts), but the Warp payload drops them. Source inspection did not establish a universal FIFO guarantee for overlapping approval requests. Concurrent-approval behavior was not exercised remotely.

## Receiver findings

### Herdr 0.8.2: immediate blocker

A synthetic emitter sent all eight event types through a real isolated Herdr pane. Ordinary OSC title changes accompanied each frame as a positive control.

Observed:

- Every title change was reflected in pane snapshots and update events.
- The Warp frames did not produce corresponding structured agent events or state transitions.
- An explicit `pane.report_agent` socket call immediately produced agent detection and the expected blocked-state subscription event.

Additional direct launches ran OMP with the bridge enabled and disabled in separate panes. Both showed a real approval dialog. Herdr detected the executable as `omp`, but reported `agent_status: idle` for both and did not expose the OMP session identity from the Warp frame.

The result agrees with the release source:

- [Pane terminal processing](https://github.com/herdrdev/herdr/blob/v0.8.2/src/pane/terminal.rs)
- [OSC tracking](https://github.com/herdrdev/herdr/blob/v0.8.2/src/pane/osc.rs)
- [Embedded terminal callbacks](https://github.com/herdrdev/herdr/blob/v0.8.2/src/ghostty/mod.rs)
- [Socket event schema](https://github.com/herdrdev/herdr/blob/v0.8.2/src/api/schema/events.rs)

There is an existing open report: [Herdr #3004 — OSC 777 notifications from a shell pane never reach the host terminal](https://github.com/herdrdev/herdr/issues/3004). It concerns notification delivery generally; it does not by itself specify a structured, pane-aware event subscription for Aperture.

The preferred future route is semantic receiver support with originating pane/terminal identity exposed through Herdr's socket API, rather than blindly forwarding raw escape sequences to the shared outer terminal.

### Stock Herdr OMP integration

Herdr already ships an [OMP extension](https://github.com/herdrdev/herdr/blob/v0.8.2/src/integration/assets/omp/herdr-agent-state.ts) that reports state and native session references through its socket. `herdr integration status` reported that it was not installed on the experimental machine's normal user configuration; it was not installed during this investigation.

Replacing Aperture's extension with this integration would still require an extension and would expose a coarser pane-state contract, not the original full Warp event stream. It is not automatically a fidelity or installation improvement.

### Foot 1.27.0: possible direct route, not verified end to end

Source inspection found that Foot accepts the exact OSC 777 envelope and preserves the JSON notification body. Its notification path normally inhibits delivery while focused, before invoking the configured notification command.

- [OSC parsing](https://codeberg.org/dnkl/foot/src/tag/1.27.0/osc.c)
- [Notification delivery and focus gating](https://codeberg.org/dnkl/foot/src/tag/1.27.0/notify.c)

A direct Foot route would need deliberate receiver configuration and must not discard lifecycle updates based on window focus. It also does not bypass Herdr's embedded terminal when OMP is inside a Herdr pane.

This finding is source-verified only. An attempted isolated headless Hyprland compositor could not initialize its backend, so direct Foot delivery was not runtime-tested. The live desktop was not manipulated as a fallback.

## Minimal upstream direction

### OMP: enrich the existing bridge

Propose focused additions using facts already available internally:

1. **Actual run/working start:** publish starts for retry and non-message starts, not only `prompt_submit`.
2. **Stop outcome:** preserve the distinction between completion and user cancellation rather than requiring consumers to guess from an empty response.
3. **Request/tool correlation and outcome:** carry tool-call identity across approval and related tool events, the approval decision on replies, and tool error status on completion.

The tool-error field is required to retain Aperture's current tool-failure attention behavior; it is not required for a completion-only consumer. Exact names and compatibility details should follow upstream conventions.

Do not request a new OMP transport merely because Herdr currently ignores the existing one. Do not demand a dedicated question-resolution event without a demonstrated lifecycle gap. Graceful session-end publication could simplify closure, but process crashes still require receiver-side liveness handling.

### Herdr: receive and expose the existing protocol

Coordinate with the existing OSC notification issue and propose recognizing the structured terminal-agent envelope, preserving its semantic data, and publishing it with originating pane identity through the socket interface.

The receiver must actually implement the protocol before advertising support to pane applications. Simply exporting the Warp capability variable is not sufficient.

### Receiver/Aperture responsibilities

Ordering, derived IDs, bounded cached state, reconnect policy, and association with a live pane/window can largely remain receiver/consumer responsibilities. A disconnected or restarted receiver must not claim calm from an incomplete stream. This investigation did not implement or validate a replacement recovery protocol.

No attention payload should be treated as authority to approve a tool, submit input, or execute a focus command supplied as arbitrary text. Native origin binding and action validation remain separate from event content.

## Architecture implications

### Keep today

```text
OMP ExtensionAPI
  → Aperture OMP extension
  → worker-direct transport
  → Aperture attention engine
  → Omarchy panel
```

The ExtensionAPI contains richer facts than the current Warp projection. Switching now would discard information and introduce an unsupported receiver path.

- **Aperture upstream** owns the OMP adapter, normalization, engine behavior, focus integration, and signed releases.
- **This repository** packages that implementation, manages activation/removal, and presents worker output. It should not grow a second Warp parser or competing OMP lifecycle mapper.
- Preserve activation and restart requirements. Do not remove the extension until a supported replacement exists.
- No new production transport or abstraction is justified by this investigation alone.

### Potential future cutover

```text
OMP built-in terminal bridge
  → Herdr pane-aware event interface
  → Aperture source adapter
  → existing attention engine and Omarchy panel
```

The primary change would be the source adapter, not attention ranking or UI policy. Two independent contracts must be satisfied before removing the extension:

1. Attention lifecycle, exact resolution, ordering, and disconnection/recovery behavior.
2. Trustworthy navigation to the exact live session's pane/window.

Replacing event forwarding alone does not replace the extension's focus-registration responsibilities. Native focus behavior for this future route was not exercised.

## Related upstream work

The following were open when checked:

| Work | Relationship |
| --- | --- |
| [OMP #5405](https://github.com/can1357/oh-my-pi/issues/5405) | Versioned local app protocol: host, inventory, replay, ordering, recovery, multiple clients. Broad overlap with an event-server proposal, not needed to begin reusing the terminal bridge. |
| [OMP #10161](https://github.com/can1357/oh-my-pi/issues/10161) | Stable local discovery for live TUI/RPC sessions. |
| [OMP #8404](https://github.com/can1357/oh-my-pi/issues/8404) / [draft PR #8408](https://github.com/can1357/oh-my-pi/pull/8408) | Live local terminal attachment and ownership; broader and control-oriented. |
| [OMP PR #6354](https://github.com/can1357/oh-my-pi/pull/6354) | Discover active local Collab hosts. |
| [OMP PR #9833](https://github.com/can1357/oh-my-pi/pull/9833) | Automatically start Collab hosting and publish a link for external clients. |
| [OMP #3746](https://github.com/can1357/oh-my-pi/issues/3746) / [PR #8270](https://github.com/can1357/oh-my-pi/pull/8270) | Notifications when approvals block progress. |
| [OMP PR #8927](https://github.com/can1357/oh-my-pi/pull/8927) | Notify on blocking prompts and deliver notifications inside Herdr. Not a synchronized attention feed. |
| [OMP PR #10427](https://github.com/can1357/oh-my-pi/pull/10427) | Structured RPC approval request/resolution frames and other RPC additions. Coordinate schema semantics with this work. |
| [OMP #4753](https://github.com/can1357/oh-my-pi/issues/4753) | Session identity through the Herdr lifecycle integration. |
| [Herdr #3004](https://github.com/herdrdev/herdr/issues/3004) | Pane OSC 777 notifications do not reach the host terminal. |

Open discussions and PRs are not evidence of maintainer acceptance. No proposal, issue comment, or PR was submitted as part of this investigation.
