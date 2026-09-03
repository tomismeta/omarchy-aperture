function boundedCount(value) {
  var number = Number(value)
  if (!isFinite(number) || Math.floor(number) !== number || number < 0) return 0
  return number
}

function panelPrivacyEnabled(configured, overrideActive, panelOpened) {
  return panelOpened ? (!!configured !== !!overrideActive) : !!configured
}

function createPeekState() {
  return { lastIdentity: "", visible: false, cooldown: false }
}

function copyPeekState(state) {
  var value = state && typeof state === "object" ? state : {}
  return {
    lastIdentity: String(value.lastIdentity || ""),
    visible: value.visible === true,
    cooldown: value.cooldown === true
  }
}

function transitionPeek(state, frame, presentsSnapshot, panelOpened, canReveal) {
  var next = copyPeekState(state)
  var identity = presentsSnapshot && frame ? String(frame.id || "") : ""
  if (identity === "") {
    next.visible = false
    return { state: next, revealStarted: false }
  }
  var changed = identity !== next.lastIdentity
  next.lastIdentity = identity
  var reveal = changed && !next.cooldown && !panelOpened && canReveal
  if (reveal) {
    next.visible = true
    next.cooldown = true
  }
  return { state: next, revealStarted: reveal }
}

function hidePeek(state) {
  var next = copyPeekState(state)
  next.visible = false
  return next
}

function endPeekCooldown(state) {
  var next = copyPeekState(state)
  next.cooldown = false
  return next
}

function pressureLevel(totals) {
  var value = totals && typeof totals === "object" ? totals : {}
  if (boundedCount(value.now) > 0) return 4
  var next = boundedCount(value.next)
  if (next >= 4) return 3
  if (next >= 2) return 2
  return next === 1 ? 1 : 0
}

function clampUnit(value) {
  var number = Number(value)
  if (!isFinite(number)) return 0
  return Math.max(0, Math.min(1, number))
}

function colorRecord(value) {
  var color = value && typeof value === "object" ? value : {}
  return {
    r: clampUnit(color.r),
    g: clampUnit(color.g),
    b: clampUnit(color.b),
    a: 1
  }
}

function mixOpaque(from, to, amount) {
  var left = colorRecord(from)
  var right = colorRecord(to)
  var ratio = clampUnit(amount)
  return {
    r: left.r + (right.r - left.r) * ratio,
    g: left.g + (right.g - left.g) * ratio,
    b: left.b + (right.b - left.b) * ratio,
    a: 1
  }
}

function linearChannel(value) {
  var channel = clampUnit(value)
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4)
}

function relativeLuminance(color) {
  var value = colorRecord(color)
  return 0.2126 * linearChannel(value.r)
    + 0.7152 * linearChannel(value.g)
    + 0.0722 * linearChannel(value.b)
}

function contrastRatio(left, right) {
  var first = relativeLuminance(left)
  var second = relativeLuminance(right)
  var lighter = Math.max(first, second)
  var darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

function pressureColor(level, background, foreground, accent) {
  var normalized = Math.min(4, boundedCount(level))
  var backdrop = colorRecord(background)
  var text = colorRecord(foreground)
  var calm = mixOpaque(backdrop, text, 0.52)
  if (normalized === 0) return calm

  var peak = colorRecord(accent)
  var calmContrast = contrastRatio(calm, backdrop)
  var peakContrast = contrastRatio(peak, backdrop)
  if (peakContrast < calmContrast) {
    for (var blend = 1; blend <= 20; blend++) {
      var candidate = mixOpaque(peak, text, blend / 20)
      if (contrastRatio(candidate, backdrop) >= calmContrast) {
        peak = candidate
        peakContrast = contrastRatio(peak, backdrop)
        break
      }
    }
  }
  if (peakContrast < calmContrast) {
    peak = text
    peakContrast = contrastRatio(peak, backdrop)
  }

  var target = calmContrast
    + (peakContrast - calmContrast) * (normalized / 4)
  for (var step = 1; step <= 100; step++) {
    var shade = mixOpaque(backdrop, peak, step / 100)
    if (contrastRatio(shade, backdrop) >= target) return shade
  }
  return peak
}

function canonicalHeaderSummary(totals) {
  var value = totals && typeof totals === "object" ? totals : {}
  var sourceCount = boundedCount(value.sources)
  return boundedCount(value.now) + " now · "
    + boundedCount(value.next) + " next · "
    + boundedCount(value.ambient) + " ambient · "
    + sourceCount + " source" + (sourceCount === 1 ? "" : "s")
}

function clippedMessage(label, total, visible) {
  var canonicalTotal = boundedCount(total)
  var visibleCount = boundedCount(visible)
  if (canonicalTotal <= visibleCount) return ""
  return visibleCount + " of " + canonicalTotal + " " + label + " shown"
}

function nextSummary(count) {
  var total = boundedCount(count)
  return total === 0 ? "None" : total + " queued"
}

function ambientSummary(count) {
  var total = boundedCount(count)
  return total === 0 ? "None" : total + " quiet · no action needed"
}

function frameOrdinal(hasNow, nextCount, lane, index) {
  var offset = hasNow ? 1 : 0
  var position = Math.max(0, boundedCount(index))
  if (lane === "now") return 1
  if (lane === "next") return offset + position + 1
  if (lane === "ambient")
    return offset + boundedCount(nextCount) + position + 1
  return 1
}


function frameMeta(frame, ordinal, privacyMode) {
  var index = Math.max(1, boundedCount(ordinal))
  if (privacyMode) return "omp - session " + index
  var rawLabel = frame && frame.source && frame.source.label
    ? String(frame.source.label).trim() : ""
  var lowerLabel = rawLabel.toLowerCase()
  var name = ""
  if (lowerLabel !== "" && lowerLabel !== "omp") {
    name = lowerLabel.indexOf("omp - ") === 0
      ? rawLabel.substring(6).trim()
      : (lowerLabel.indexOf("omp ") === 0 ? rawLabel.substring(4).trim() : rawLabel)
  }
  return name === "" ? "omp" : "omp - " + name
}

function frameTitle(frame, ordinal, privacyMode) {
  if (privacyMode) return "Task " + Math.max(1, boundedCount(ordinal))
  return frame ? String(frame.title || "") : ""
}

function frameSummary(frame, privacyMode) {
  if (privacyMode) return "[details hidden]"
  return frame ? String(frame.summary || "") : ""
}

function frameLine(frame, ordinal, privacyMode) {
  var title = frameTitle(frame, ordinal, privacyMode)
  var summary = frameSummary(frame, privacyMode)
  return summary === "" ? title : title + " — " + summary
}


function showFocusStatus(selected, hovered, pending, failed) {
  return !!selected || !!hovered || !!pending || !!failed
}

function shortcutFooter(hasSnapshot, hasNavigableFrames) {
  if (!hasSnapshot) return ""
  return hasNavigableFrames
    ? "↑↓ select · Enter focus · P privacy · Esc"
    : "P privacy · Esc"
}


if (typeof module !== "undefined") {
  module.exports = {
    boundedCount: boundedCount,
    canonicalHeaderSummary: canonicalHeaderSummary,
    panelPrivacyEnabled: panelPrivacyEnabled,
    createPeekState: createPeekState,
    transitionPeek: transitionPeek,
    hidePeek: hidePeek,
    endPeekCooldown: endPeekCooldown,
    frameOrdinal: frameOrdinal,
    pressureLevel: pressureLevel,
    pressureColor: pressureColor,
    contrastRatio: contrastRatio,
    clippedMessage: clippedMessage,
    nextSummary: nextSummary,
    ambientSummary: ambientSummary,
    frameMeta: frameMeta,
    frameTitle: frameTitle,
    frameSummary: frameSummary,
    frameLine: frameLine,
    showFocusStatus: showFocusStatus,
    shortcutFooter: shortcutFooter,
  }
}
