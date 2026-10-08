// @ts-check
// Relay between the control page (index.html) and the streaming page
// (stream.html) through tools/serve.py. Only parameters and motion commands are
// sent; camera frames and microphone audio never leave the control page.
//
// Messages:
//   { type: "pose", face: FaceParams | null, weight: 0..1, mouth: 0..1 | null }
//   { type: "motion", group: string, index: number }
//   { type: "stop" }

import { FACE_NEUTRAL } from "./tracking.js";

/** @typedef {import("./tracking.js").FaceParams} FaceParams */
/**
 * @typedef {{ type: "pose", face: FaceParams | null, weight: number, mouth: number | null }} PoseMessage
 * @typedef {PoseMessage | { type: "motion", group: string, index: number } | { type: "stop" }} RelayMessage
 */

/** True when the page is served by tools/serve.py (python3 -m http.server has no relay). */
export async function relayAvailable() {
  try {
    const res = await fetch("live/status", { cache: "no-store" });
    return res.ok && (await res.json()).relay === true;
  } catch {
    return false;
  }
}

let sending = false;
let lastError = "";
/** @type {RelayMessage[]} */
const commands = [];

/** Last send result for the control page's connection indicator. */
export function relaySendStatus() { return { sending, error: lastError }; }

/** Send one request at a time. Busy poses are dropped; discrete commands retain order.
 * @param {RelayMessage} message */
export function sendRelay(message) {
  if (sending) {
    if (message.type !== "pose") { commands.push(message); return true; }
    return false;
  }
  sending = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  void fetch("live/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: controller.signal,
  }).then((res) => {
    lastError = res.ok ? "" : `HTTP ${res.status}`;
  }).catch(() => { lastError = "送信できません"; }).finally(() => {
    clearTimeout(timeout);
    sending = false;
    const command = commands.shift();
    if (command) sendRelay(command);
  });
  return true;
}

/** @param {unknown} value @param {number} min @param {number} max */
const finite = (value, min, max) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : null;

/**
 * Validate a relayed message; anything unexpected is dropped.
 * @param {unknown} input
 * @returns {RelayMessage | null}
 */
export function relayMessage(input) {
  if (!input || typeof input !== "object") return null;
  const data = /** @type {Record<string, unknown>} */ (input);
  if (data.type === "stop") return { type: "stop" };
  if (data.type === "motion") {
    const index = finite(data.index, 0, 999);
    if (typeof data.group !== "string" || !/^[\w-]{0,64}$/.test(data.group) || index === null) return null;
    return { type: "motion", group: data.group, index: Math.round(index) };
  }
  if (data.type === "pose") {
    /** @type {FaceParams | null} */
    let face = null;
    if (data.face && typeof data.face === "object") {
      face = {};
      for (const key of Object.keys(FACE_NEUTRAL)) {
        const value = finite(/** @type {Record<string, unknown>} */ (data.face)[key], -30, 30);
        if (value === null) return null;
        face[key] = value;
      }
    }
    return { type: "pose", face, weight: finite(data.weight, 0, 1) ?? 0, mouth: finite(data.mouth, 0, 1) };
  }
  return null;
}

/**
 * @param {(message: RelayMessage) => void} onMessage
 * @returns {EventSource}
 */
export function receiveRelay(onMessage) {
  const events = new EventSource("live/events");
  events.onmessage = (event) => {
    try {
      const message = relayMessage(JSON.parse(event.data));
      if (message) onMessage(message);
    } catch {
      // ignore malformed messages
    }
  };
  return events;
}
