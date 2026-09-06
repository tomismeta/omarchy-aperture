function boundedCount(value) {
  var number = Number(value)
  if (!isFinite(number) || Math.floor(number) !== number || number < 0) return 0
  return number
}

function panelPrivacyEnabled(configured, overrideActive, panelOpened) {
  return panelOpened ? (!!configured !== !!overrideActive) : !!configured
}

// Match the worker surface's maximum attention projection: one NOW plus 32 NEXT.
var PEEK_CARD_LIMIT = 33

function peekIdentity(frame) {
  return frame && typeof frame.id === "string" && frame.id !== ""
    ? JSON.stringify([frame.id, String(frame.interactionId || "")]) : ""
}

function peekFrames(snapshot) {
  if (!snapshot || !snapshot.presents) return []
  return (snapshot.now ? [snapshot.now] : []).concat(snapshot.next || [])
}

function resolvePeekFrame(snapshot, identity) {
  if (!identity) return null
  var frames = peekFrames(snapshot)
  for (var index = 0; index < frames.length; index++)
    if (peekIdentity(frames[index]) === identity) return frames[index]
  return null
}

function peekUnshownCount(cards, snapshot) {
  if (!snapshot || !snapshot.presents) return 0
  var frames = peekFrames(snapshot)
  var totals = snapshot.totals || {}
  var total = Math.max(frames.length, boundedCount(totals.now) + boundedCount(totals.next))
  var shown = 0
  for (var index = 0; index < frames.length; index++) {
    var identity = peekIdentity(frames[index])
    if (identity !== "" && cards.some(function(card) { return card.identity === identity }))
      shown++
  }
  // Held stale cards and AMBIENT never reduce current attention's overflow.
  return Math.max(0, total - shown)
}

function createPeekState() {
  return {
    cards: [], seen: [], visible: false,
    reading: false, remaining: 0, deadline: 0
  }
}

function peekCardAvailability(card, current, presents) {
  if (!presents) return "unavailable"
  if (!current) return "stale"
  if (card.hadNavigation && !current.navigation) return "session"
  return ""
}

// Presentation identities are bounded by the latest snapshot plus the capped deck.
// Frames are immutable snapshot references, not a second attention model.
function transitionPeek(state, snapshot, options) {
  var frames = peekFrames(snapshot)
  var now = Number(options.now)
  var duration = Number(options.duration || 8000)
  var grace = Number(options.grace || 2000)
  var identities = frames.map(peekIdentity)
  var snapshotIdentities = identities.concat(
    snapshot.presents ? (snapshot.ambient || []).map(peekIdentity) : [])
  var heldIdentities = state.cards.map(function(card) { return card.identity })
  var seen = state.seen.filter(function(identity) {
    return snapshotIdentities.indexOf(identity) >= 0
      || heldIdentities.indexOf(identity) >= 0
  })
  if (options.opened) {
    for (var consume = 0; consume < identities.length; consume++)
      if (seen.indexOf(identities[consume]) < 0) seen.push(identities[consume])
    var suppressed = createPeekState()
    suppressed.seen = seen.filter(function(identity) {
      return snapshotIdentities.indexOf(identity) >= 0
    })
    return suppressed
  }

  var reading = state.visible && options.reading === true
    && !options.activatedIdentity
  var remaining = state.reading ? state.remaining
    : Math.max(0, state.deadline - now)
  if (state.reading && !reading) remaining = Math.max(grace, remaining)
  var cards = []
  var added = false
  var mayStart = !state.visible && options.canReveal
    && identities.some(function(identity) {
      return identity !== "" && seen.indexOf(identity) < 0
    })
  if (state.visible && reading) {
    // Preserve geometry and copy, but remember any capability observed while held.
    cards = state.cards.map(function(card) {
      var current = resolvePeekFrame(snapshot, card.identity)
      if (card.hadNavigation || !current || !current.navigation) return card
      return {
        identity: card.identity, frame: card.frame, ordinal: card.ordinal,
        hadNavigation: true
      }
    })
    // Append only what can be displayed; overflow remains unseen, not queued.
    // Held canonical ordinals can be sparse when an earlier card already expired.
    var nextOrdinal = 1
    for (var held = 0; held < cards.length; held++)
      nextOrdinal = Math.max(nextOrdinal, cards[held].ordinal + 1)
    for (var incoming = 0; incoming < frames.length && cards.length < PEEK_CARD_LIMIT; incoming++) {
      var incomingIdentity = identities[incoming]
      if (incomingIdentity === "" || seen.indexOf(incomingIdentity) >= 0) continue
      cards.push({
        identity: incomingIdentity, frame: frames[incoming], ordinal: nextOrdinal++,
        hadNavigation: !!frames[incoming].navigation
      })
      seen.push(incomingIdentity)
      added = true
    }
  } else if (state.visible || mayStart) {
    for (var index = 0; index < frames.length && cards.length < PEEK_CARD_LIMIT; index++) {
      var identity = identities[index]
      if (identity === "" || identity === options.activatedIdentity
          || cards.some(function(card) { return card.identity === identity }))
        continue
      var oldIndex = heldIdentities.indexOf(identity)
      if (oldIndex < 0 && seen.indexOf(identity) >= 0) continue
      var old = oldIndex < 0 ? null : state.cards[oldIndex]
      cards.push({
        identity: identity, frame: frames[index], ordinal: index + 1,
        hadNavigation: !!frames[index].navigation || !!(old && old.hadNavigation)
      })
      if (oldIndex < 0) added = true
      if (seen.indexOf(identity) < 0) seen.push(identity)
    }
  }
  if (added || options.activatedIdentity) remaining = duration
  var visible = cards.length > 0 && (reading || remaining > 0)
  // A non-focused panel instance consumes rather than later replaying this arrival.
  if (!state.visible && !options.canReveal) {
    for (var skipped = 0; skipped < identities.length; skipped++)
      if (seen.indexOf(identities[skipped]) < 0) seen.push(identities[skipped])
  }
  if (!visible) {
    cards = []
    remaining = 0
  }
  var retainedIdentities = cards.map(function(card) { return card.identity })
  seen = seen.filter(function(identity) {
    return snapshotIdentities.indexOf(identity) >= 0
      || retainedIdentities.indexOf(identity) >= 0
  })
  return {
    cards: cards, seen: seen,
    visible: visible, reading: visible && reading,
    remaining: remaining, deadline: visible && !reading ? now + remaining : 0
  }
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
  if (privacyMode) return "omp · session " + index
  var rawLabel = frame && frame.source && frame.source.label
    ? String(frame.source.label).trim() : ""
  var lowerLabel = rawLabel.toLowerCase()
  var name = ""
  if (lowerLabel !== "" && lowerLabel !== "omp") {
    name = lowerLabel.indexOf("omp · ") === 0
      ? rawLabel.substring(6).trim()
      : (lowerLabel.indexOf("omp - ") === 0
        ? rawLabel.substring(6).trim()
        : (lowerLabel.indexOf("omp ") === 0 ? rawLabel.substring(4).trim() : rawLabel))
  }
  return name === "" ? "omp" : "omp · " + name
}

function frameTitle(frame, ordinal, privacyMode) {
  if (privacyMode) return "Task " + Math.max(1, boundedCount(ordinal))
  return frame ? String(frame.title || "") : ""
}

function frameSummary(frame, privacyMode) {
  if (privacyMode) return "[details hidden]"
  return frame ? String(frame.summary || "") : ""
}

function cardPresentation(frame, ordinal, privacyMode) {
  var meta = frameMeta(frame, ordinal, privacyMode)
  var title = frameTitle(frame, ordinal, privacyMode)
  var summary = frameSummary(frame, privacyMode)
  // The frame has no typed completion discriminator; only normalize this stock pair.
  if (!privacyMode && frame && frame.source && frame.source.kind === "omp"
      && frame.mode === "status" && title === "OMP completed a turn"
      && summary === "OMP stopped after completing the main agent turn.") {
    title = "Response ready to review"
    summary = ""
  }
  return {
    meta: meta.indexOf("omp · ") === 0 ? meta.substring(6) : "OMP session",
    title: title,
    summary: summary
  }
}

function compactPanelPresentation(frame, ordinal, privacyMode) {
  var meta = frameMeta(frame, ordinal, privacyMode)
  var title = frameTitle(frame, ordinal, privacyMode)
  var summary = privacyMode ? "" : frameSummary(frame, false)
  // Normalize only known stock pairs; custom content keeps its original meaning.
  if (!privacyMode && frame && frame.source && frame.source.kind === "omp") {
    if (frame.mode === "status" && title === "OMP completed a turn"
        && summary === "OMP stopped after completing the main agent turn.") {
      title = "Response ready"
      summary = ""
    } else if (frame.mode === "form" && title === "OMP needs your input"
        && summary === "OMP is waiting for an operator response.") {
      title = "Needs your input"
      summary = ""
    }
  }
  return {
    meta: meta.indexOf("omp · ") === 0 ? meta.substring(6) : "OMP session",
    title: title,
    summary: summary
  }
}

function inspectionTargetFor(frame) {
  if (!frame || typeof frame.id !== "string" || frame.id === ""
      || !Number.isInteger(frame.version)) return null
  return { id: frame.id, version: frame.version }
}

function inspectedFrame(frames, target) {
  if (!target) return null
  for (var index = 0; index < frames.length; index++) {
    var frame = frames[index]
    if (frame.id === target.id && frame.version === target.version) return frame
  }
  return null
}

function inspectionText(frame, ordinal, privacyMode) {
  if (!frame) return ""
  var summary = frameSummary(frame, privacyMode)
  return frameMeta(frame, ordinal, privacyMode) + "\n\n"
    + frameTitle(frame, ordinal, privacyMode)
    + (summary === "" ? "" : "\n\n" + summary)
}

function panelInspectionText(frame, ordinal, privacyMode) {
  if (!privacyMode) return inspectionText(frame, ordinal, false)
  if (!frame) return ""
  return frameMeta(frame, ordinal, true) + "\n\n" + frameTitle(frame, ordinal, true)
}

function shortcutFooter(hasSnapshot, hasNavigableFrames, hasAmbientExpansion) {
  if (!hasSnapshot) return ""
  if (hasNavigableFrames && hasAmbientExpansion)
    return "↑↓ select · Enter open · D details · A ambient · Esc"
  if (hasNavigableFrames) return "↑↓ select · Enter open · D details · Esc"
  return hasAmbientExpansion ? "D details · A ambient · Esc" : "D details · Esc"
}

if (typeof module !== "undefined") {
  module.exports = {
    boundedCount: boundedCount,
    panelPrivacyEnabled: panelPrivacyEnabled,
    PEEK_CARD_LIMIT: PEEK_CARD_LIMIT,
    peekUnshownCount: peekUnshownCount,
    peekIdentity: peekIdentity,
    resolvePeekFrame: resolvePeekFrame,
    peekCardAvailability: peekCardAvailability,
    createPeekState: createPeekState,
    transitionPeek: transitionPeek,
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
    cardPresentation: cardPresentation,
    compactPanelPresentation: compactPanelPresentation,
    inspectionTargetFor: inspectionTargetFor,
    inspectedFrame: inspectedFrame,
    inspectionText: inspectionText,
    panelInspectionText: panelInspectionText,
    shortcutFooter: shortcutFooter,
  }
}
