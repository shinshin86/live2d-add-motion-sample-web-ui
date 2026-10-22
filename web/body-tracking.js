// @ts-check
// Shoulder/hip geometry only: no arm or model-specific shoulder controls.
import { clamp, FACE_NEUTRAL } from "./tracking.js";
import { OneEuro, bodyTimeConstant } from "./body-filter.js";

/** @typedef {{ x: number, y: number, z: number, visibility?: number, presence?: number }} Landmark */
/** @typedef {{ landmarks: Landmark[][], worldLandmarks: Landmark[][] }} BodyResult */
/** @typedef {{ yaw: number, pitch: number | null, roll: number }} RawBody */
/** @type {Record<string, {id: string, sign: number, axis: "yaw" | "pitch" | "roll", gain: number}>} */
export const BODY_AXES = {
  bodyAngleX: { id: "ParamBodyAngleX", sign: 1, axis: "yaw", gain: 0.7 },
  bodyAngleY: { id: "ParamBodyAngleY", sign: -1, axis: "pitch", gain: 0.65 },
  bodyAngleZ: { id: "ParamBodyAngleZ", sign: -1, axis: "roll", gain: 1.15 },
};
/** Offsets in Live2D coordinates. Observed bounds override these standard-ID fallbacks.
 * @type {Record<string, number[]>} */
export const BODY_LIMITS = { bodyAngleX: [-10, 10], bodyAngleY: [-10, 10], bodyAngleZ: [-10, 10] };
/** @type {Record<string, number>} */
const NEUTRAL = { bodyAngleX: 0, bodyAngleY: 0, bodyAngleZ: 0 };

/** @param {BodyResult} result @param {number} [aspect] */
function inspectBody(result, aspect = 4 / 3) {
  if (!Number.isFinite(aspect) || aspect <= 0) aspect = 4 / 3;
  const image = result.landmarks[0], world = result.worldLandmarks[0];
  const visibility = [11, 12, 23, 24].map(id => {
    const p = image?.[id];
    const value = Number.isFinite(p?.visibility) ? p.visibility : 0;
    return { id, value, weak: value < 0.6 || (p?.presence !== undefined && !(p.presence >= 0.6)) };
  });
  /** @param {number} i */
  const valid = (i) => !visibility.find(p => p.id === i).weak && [image?.[i], world?.[i]].every(p =>
    p && [p.x, p.y, p.z].every(Number.isFinite));
  /** @type {{raw: RawBody | null, mode: string, reason: string, visibility: typeof visibility}} */
  const report = { raw: null, mode: "missing", reason: "肩の信頼度・座標を確認", visibility };
  if (!valid(11) || !valid(12)) return report;
  const [left, right] = [world[11], world[12]];
  const width = Math.hypot(left.x - right.x, left.z - right.z);
  const imageWidth = Math.abs(image[11].x - image[12].x);
  if (width < 0.08 || imageWidth < 0.04) return { ...report, reason: "肩の幅が不足" };
  const degrees = 180 / Math.PI;
  const raw = {
    yaw: Math.atan2(left.z - right.z, Math.abs(left.x - right.x)) * degrees,
    pitch: /** @type {number | null} */ (null),
    roll: Math.atan2(image[11].y - image[12].y, imageWidth * aspect) * degrees,
  };
  let mode = "shoulders", reason = "腰が見えないため肩だけ使用";
  if (valid(23) && valid(24)) {
    const [hipL, hipR] = [world[23], world[24]];
    const torsoY = (hipL.y + hipR.y - left.y - right.y) / 2;
    if (torsoY >= 0.1) {
      raw.pitch = Math.atan2((hipL.z + hipR.z - left.z - right.z) / 2, torsoY) * degrees;
      mode = "torso"; reason = "検出中";
    } else reason = "胴の長さが不足したため肩だけ使用";
  }
  return { raw, mode, reason, visibility };
}

/** @param {BodyResult} result @param {number} [aspect] @returns {RawBody | null} */
export function readBody(result, aspect) { return inspectBody(result, aspect).raw; }

/** Clamp in Live2D coordinates; pitch and roll change sign in faceToLive2D.
 * @param {string} key @param {number} value @param {Record<string, number[]>} limits */
function limitBody(key, value, limits) {
  const { sign } = BODY_AXES[key];
  return sign * clamp(sign * value, .../** @type {[number, number]} */ (limits[key]));
}

export class BodyPose {
  /** @type {RawBody | null} */ raw = null;
  /** @type {RawBody | null} */ neutral = null;
  /** @type {RawBody | null} */ filtered = null;
  filters = { yaw: new OneEuro(), pitch: new OneEuro(), roll: new OneEuro() };
  interval = 100;
  params = { ...NEUTRAL };
  seen = -Infinity;
  weight = 0;
  detection = inspectBody({ landmarks: [], worldLandmarks: [] });
  /** @param {Record<string, number[]>} [limits] */
  constructor(limits = BODY_LIMITS) { this.limits = limits; }
  /** @param {BodyResult} result @param {number} now @param {number} [aspect] */
  update(result, now, aspect) {
    this.detection = inspectBody(result, aspect);
    const raw = this.detection.raw;
    if (raw && Number.isFinite(now) && now > this.seen) {
      const gap = now - this.seen;
      if (gap > 500) {
        this.neutral = null; this.filtered = null; this.interval = 100;
        for (const filter of Object.values(this.filters)) filter.reset();
      } else this.interval += 0.25 * (clamp(gap, 16, 500) - this.interval);
      this.raw = raw; this.seen = now;
      if (!this.neutral) this.calibrate(now);
      else {
        // Hips calibrate independently each time they return; never reuse a stale pitch.
        if (raw.pitch === null) {
          this.neutral.pitch = null; this.filters.pitch.reset();
        } else if (this.neutral.pitch === null) {
          this.neutral.pitch = raw.pitch; this.filters.pitch.reset();
        }
        this.filtered = {
          yaw: this.filters.yaw.update(raw.yaw, now),
          pitch: raw.pitch === null ? null : this.filters.pitch.update(raw.pitch, now),
          roll: this.filters.roll.update(raw.roll, now),
        };
      }
    }
  }
  /** @param {number} now */
  calibrate(now) {
    if (!this.raw || now - this.seen > 500) return false;
    this.neutral = { ...this.raw }; this.params = { ...NEUTRAL };
    for (const [axis, filter] of Object.entries(this.filters)) {
      filter.reset();
      if (this.raw[axis] !== null) filter.update(this.raw[axis], this.seen);
    }
    this.filtered = { ...this.raw };
    return true;
  }
  reset() {
    this.raw = null; this.filtered = null; this.neutral = null;
    this.seen = -Infinity; this.interval = 100; this.weight = 0; this.params = { ...NEUTRAL };
    for (const filter of Object.values(this.filters)) filter.reset();
    this.detection = inspectBody({ landmarks: [], worldLandmarks: [] });
  }
  delta() {
    if (!this.filtered || !this.neutral) return null;
    return { yaw: this.filtered.yaw - this.neutral.yaw, roll: this.filtered.roll - this.neutral.roll,
      pitch: this.filtered.pitch !== null && this.neutral.pitch !== null ? this.filtered.pitch - this.neutral.pitch : null };
  }
  /** @param {number} now */
  diagnostics(now) {
    return { ...this.detection, filtered: this.filtered, interval: this.interval, delta: this.detection.raw ? this.delta() : null, age: now - this.seen,
      weakest: this.detection.visibility.reduce((a, b) => a.value <= b.value ? a : b) };
  }
  /** @param {number} now @param {number} dt @param {import("./tracking.js").TrackingOptions} options */
  sample(now, dt, options) {
    const tracking = !!this.raw && !!this.neutral && now - this.seen <= 500;
    const target = { ...NEUTRAL };
    const delta = this.delta();
    if (tracking && delta) {
      const gain = clamp(options.sensitivity, 0.25, 3);
      const mirror = options.mirror ? -1 : 1;
      for (const [key, axis] of Object.entries(BODY_AXES)) {
        target[key] = limitBody(key, (delta[axis.axis] ?? 0) * axis.gain * gain * (key === "bodyAngleY" ? 1 : mirror), this.limits);
      }
    }
    const tau = tracking ? bodyTimeConstant(options.smoothing, this.interval) : 0.2;
    const alpha = 1 - Math.exp(-Math.max(0, dt) / tau);
    for (const key of Object.keys(target)) this.params[key] += alpha * (target[key] - this.params[key]);
    if (!tracking) {
      this.filtered = null; this.neutral = null;
      for (const filter of Object.values(this.filters)) filter.reset();
    }
    this.weight = tracking ? 1 : this.weight * Math.exp(-Math.max(0, dt) / 0.2);
    if (this.weight < 0.005) this.weight = 0;
    return { tracking, params: { ...this.params }, weight: this.weight };
  }
}

/** Sum independently weighted face sway and body deltas, then clamp the effective
 * contribution before encoding it with the existing single relay weight.
 * @param {import("./tracking.js").FaceParams | null} face @param {number} weight
 * @param {{ params: Record<string, number>, weight: number }} body
 * @param {Record<string, number[]>} [limits]
 */
export function combineBody(face, weight, body, limits = BODY_LIMITS) {
  const combined = Math.max(weight, body.weight);
  const params = Object.fromEntries(Object.entries(FACE_NEUTRAL).map(([key, neutral]) =>
    [key, neutral + ((face?.[key] ?? neutral) - neutral) * (combined ? weight / combined : 0)]));
  for (const key of Object.keys(NEUTRAL)) {
    const effective = (face?.[key] ?? 0) * weight + body.params[key] * body.weight;
    params[key] = combined ? clamp(limitBody(key, effective, limits) / combined, -30, 30) : 0;
  }
  return { params, weight: combined };
}
