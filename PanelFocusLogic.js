function navigationFor(frame) {
  if (!frame || !frame.navigation || typeof frame.navigation !== "object"
      || Array.isArray(frame.navigation)) return null
  var keys = Object.keys(frame.navigation)
  if (keys.length !== 2 || keys.indexOf("kind") === -1
      || keys.indexOf("handle") === -1) return null
  if (frame.navigation.kind !== "opaque-focus"
      || typeof frame.navigation.handle !== "string"
      || !/^[A-Za-z0-9_-]{32}$/.test(frame.navigation.handle)) return null
  return frame.navigation
}

function frameIdentity(frame) {
  return frame && typeof frame.id === "string" && frame.id.length > 0
    ? frame.id : ""
}

function interactionIdentity(frame) {
  return frame && typeof frame.interactionId === "string"
    && frame.interactionId.length > 0 ? frame.interactionId : ""
}

function isNavigableFrame(frame, failedHandle) {
  var navigation = navigationFor(frame)
  return navigation !== null && navigation.handle !== String(failedHandle || "")
}

function canStartFocus(frame, failedHandle, pendingRequestId, queuedHandle) {
  return isNavigableFrame(frame, failedHandle)
    && String(pendingRequestId || "") === ""
    && String(queuedHandle || "") === ""
}

function pendingSelectionFor(frame) {
  var frameId = frameIdentity(frame)
  var interactionId = interactionIdentity(frame)
  return navigationFor(frame) !== null || frameId === "" || interactionId === ""
    ? null : { frameId: frameId, interactionId: interactionId }
}

function canWaitForNavigation(frame, pendingRequestId, queuedHandle) {
  return pendingSelectionFor(frame) !== null
    && String(pendingRequestId || "") === ""
    && String(queuedHandle || "") === ""
}

function canActivatePeekSession(
    frame, failedHandle, pendingRequestId, queuedHandle) {
  return canStartFocus(frame, failedHandle, pendingRequestId, queuedHandle)
    || canWaitForNavigation(frame, pendingRequestId, queuedHandle)
}

function matchesInteraction(frame, frameId, interactionId) {
  return String(frameId || "") !== ""
    && String(interactionId || "") !== ""
    && frameIdentity(frame) === frameId
    && interactionIdentity(frame) === interactionId
}

function navigableFrames(nowFrame, nextFrames, failedHandle) {
  var frames = []
  if (isNavigableFrame(nowFrame, failedHandle)) frames.push(nowFrame)
  var next = Array.isArray(nextFrames) ? nextFrames : []
  for (var index = 0; index < next.length; index++)
    if (isNavigableFrame(next[index], failedHandle)) frames.push(next[index])
  return frames
}

function findFrame(frames, frameId, handle) {
  if (!Array.isArray(frames) || frameId === "" || handle === "") return null
  for (var index = 0; index < frames.length; index++) {
    var navigation = navigationFor(frames[index])
    if (frameIdentity(frames[index]) === frameId && navigation !== null
        && navigation.handle === handle) return frames[index]
  }
  return null
}

function selectionFor(frame) {
  var navigation = navigationFor(frame)
  var frameId = frameIdentity(frame)
  return navigation === null || frameId === ""
    ? null : { frameId: frameId, handle: navigation.handle }
}

function selectionIndex(frames, frameId, handle) {
  if (!Array.isArray(frames)) return -1
  for (var index = 0; index < frames.length; index++) {
    var navigation = navigationFor(frames[index])
    if (frameIdentity(frames[index]) === frameId && navigation !== null
        && navigation.handle === handle) return index
  }
  return -1
}

function moveSelection(frames, frameId, handle, direction) {
  if (!Array.isArray(frames) || frames.length === 0) return null
  var current = selectionIndex(frames, frameId, handle)
  var next = current < 0
    ? (direction < 0 ? frames.length - 1 : 0)
    : Math.max(0, Math.min(frames.length - 1, current + direction))
  return selectionFor(frames[next])
}

if (typeof module !== "undefined") {
  module.exports = {
    navigationFor: navigationFor,
    frameIdentity: frameIdentity,
    interactionIdentity: interactionIdentity,
    isNavigableFrame: isNavigableFrame,
    canStartFocus: canStartFocus,
    pendingSelectionFor: pendingSelectionFor,
    canWaitForNavigation: canWaitForNavigation,
    canActivatePeekSession: canActivatePeekSession,
    matchesInteraction: matchesInteraction,
    navigableFrames: navigableFrames,
    findFrame: findFrame,
    selectionFor: selectionFor,
    selectionIndex: selectionIndex,
    moveSelection: moveSelection
  }
}
