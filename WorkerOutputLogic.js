function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasExactKeys(value, required, optional) {
  if (!isObject(value)) return false
  var allowed = {}
  for (var index = 0; index < required.length; index++) {
    allowed["$" + required[index]] = true
    if (!Object.prototype.hasOwnProperty.call(value, required[index])) return false
  }
  for (var option = 0; option < optional.length; option++) allowed["$" + optional[option]] = true
  var keys = Object.keys(value)
  for (var keyIndex = 0; keyIndex < keys.length; keyIndex++)
    if (!allowed["$" + keys[keyIndex]]) return false
  return true
}

function validString(value, minimum, maximum) {
  if (typeof value !== "string") return false
  var length = Array.from(value).length
  return length >= minimum && length <= maximum
}

function validVisibleString(value, minimum, maximum) {
  return validString(value, minimum, maximum)
    && value.trim() !== "" && !/[\u0000-\u001f\u007f]/.test(value)
}

function validInteger(value, minimum, maximum) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value
    && Math.abs(value) <= 9007199254740991
    && value >= minimum && (maximum === undefined || value <= maximum)
}

function validEnum(value, values) {
  return typeof value === "string" && values.indexOf(value) !== -1
}

var WORKER_PROTOCOL_VERSION = 4
var DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function validDate(value) {
  if (typeof value !== "string") return false
  var match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!match) return false
  var year = Number(match[1])
  var month = Number(match[2])
  var day = Number(match[3])
  var hour = Number(match[4])
  var minute = Number(match[5])
  var second = Number(match[6])
  var offsetHour = match[7] === undefined ? 0 : Number(match[7])
  var offsetMinute = match[8] === undefined ? 0 : Number(match[8])
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59
      || offsetHour > 23 || offsetMinute > 59) return false
  var maximumDay = DAYS_PER_MONTH[month - 1]
  if (month === 2 && (year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)))
    maximumDay = 29
  return day >= 1 && day <= maximumDay && !isNaN(Date.parse(value))
}

function validSource(value) {
  return hasExactKeys(value, ["kind", "label"], [])
    && validString(value.kind, 1, 80) && validString(value.label, 1, 120)
}

function validNavigation(value) {
  return hasExactKeys(value, ["kind", "handle"], [])
    && value.kind === "opaque-focus"
    && typeof value.handle === "string"
    && /^[A-Za-z0-9_-]{32}$/.test(value.handle)
}

function validContextItem(value) {
  return hasExactKeys(value, ["id", "label"], ["value"])
    && validString(value.id, 1, 160) && validString(value.label, 1, 120)
    && (value.value === undefined || validString(value.value, 0, 240))
}

function validContext(value) {
  if (!hasExactKeys(value, [], ["stage", "progress", "items"])) return false
  if (value.stage !== undefined && !validString(value.stage, 0, 120)) return false
  if (value.progress !== undefined
      && (typeof value.progress !== "number" || !isFinite(value.progress))) return false
  if (value.items !== undefined) {
    if (!Array.isArray(value.items) || value.items.length > 8) return false
    for (var index = 0; index < value.items.length; index++)
      if (!validContextItem(value.items[index])) return false
  }
  return true
}

function validTiming(value) {
  return hasExactKeys(value, ["createdAt", "updatedAt"], ["expiresAt"])
    && validDate(value.createdAt) && validDate(value.updatedAt)
    && (value.expiresAt === undefined || validDate(value.expiresAt))
}

function validFrame(value) {
  if (!hasExactKeys(value,
      ["id", "taskId", "interactionId", "version", "mode", "tone", "consequence", "title", "timing"],
      ["summary", "source", "navigation", "context", "provenance"])) return false
  if (!validString(value.id, 1, 160) || !validString(value.taskId, 1, 160)
      || !validString(value.interactionId, 1, 160) || !validInteger(value.version, 0)
      || !validEnum(value.mode, ["status", "approval", "choice", "form"])
      || !validEnum(value.tone, ["ambient", "focused", "critical"])
      || !validEnum(value.consequence, ["low", "medium", "high"])
      || !validString(value.title, 1, 200) || !validTiming(value.timing)) return false
  if (value.summary !== undefined && !validString(value.summary, 0, 600)) return false
  if (value.source !== undefined && !validSource(value.source)) return false
  if (value.navigation !== undefined && !validNavigation(value.navigation)) return false
  if (value.context !== undefined && !validContext(value.context)) return false
  if (value.provenance !== undefined
      && (!hasExactKeys(value.provenance, ["whyNow"], [])
        || !validString(value.provenance.whyNow, 1, 400))) return false
  return true
}

function validFrames(values, maximum) {
  if (!Array.isArray(values) || values.length > maximum) return false
  for (var index = 0; index < values.length; index++)
    if (!validFrame(values[index])) return false
  return true
}

function validSnapshot(message) {
  if (!hasExactKeys(message, ["type", "sequence", "sources", "totals", "view"], [])
      || message.type !== "snapshot" || !validInteger(message.sequence, 1)) return false
  if (!Array.isArray(message.sources) || message.sources.length > 32) return false
  for (var sourceIndex = 0; sourceIndex < message.sources.length; sourceIndex++)
    if (!validSource(message.sources[sourceIndex])) return false
  if (!hasExactKeys(message.totals, ["now", "next", "ambient", "sources"], [])
      || !validInteger(message.totals.now, 0, 1)
      || !validInteger(message.totals.next, 0)
      || !validInteger(message.totals.ambient, 0)
      || !validInteger(message.totals.sources, 0)) return false
  if (!hasExactKeys(message.view, ["now", "next", "ambient"], [])) return false
  if (message.view.now !== null && !validFrame(message.view.now)) return false
  if (!validFrames(message.view.next, 32) || !validFrames(message.view.ambient, 64)) return false
  return message.totals.now === (message.view.now === null ? 0 : 1)
    && message.totals.sources >= message.sources.length
    && message.totals.next >= message.view.next.length
    && message.totals.ambient >= message.view.ambient.length
}

function failure(code, message) {
  return { ok: false, code: code, error: message }
}

function parse(line, helloSeen, lastSequence) {
  var message
  try {
    message = JSON.parse(String(line))
  } catch (error) {
    return failure("malformed_json", "The attention worker emitted malformed JSON.")
  }
  if (!isObject(message) || typeof message.type !== "string")
    return failure("invalid_message", "The attention worker emitted an invalid protocol message.")

  if (message.type === "hello") {
    if (helloSeen
        || !hasExactKeys(
          message,
          ["type", "protocolVersion", "packageVersion", "worker", "capabilities"],
          [])
        || !validInteger(message.protocolVersion, 1)
        || !validString(message.packageVersion, 1, 120)
        || message.worker !== "aperture-attention-engine"
        || !hasExactKeys(message.capabilities,
          ["notificationInput", "ompDirectInput", "snapshots", "responses", "focusActivation"], [])
        || message.capabilities.notificationInput !== false
        || message.capabilities.ompDirectInput !== true
        || message.capabilities.snapshots !== true
        || message.capabilities.responses !== false
        || message.capabilities.focusActivation !== true)
      return failure("invalid_hello", "The attention worker emitted an invalid handshake.")
    if (message.protocolVersion !== WORKER_PROTOCOL_VERSION)
      return failure(
        "unsupported_protocol",
        "This plugin requires attention worker protocol "
          + WORKER_PROTOCOL_VERSION + ".")
    return { ok: true, kind: "hello", message: message }
  }

  if (!helloSeen)
    return failure("missing_hello", "The attention worker emitted data before its handshake.")

  if (message.type === "engine") {
    if (!hasExactKeys(message, ["type", "state", "acceptedSources"], [])
        || !validEnum(message.state, ["restoring", "ready", "degraded"])
        || !validInteger(message.acceptedSources, 0))
      return failure("invalid_engine", "The attention worker emitted an invalid engine state.")
    return { ok: true, kind: "engine", message: message }
  }

  if (message.type === "error") {
    if (!hasExactKeys(message, ["type", "code", "message", "recoverable"], [])
        || !validString(message.code, 1, 80) || !validString(message.message, 1, 400)
        || typeof message.recoverable !== "boolean")
      return failure("invalid_error", "The attention worker emitted an invalid error.")
    return { ok: true, kind: "error", message: message }
  }

  if (message.type === "focus.result") {
    if (!hasExactKeys(message, ["type", "requestId", "result"], [])
        || !validVisibleString(message.requestId, 1, 160)
        || !validEnum(message.result, ["focused", "stale", "missing"]))
      return failure("invalid_focus_result", "The attention worker emitted an invalid focus result.")
    return { ok: true, kind: "focus", message: message }
  }

  if (message.type === "snapshot") {
    if (!validSnapshot(message) || message.sequence <= Number(lastSequence || 0))
      return failure("invalid_snapshot", "The attention worker emitted an invalid or stale snapshot.")
    return { ok: true, kind: "snapshot", message: message }
  }

  return failure("unknown_message", "The attention worker emitted an unknown protocol message.")
}

if (typeof module !== "undefined") {
  module.exports = {
    parse: parse,
    validNavigation: validNavigation
  }
}
