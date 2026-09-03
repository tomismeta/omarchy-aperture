import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(root, relative), "utf8");
const policy = JSON.parse(await read("config/artifact-policy.json"));
const manifest = JSON.parse(await read("manifest.json"));
const baselineText = await read("PROTOCOL_BASELINE");
const baseline = {};
for (const line of baselineText.trim().split("\n")) {
  const separator = line.indexOf("=");
  assert(separator > 0, `malformed baseline line: ${line}`);
  const key = line.slice(0, separator);
  assert.equal(Object.hasOwn(baseline, key), false, `duplicate baseline key: ${key}`);
  baseline[key] = line.slice(separator + 1);
}

assert.equal(manifest.id, "aperture");
assert.equal(manifest.name, "Aperture");
assert.equal(baseline.schema_version, "17");
assert.equal(baseline.manifest_id, manifest.id);
assert.equal(baseline.manifest_name, manifest.name);

assert.equal(manifest.activation, "keep-loaded");
assert.equal(manifest.entryPoints.service, "Service.qml");
assert.equal(manifest.entryPoints.barWidget, "Panel.qml");
assert.equal(baseline.product_scope, "omp-only");
assert.equal(baseline.manifest_version, manifest.version);
assert.equal(baseline.manifest_activation, manifest.activation);
assert.equal(baseline.manifest_service, manifest.entryPoints.service);
assert.equal(baseline.manifest_bar_widget, manifest.entryPoints.barWidget);
assert.equal(baseline.panel_action, "opaque-focus-only");
assert.equal(baseline.panel_lane_order, "accepted-worker-snapshot");
assert.equal(baseline.panel_wait_time_inference, "forbidden");
assert.equal(baseline.panel_header_source, "accepted-totals-and-sources");
assert.equal(baseline.panel_ambient_default, manifest.barWidget.defaults.ambientDisplay);
assert.equal(baseline.panel_reference_width_style_space, "400");
assert.equal(baseline.panel_max_height_style_space, "520");
assert.equal(baseline.panel_next_row_layout, "two-line-meta-and-title-summary");
assert.equal(baseline.panel_why_now, "not-rendered");
assert.equal(baseline.panel_next_summary, "ambient-style-inline");
assert.equal(baseline.panel_next_ambient_separator, "none");
assert.equal(baseline.panel_now_signal_label, "not-rendered");
assert.equal(baseline.panel_source_format, "omp-or-omp-dash-safe-label");
assert.equal(baseline.omp_session_display_label, "upstream-unavailable-in-v2");
assert.equal(
  baseline.panel_privacy_scope,
  "persistent-default-plus-open-panel-override",
);
assert.equal(baseline.panel_hotkey, "SUPER+A-user-binding");
assert.equal(
  baseline.panel_now_peek,
  "passive-focused-monitor-once-per-frame-identity-8000ms",
);
assert.equal(baseline.panel_next_auto_open, "never");
assert.equal(baseline.panel_icon, "forty-percent-top-arc-solid-human");
assert.equal(
  baseline.panel_pressure_levels,
  "calm-0,next-1,next-2-3,next-4-plus,now",
);
assert.equal(
  baseline.panel_pressure_palette,
  "opaque-background-foreground-accent-contrast-ramp",
);
assert.equal(baseline.panel_badge, "removed");
assert.equal(baseline.panel_peek_cooldown_ms, "30000");
assert.equal(baseline.panel_peek_click_guard_ms, "450");
assert.equal(baseline.panel_peek_content_updates_restart_deadline, "false");
assert.equal(baseline.panel_peek_restored_identity_reveals, "false");
assert.equal(baseline.panel_non_navigable_footer, "P-privacy-and-Esc");
assert.equal(
  baseline.panel_peek_accessibility,
  "static-before-click-guard-button-after-click-guard",
);
assert.equal(
  baseline.manifest_presentation_settings,
  manifest.barWidget.schema.map(entry => entry.key).join(","),
);
assert.equal(baseline.manifest_default_section, manifest.barWidget.defaultSection);
assert.equal(baseline.manifest_preview, manifest.preview);
assert.equal(baseline.production_fixture_switch, "absent");
assert.equal(baseline.artifact_policy_acceptance, policy.artifactAcceptance);
assert.equal(baseline.artifact_policy_production_eligible, String(policy.productionEligible));
assert.equal(baseline.public_aperture_package_version, policy.versions.aperture);
assert.equal(baseline.aperture_core_version, policy.versions.apertureCore);
assert.equal(baseline.private_omp_package_version, policy.versions.ompIntegration);
assert.equal(baseline.worker_direct_protocol_version, "4");
assert.equal(baseline.omp_attention_event_schema_version, "2");
assert.equal(baseline.worker_output_schema_version, "4");
assert.equal(baseline.surface_protocol_version, "4");
assert.equal(baseline.private_worker_jsonl_protocol_version, "4");
assert.equal(baseline.public_surface_jsonl_protocol_version, "4");
assert.equal(baseline.public_surface_navigation, "absent");
assert.equal(baseline.worker_socket_lifecycle_serialization, "hard-link-owner-lock");
assert.equal(baseline.worker_socket_cleanup_deadline_ms, "1500");
assert.equal(baseline.maximum_text_artifact_bytes, "524288");
assert.equal(baseline.artifact_policy_schema_version, String(policy.schemaVersion));
assert.equal(baseline.authenticated_vendor_tool, ".github/scripts/vendor-aperture-worker-release.mjs");
assert.equal(
  baseline.explicit_activation_command,
  "~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate",
);
assert.equal(
  baseline.explicit_deactivation_command,
  "~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate",
);

const mandatoryDocs = ["AGENTS.md", "README.md", "HANDOFF.md", "PROTOCOL.md", "COORDINATION.md"];
for (const relative of mandatoryDocs) {
  const content = await read(relative);
  assert(content.toLowerCase().includes("omp-only"), `${relative} omits OMP-only scope`);
  assert(content.includes(policy.approvedSourceTag), `${relative} omits accepted/rejected tag`);
  assert(content.includes(policy.apertureCommit), `${relative} omits Aperture commit`);
  if (policy.artifactAcceptance === "rejected")
    assert(content.toLowerCase().includes("rejected"), `${relative} omits rejection status`);
}
for (const relative of ["README.md", "HANDOFF.md", "PROTOCOL.md", "COORDINATION.md"]) {
  const content = await read(relative);
  assert(
    content.includes(baseline.explicit_activation_command),
    `${relative} omits the installed activation command`,
  );
  assert(
    content.includes(baseline.explicit_deactivation_command),
    `${relative} omits the installed deactivation command`,
  );
}


for (const relative of [
  "AGENTS.md",
  "README.md",
  "HANDOFF.md",
  "PROTOCOL.md",
  "COORDINATION.md",
  "Panel.qml",
  "Service.qml",
  "bin/omarchy-aperture-pre-remove",
]) {
  assert.equal(
    (await read(relative)).includes("aperture.attention"),
    false,
    `${relative} retained the pre-release plugin id`,
  );
}
const developmentManifest = JSON.parse(await read("fixtures/development/manifest.json"));
assert.equal(developmentManifest.id, "aperture.fixtures");
assert.equal(developmentManifest.name, "Aperture Fixtures");

const service = await read("Service.qml");
for (const forbidden of [
  "omarchy.notifications",
  "notificationObserved",
  "notificationUpdated",
  "notificationClosed",
  "observerGeneration",
]) assert.equal(service.includes(forbidden), false, `Service.qml retained ${forbidden}`);

const bridge = await read("WorkerBridgeLogic.js");
for (const forbidden of ["projectUpsert", "projectClosed", "notification.observed", "notification.updated"])
  assert.equal(bridge.includes(forbidden), false, `WorkerBridgeLogic.js retained ${forbidden}`);

for (const relative of ["bin/aperture-attention-engine", "bin/omarchy-aperture-omp"])
  assert((await read(relative)).includes("--require-production"), `${relative} lacks production gate`);

await assert.rejects(() => access(path.join(root, "AttentionModel.qml")));

if (policy.artifactAcceptance !== "rejected") {
  const reportPath = policy.release.releaseReport.path;
  const report = JSON.parse(await read(reportPath));
  assert.equal(report.signedTag, policy.approvedSourceTag);
  assert.equal(report.signedTagCommit, policy.apertureCommit);
  assert.deepEqual(report.attestationPolicy, policy.release.attestationPolicy);
}

process.stdout.write("ok - mandatory OMP-only documents, policy, manifest, and runtime gates agree\n");
