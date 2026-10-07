// @ts-check
// Face tracking math: MediaPipe Face Landmarker results -> model-independent face
// parameters (head angles in degrees, eye/mouth openness, gaze, ...).
// web/live2d-face.js maps these onto a Live2D model's parameters.

/**
 * @typedef {{ categories: { categoryName: string, score: number }[] }} Blendshapes
 * @typedef {{ faceLandmarks: unknown[][], faceBlendshapes: Blendshapes[], facialTransformationMatrixes: { data: number[] }[] }} FaceResult
 * @typedef {{ yaw: number, pitch: number, roll: number, shapes: Record<string, number> }} RawFace
 * @typedef {{ mirror: boolean, sensitivity: number, smoothing: number }} TrackingOptions
 * @typedef {Record<string, number>} FaceParams
 */

/** @param {number} value @param {number} [min] @param {number} [max] */
export const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

/** Face parameters of a relaxed, front-facing face. @type {FaceParams} */
export const FACE_NEUTRAL = {
  angleX: 0, angleY: 0, angleZ: 0, bodyAngleX: 0, bodyAngleZ: 0,
  eyeLOpen: 1, eyeROpen: 1, gazeX: 0, gazeY: 0,
  mouthOpen: 0, mouthForm: 0, browY: 0, eyeSmile: 0,
};

/**
 * Head rotation (degrees) and blendshape scores of the first face, or null.
 * @param {FaceResult} result
 * @returns {RawFace | null}
 */
export function readFace(result) {
  const matrix = result.facialTransformationMatrixes[0]?.data;
  if (!result.faceLandmarks.length || !matrix || matrix.length !== 16 || !matrix.every(Number.isFinite)) return null;
  // MediaPipe matrices are column-major. Remove scale before extracting Y-X-Z rotation.
  const m = [...matrix];
  for (const offset of [0, 4, 8]) {
    const length = Math.hypot(m[offset], m[offset + 1], m[offset + 2]);
    if (length < 1e-6) return null;
    for (let i = 0; i < 3; i++) m[offset + i] /= length;
  }
  const degrees = 180 / Math.PI;
  return {
    yaw: Math.atan2(m[8], m[10]) * degrees,
    pitch: Math.asin(clamp(-m[9], -1, 1)) * degrees,
    roll: Math.atan2(m[1], m[5]) * degrees,
    shapes: Object.fromEntries((result.faceBlendshapes[0]?.categories ?? [])
      .map((shape) => [shape.categoryName, clamp(shape.score)])),
  };
}

/** @param {number} value @param {number} neutral */
const angleDelta = (value, neutral) => ((value - neutral + 540) % 360) - 180;

/**
 * Face parameters relative to the calibrated neutral face.
 * mouthForm: + smile, - pucker/frown. browY: + raised.
 * @param {RawFace} face
 * @param {RawFace | null} neutral
 * @param {TrackingOptions} options
 * @returns {FaceParams}
 */
export function mapFace(face, neutral, options) {
  /** @param {string} key */
  const s = (key) => face.shapes[key] ?? 0;
  /** @param {string} key */
  const n = (key) => neutral?.shapes[key] ?? 0;
  /** @param {string} key */
  const d = (key) => s(key) - n(key);
  /** @param {string} a @param {string} b */
  const mean = (a, b) => (d(a) + d(b)) / 2;
  const mirror = options.mirror ? -1 : 1;
  const gain = clamp(options.sensitivity, 0.25, 2);
  const x = clamp(angleDelta(face.yaw, neutral?.yaw ?? 0) * gain * mirror, -30, 30);
  const y = clamp(angleDelta(face.pitch, neutral?.pitch ?? 0) * gain, -30, 30);
  const z = clamp(angleDelta(face.roll, neutral?.roll ?? 0) * gain * mirror, -30, 30);
  /** @param {string} side */
  const open = (side) => {
    const blink = s(`eyeBlink${side}`);
    return blink >= 0.85 ? 0 : clamp((1 - blink) / Math.max(0.2, 1 - n(`eyeBlink${side}`)), 0, 1.25);
  };
  return {
    angleX: x, angleY: y, angleZ: z, bodyAngleX: x * 0.2, bodyAngleZ: z * 0.2,
    eyeLOpen: open(options.mirror ? "Right" : "Left"),
    eyeROpen: open(options.mirror ? "Left" : "Right"),
    gazeX: clamp((d("eyeLookOutRight") - d("eyeLookInRight") + d("eyeLookInLeft") - d("eyeLookOutLeft")) * mirror, -1, 1),
    gazeY: clamp(mean("eyeLookUpLeft", "eyeLookUpRight") - mean("eyeLookDownLeft", "eyeLookDownRight"), -1, 1),
    mouthOpen: clamp((d("jawOpen") - Math.max(0, d("mouthClose"))) * gain / Math.max(0.2, 1 - n("jawOpen"))),
    mouthForm: clamp((mean("mouthSmileLeft", "mouthSmileRight") + mean("mouthStretchLeft", "mouthStretchRight")
      - d("mouthPucker") - d("mouthFunnel")) * gain, -1, 1),
    browY: clamp((d("browInnerUp") + mean("browOuterUpLeft", "browOuterUpRight") - mean("browDownLeft", "browDownRight")) * gain, -1, 1),
    eyeSmile: clamp((mean("mouthSmileLeft", "mouthSmileRight") + mean("cheekSquintLeft", "cheekSquintRight")) * 0.3),
  };
}

/**
 * Exponential smoothing with a time constant, so it behaves the same at any frame rate.
 * @param {FaceParams} current @param {FaceParams} target @param {number} dt @param {number} smoothing 0..1
 * @returns {FaceParams}
 */
export function smoothParameters(current, target, dt, smoothing) {
  const tau = clamp(smoothing) * 0.25;
  const alpha = tau === 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau);
  return Object.fromEntries(Object.entries(target).map(([key, value]) =>
    [key, (current[key] ?? value) + (value - (current[key] ?? value)) * alpha]));
}

/**
 * The tracked face over time: calibration, smoothing, and a fade back to the
 * neutral face when the face is lost.
 */
export class FacePose {
  /** @type {RawFace | null} */ face = null;
  /** @type {RawFace | null} */ neutral = null;
  seen = -Infinity;
  /** @type {FaceParams} */ params = { ...FACE_NEUTRAL };
  weight = 0;

  /** @param {FaceResult} result @param {number} now */
  update(result, now) {
    const face = readFace(result);
    if (face) {
      this.face = face;
      this.seen = now;
    }
  }

  /** Use the current face as the neutral (front-facing, relaxed) face. @param {number} now */
  calibrate(now) {
    if (!this.face || now - this.seen > 500) return false;
    this.neutral = structuredClone(this.face);
    this.params = { ...FACE_NEUTRAL };
    return true;
  }

  reset() {
    this.face = null;
    this.neutral = null;
    this.seen = -Infinity;
  }

  /**
   * @param {number} now @param {number} dt seconds @param {TrackingOptions} options
   * @returns {{ tracking: boolean, params: FaceParams, weight: number }}
   */
  sample(now, dt, options) {
    const tracking = !!this.face && now - this.seen <= 500;
    const target = tracking && this.face ? mapFace(this.face, this.neutral, options) : FACE_NEUTRAL;
    this.params = smoothParameters(this.params, target, dt, tracking ? options.smoothing : 0.7);
    // a closed eye closes at once, without smoothing, or blinks would never reach 0
    if (tracking) for (const eye of ["eyeLOpen", "eyeROpen"]) if (target[eye] === 0) this.params[eye] = 0;
    this.weight = tracking ? 1 : this.weight * Math.exp(-dt / 0.2);
    if (this.weight < 0.005) this.weight = 0;
    return { tracking, params: { ...this.params }, weight: this.weight };
  }
}
