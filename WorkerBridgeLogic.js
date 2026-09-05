var INPUT_LINE_BYTES = 64 * 1024
var QUEUE_LIMIT = 16

function utf8ByteLength(value) {
  var text = String(value)
  var bytes = 0
  for (var index = 0; index < text.length; index++) {
    var code = text.charCodeAt(index)
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff
        && index + 1 < text.length
        && text.charCodeAt(index + 1) >= 0xdc00
        && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4
      index += 1
    } else bytes += 3
  }
  return bytes
}

function consumeWorkerOutput(buffer, data, maximumLineBytes, acceptLine) {
  var pending = String(buffer)
  var chunk = String(data)
  var maximum = Number(maximumLineBytes)
  if (!isFinite(maximum) || Math.floor(maximum) !== maximum || maximum < 1
      || typeof acceptLine !== "function")
    throw new Error("invalid worker output framing arguments")
  if (chunk === "") return { ok: true, buffer: pending }
  if (/[^\u0000-\u007f]/.test(chunk))
    return { ok: false, buffer: "", code: "non_ascii" }

  var offset = 0
  while (offset < chunk.length) {
    var newline = chunk.indexOf("\n", offset)
    var end = newline === -1 ? chunk.length : newline
    var segment = chunk.substring(offset, end)
    if (utf8ByteLength(pending) + utf8ByteLength(segment) + 1 > maximum)
      return { ok: false, buffer: "", code: "oversized_line" }
    pending += segment
    if (newline === -1) return { ok: true, buffer: pending }
    if (pending.length === 0)
      return { ok: false, buffer: "", code: "empty_line" }
    if (acceptLine(pending) === false)
      return { ok: true, buffer: "", stopped: true }
    pending = ""
    offset = newline + 1
  }
  return { ok: true, buffer: pending }
}

function codePointLength(value) {
  return Array.from(String(value)).length
}

function hasControl(value) {
  return /[\u0000-\u001f\u007f]/.test(String(value))
}


function projectFocusActivation(requestId, handle) {
  if (typeof requestId !== "string" || typeof handle !== "string"
      || requestId.trim() === "" || codePointLength(requestId) > 160
      || hasControl(requestId) || !/^[A-Za-z0-9_-]{32}$/.test(handle)) return null
  return {
    type: "focus.activate",
    requestId: requestId,
    handle: handle
  }
}

function serializeInput(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return null
  var encoded
  try {
    encoded = JSON.stringify(message)
  } catch (error) {
    return null
  }
  if (typeof encoded !== "string") return null
  var line = encoded + "\n"
  return utf8ByteLength(line) <= INPUT_LINE_BYTES ? line : null
}

function createQueue() {
  return { entries: [] }
}

function queueKey(key) {
  return "$" + String(key)
}


function enqueue(queue, message, line) {
  if (!queue || !Array.isArray(queue.entries) || !message || typeof line !== "string") return false
  if (queue.entries.length >= QUEUE_LIMIT) return false
  queue.entries.push({ line: line })
  return true
}

function take(queue) {
  if (!queue || !Array.isArray(queue.entries) || queue.entries.length === 0) return null
  var entry = queue.entries.shift()
  return entry
}

function clearQueue(queue) {
  if (!queue) return
  queue.entries = []
}

function createFocusRequestLedger(limit) {
  var maximum = Number(limit)
  if (!isFinite(maximum) || Math.floor(maximum) !== maximum || maximum < 1)
    throw new Error("invalid focus request limit")
  return { entries: {}, count: 0, limit: maximum }
}

function addFocusRequest(ledger, requestId, handle) {
  if (!ledger || !ledger.entries || ledger.count >= ledger.limit) return false
  var key = queueKey(requestId)
  if (Object.prototype.hasOwnProperty.call(ledger.entries, key)) return false
  ledger.entries[key] = String(handle)
  ledger.count += 1
  return true
}

function takeFocusRequest(ledger, requestId) {
  if (!ledger || !ledger.entries) return null
  var key = queueKey(requestId)
  if (!Object.prototype.hasOwnProperty.call(ledger.entries, key)) return null
  var handle = ledger.entries[key]
  delete ledger.entries[key]
  ledger.count = Math.max(0, ledger.count - 1)
  return handle
}

function clearFocusRequests(ledger) {
  if (!ledger || !ledger.entries) return []
  var keys = Object.keys(ledger.entries)
  var pending = []
  for (var index = 0; index < keys.length; index++)
    pending.push({ requestId: keys[index].substring(1), handle: ledger.entries[keys[index]] })
  ledger.entries = {}
  ledger.count = 0
  return pending
}

function limits() {
  return {
    queueEntries: QUEUE_LIMIT
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    limits: limits,
    utf8ByteLength: utf8ByteLength,
    consumeWorkerOutput: consumeWorkerOutput,
    projectFocusActivation: projectFocusActivation,
    serializeInput: serializeInput,
    createQueue: createQueue,
    enqueue: enqueue,
    take: take,
    clearQueue: clearQueue,
    createFocusRequestLedger: createFocusRequestLedger,
    addFocusRequest: addFocusRequest,
    takeFocusRequest: takeFocusRequest,
    clearFocusRequests: clearFocusRequests
  }
}
