import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const panel = await read("Panel.qml");
const service = await read("Service.qml");
const presentation = await read("PanelPresentationLogic.js");
const focus = await read("PanelFocusLogic.js");
const peek = await read("AttentionPeek.qml");
const mark = await read("ApertureMark.qml");
const fixturePanel = await read("fixtures/development/Panel.qml");
const manifest = JSON.parse(await read("manifest.json"));

for (const source of [panel, presentation, focus, peek]) {
  assert.equal(source.includes(".sort("), false, "renderer must preserve canonical order");
  assert.equal(/\bDate(?:\.now|\s*\()/.test(source), false, "renderer must not derive wait time");
  assert.equal(source.includes(".timing"), false, "renderer must not inspect protocol timestamps");
}
assert.equal(panel.includes("whyNow"), false);
assert.equal(panel.includes(".provenance"), false);
assert.equal(panel.includes("Why ·"), false);
assert.equal(panel.includes("text: root.nextSummary()"), true);
assert.equal(panel.includes("No queued attention."), false);
assert.equal(panel.includes("root.alpha(root.foreground, 0.34)"), false);
assert.equal(panel.includes("attentionSignalText"), false);
assert.equal(panel.includes("CONSEQUENCE"), false);

assert.equal(panel.includes("barBadge"), false);
assert.equal(panel.includes("badgeText"), false);
assert.equal(panel.includes("peekDurationMs: 8000"), true);
assert.equal(panel.includes("Presentation.transitionPeek"), true);
assert.equal(panel.includes("peekCooldownMs: 30000"), true);
assert.equal(panel.includes("panelPrivacyOverride"), true);
assert.equal(panel.includes("root.privacyModeDefault"), true);
assert.equal(panel.includes("pressureOpacity"), false);
assert.equal(panel.includes("pressureColor: root.alpha"), false);
assert.equal(panel.includes("Hyprland.focusedMonitor"), true);
assert.equal(panel.includes("findPanelWidget"), false);
assert.equal(peek.includes("PopupWindow"), true);
assert.equal(/\bKeyboardPanel\s*\{/.test(peek), false);
assert.equal(peek.includes("HyprlandFocusGrab"), false);
assert.equal(peek.includes("WlrKeyboardFocus"), false);
assert.equal(peek.includes("clickGuardMs: 450"), true);
assert.equal(peek.includes("mask: Region"), true);
assert.equal(
  peek.includes("open && canFocusSession && guardElapsed && pointerIntentObserved"),
  true,
);
assert.equal(peek.includes('activationLabel: "Focus OMP session"'), true);
assert.equal(peek.includes("Open Aperture"), false);
assert.equal(
  peek.includes("root.canFocusSession ? root.activationLabel : \"Aperture NOW\""),
  true,
);
assert.equal(peek.includes("acceptedButtons: root.interactionArmed ? Qt.LeftButton : Qt.NoButton"), true);
assert.equal(peek.includes("onPositionChanged: root.pointerIntentObserved = true"), true);
assert.equal(peek.includes("Accessible.StaticText"), true);
assert.equal(peek.includes("Accessible.Button"), true);
assert.equal(peek.includes("Accessible.onPressAction"), true);
assert.equal(service.includes("Qt.createQmlObject"), true);
assert.equal(service.includes('[launcherPath, "--cleanup-owned-socket"]'), true);
assert.equal(service.includes("WorkerCleanupCapsule"), false);
assert.equal(service.includes('? "protocol_latch" : "protocol_error"'), true);
assert.equal(
  service.includes('completedMode === "fatal" || completedMode === "protocol_latch"'),
  true,
);
assert.equal(service.includes('lastFocusRequestDisposition = "busy"'), true);
assert.equal(
  panel.includes('lastFocusRequestDisposition || "") === "busy"'),
  true,
);
assert.equal(panel.includes('if (queuedFocusHandle !== "") focusDispatchTimer.restart()'), true);
assert.equal(presentation.includes("projectFor"), false);
assert.equal(mark.includes("M3.44 9.22 A9 9 0 0 1 20.56 9.22"), true);
assert.equal(mark.includes("property int pressureLevel: 0"), true);
assert.equal(mark.includes("root.level >= 2"), true);
assert.equal(mark.includes("root.level >= 3"), true);
assert.equal(mark.includes("root.level >= 4"), true);
assert.equal(/\b(?:Sequential|Number|Rotation)Animation\b/.test(mark), false);
assert.equal(panel.includes('"Aperture · NOW " + nowCount + " · NEXT " + nextCount'), true);
assert.equal(mark.includes("M18.6 17.5 A8.6 8.6 0 1 1 19.45 7.7"), false);
for (const forbidden of [
  "Qt.RightButton",
  "execDetached",
  "SequentialAnimation",
  "NumberAnimation",
  "RotationAnimator",
  "Avatar",
  "greeting",
]) assert.equal(panel.includes(forbidden), false, `Panel.qml retained rejected pattern ${forbidden}`);

for (const forbidden of ["FileView", "StandardPaths", "fixtures/", "scenario", "demo"])
  assert.equal(panel.includes(forbidden), false, `production panel retained fixture/filesystem hook ${forbidden}`);
assert.equal(panel.includes("attentionModel.requestFocus(handle)"), true);
assert.equal(panel.includes("if (buttonCode === Qt.LeftButton) root.toggle()"), true);
assert.equal(panel.includes("onClicked: root.focusFrame(modelData)"), true);
assert.equal(panel.includes("↑↓ select · Enter focus · P privacy · Esc"), false);
assert.equal(presentation.includes("↑↓ select · Enter focus · P privacy · Esc"), true);
assert.equal(presentation.includes("P privacy · Esc"), true);
assert.equal(panel.includes("Style.space(400)"), true);
assert.equal(panel.includes("Style.space(520)"), true);
assert.equal(panel.includes("Style.space(640)"), false);
assert.equal(panel.includes("dy * Style.space(32)"), false);
assert.equal(panel.includes('Border.controlSpec("hover-cursor"'), true);
assert.equal(fixturePanel.includes("FixtureLogic.js"), true);
assert.equal(fixturePanel.includes("WorkerModel"), true);

const settingKeys = manifest.barWidget.schema.map((entry) => entry.key).sort();
assert.deepEqual(settingKeys, ["ambientDisplay", "privacyMode"]);
for (const forbidden of ["sort", "order", "priority", "threshold", "lane", "maxItems", "working"])
  assert.equal(settingKeys.includes(forbidden), false, `manifest exposes semantic setting ${forbidden}`);
assert.equal(manifest.barWidget.defaults.privacyMode, "false");
assert.equal(
  manifest.barWidget.schema.find(entry => entry.key === "privacyMode").defaultValue,
  "false",
);
assert.equal(manifest.barWidget.defaultSection, "right");
assert.equal(manifest.preview, "preview.png");
await access(path.join(root, manifest.preview));

for (const relative of [
  "Service.qml",
  "WorkerOutputLogic.js",
  "PanelFocusLogic.js",
  "PanelPresentationLogic.js",
  "AttentionPeek.qml",
]) await access(path.join(root, relative));
await assert.rejects(() => access(path.join(root, "WorkerCleanupCapsule.qml")));

process.stdout.write("ok - renderer keeps canonical semantics, opaque focus, and fixtures behind module boundaries\n");
