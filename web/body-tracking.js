// @ts-check
// Shoulder/hip geometry only: no arm or model-specific shoulder controls.
import { clamp, smoothParameters, FACE_NEUTRAL } from "./tracking.js";

/** @typedef {{ x: number, y: number, z: number, visibility?: number, presence?: number }} Landmark */
/** @typedef {{ landmarks: Landmark[][], worldLandmarks: Landmark[][] }} BodyResult */
/** @typedef {{ yaw: number, pitch: number, roll: number }} RawBody */
/** @type {Record<string, number>} */
const NEUTRAL = { bodyAngleX: 0, bodyAngleY: 0, bodyAngleZ: 0 };

/** @param {BodyResult} result @param {number} [aspect] @returns {RawBody | null} */
export function readBody(result, aspect = 4 / 3) {
  if (!Number.isFinite(aspect) || aspect <= 0) aspect = 4 / 3;
  const image = result.landmarks[0], world = result.worldLandmarks[0];
  const ids = [11, 12, 23, 24];
  if (!image || !world || !ids.every(i => [image[i], world[i]].every(p => p &&
      [p.x, p.y, p.z].every(Number.isFinite)) && (image[i].visibility ?? 0) >= 0.6 &&
      (image[i].presence === undefined || image[i].presence >= 0.6))) return null;
  const [left, right, hipL, hipR] = ids.map(i => world[i]);
  const width = Math.hypot(left.x - right.x, left.z - right.z);
  const torsoY = (hipL.y + hipR.y - left.y - right.y) / 2;
  if (width < 0.08 || torsoY < 0.1 || Math.abs(image[11].x - image[12].x) < 0.04) return null;
  const degrees = 180 / Math.PI;
  return {
    yaw: Math.atan2(left.z - right.z, Math.abs(left.x - right.x)) * degrees,
    pitch: Math.atan2((hipL.z + hipR.z - left.z - right.z) / 2, torsoY) * degrees,
    roll: Math.atan2(image[11].y - image[12].y, Math.abs(image[11].x - image[12].x) * aspect) * degrees,
  };
}

export class BodyPose {
  /** @type {RawBody | null} */ raw = null;
  /** @type {RawBody | null} */ neutral = null;
  params = { ...NEUTRAL };
  seen = -Infinity;
  weight = 0;
  /** @param {BodyResult} result @param {number} now @param {number} [aspect] */
  update(result, now, aspect) {
    const raw = readBody(result, aspect);
    if (raw) { this.raw = raw; this.seen = now; if (!this.neutral) this.calibrate(now); }
  }
  /** @param {number} now */
  calibrate(now) {
    if (!this.raw || now - this.seen > 500) return false;
    this.neutral = { ...this.raw }; this.params = { ...NEUTRAL }; return true;
  }
  reset() { this.raw = null; this.neutral = null; this.seen = -Infinity; this.weight = 0; this.params = { ...NEUTRAL }; }
  /** @param {number} now @param {number} dt @param {import("./tracking.js").TrackingOptions} options */
  sample(now, dt, options) {
    const tracking = !!this.raw && !!this.neutral && now - this.seen <= 500;
    const target = { ...NEUTRAL };
    if (tracking) {
      const gain = clamp(options.sensitivity, 0.25, 3) * 0.3;
      const mirror = options.mirror ? -1 : 1;
      target.bodyAngleX = clamp((this.raw.yaw - this.neutral.yaw) * gain * mirror, -8, 8);
      target.bodyAngleY = clamp((this.raw.pitch - this.neutral.pitch) * gain, -6, 6);
      target.bodyAngleZ = clamp((this.raw.roll - this.neutral.roll) * gain * mirror, -8, 8);
    }
    this.params = smoothParameters(this.params, target, dt, tracking ? options.smoothing : 0.7);
    this.weight = tracking ? 1 : this.weight * Math.exp(-Math.max(0, dt) / 0.2);
    if (this.weight < 0.005) this.weight = 0;
    return { tracking, params: { ...this.params }, weight: this.weight };
  }
}

/** Keep independent face/body loss fades while using the existing relay format.
 * @param {import("./tracking.js").FaceParams | null} face @param {number} weight
 * @param {{ params: Record<string, number>, weight: number }} body
 */
export function combineBody(face, weight, body) {
  const combined = Math.max(weight, body.weight);
  const params = Object.fromEntries(Object.entries(FACE_NEUTRAL).map(([key, neutral]) =>
    [key, neutral + ((face?.[key] ?? neutral) - neutral) * (combined ? weight / combined : 0)]));
  for (const key of Object.keys(NEUTRAL)) params[key] = body.params[key] * (combined ? body.weight / combined : 0);
  return { params, weight: combined };
}
