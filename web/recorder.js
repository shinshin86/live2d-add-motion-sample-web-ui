// @ts-check
// Records a camera performance as a motion source. It stores what the face
// contributes to each Live2D parameter (web/live2d-face.js faceToLive2D), not
// the rendered values, so whatever motion was playing is not baked in.
// tools/gen_motions.py turns the saved file into a .motion3.json (keyframe
// reduction, safe ranges, easing in/out of the base pose or closing the loop).
//
// File format (version 1):
//   { version: 1, id, label, loop, fps: 30, duration,
//     params: { ParamAngleX: { mode: "add" | "multiply" | "replace", values: [...] }, ... } }

import { faceToLive2D } from "./live2d-face.js";

/** @typedef {import("./tracking.js").FaceParams} FaceParams */
/**
 * @typedef {{ mode: string, values: number[] }} RecordedParam
 * @typedef {{ version: 1, id: string, label: string, loop: boolean, fps: number, duration: number,
 *   params: Record<string, RecordedParam> }} Recording
 */

export const MAX_SECONDS = 60;
const FPS = 30;

export class FaceRecorder {
  /** @type {{ t: number, values: Record<string, number> }[]} */
  samples = [];
  /** @type {Record<string, string>} */
  modes = {};
  started = 0;
  recording = false;

  /** @param {number} now ms */
  start(now) {
    this.samples = [];
    this.modes = {};
    this.started = now;
    this.recording = true;
  }

  /** Seconds recorded so far. @param {number} now ms */
  elapsed(now) {
    return this.recording ? (now - this.started) / 1000 : 0;
  }

  /**
   * Add one frame. Returns false once the time limit is reached.
   * @param {number} now ms @param {FaceParams} face
   */
  sample(now, face) {
    if (!this.recording) return false;
    const t = (now - this.started) / 1000;
    if (t > MAX_SECONDS) return false;
    /** @type {Record<string, number>} */
    const values = {};
    for (const { id, mode, value } of faceToLive2D(face)) {
      values[id] = value;
      this.modes[id] = mode;
    }
    this.samples.push({ t, values });
    return true;
  }

  /**
   * Stop and resample to 30 fps (frames arrive at the display rate).
   * @param {{ id: string, label: string, loop: boolean }} meta
   * @returns {Recording | null} null when too short
   */
  stop(meta) {
    this.recording = false;
    const samples = this.samples;
    if (samples.length < 2 || samples[samples.length - 1].t < 1) return null;
    const duration = Math.floor(samples[samples.length - 1].t * FPS) / FPS;
    /** @type {Record<string, RecordedParam>} */
    const params = {};
    for (const [id, mode] of Object.entries(this.modes)) params[id] = { mode, values: [] };
    let k = 0;
    for (let frame = 0; frame <= Math.round(duration * FPS); frame++) {
      const t = frame / FPS;
      while (k < samples.length - 2 && samples[k + 1].t < t) k++;
      const a = samples[k];
      const b = samples[k + 1];
      const u = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
      for (const id of Object.keys(params)) {
        const value = a.values[id] + (b.values[id] - a.values[id]) * u;
        params[id].values.push(Math.round(value * 1000) / 1000);
      }
    }
    return { version: 1, ...meta, fps: FPS, duration, params };
  }
}

/** Default motion name for a recording: rec_YYYYMMDD_HHMMSS (local time); the user can rename it. */
export function recordingId(date = new Date()) {
  /** @param {number} n */
  const p = (n) => String(n).padStart(2, "0");
  return `rec_${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/**
 * Save through tools/serve.py into motion-defs/recordings/<model>/<id>.json,
 * or download the file when the page is served without it.
 * @param {Recording} recording @param {string} model the model3.json stem
 * @param {boolean} server tools/serve.py is available
 * @returns {Promise<string>} where it went
 */
export async function saveRecording(recording, model, server) {
  const body = JSON.stringify({ model, recording });
  if (server) {
    const res = await fetch("recordings", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (!res.ok) throw new Error(`保存できませんでした (HTTP ${res.status})`);
    return (await res.json()).path;
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(recording)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${recording.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return `ダウンロード: ${recording.id}.json (motion-defs/recordings/${model}/ に置いてください)`;
}
