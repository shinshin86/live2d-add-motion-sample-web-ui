// @ts-check
// Synthetic face results for verification without a camera (&fakeface=1):
// the head turns, nods and tilts, the eyes blink every 3 s, the mouth talks and
// a smile comes and goes. Same shape as the tracking worker's results.

/** @typedef {import("./tracking.js").FaceResult} FaceResult */

/**
 * Column-major 4x4 transform for a head rotated yaw (Y), pitch (X), roll (Z),
 * the order web/tracking.js readFace() expects.
 * @param {number} yaw @param {number} pitch @param {number} roll degrees
 */
function headMatrix(yaw, pitch, roll) {
  const r = Math.PI / 180;
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yaw * r), Math.sin(yaw * r), Math.cos(pitch * r),
    Math.sin(pitch * r), Math.cos(roll * r), Math.sin(roll * r)];
  /** @param {number[][]} a @param {number[][]} b */
  const mul = (a, b) => a.map((row) => b[0].map((_, j) => row.reduce((sum, v, k) => sum + v * b[k][j], 0)));
  const R = mul(mul([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], [[1, 0, 0], [0, cp, -sp], [0, sp, cp]]),
    [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]]);
  const data = new Array(16).fill(0);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) data[col * 4 + row] = R[row][col];
  data[15] = 1;
  return data;
}

/** @param {number} t seconds @returns {FaceResult} */
export function fakeFaceResult(t) {
  const blink = t % 3 < 0.15 ? 1 : 0.05;
  const talk = Math.max(0, Math.sin(t * 9) * 0.6 + Math.sin(t * 3.7) * 0.4);
  const smile = Math.max(0, Math.sin((t / 6) * 2 * Math.PI)) * 0.7;
  const shapes = {
    eyeBlinkLeft: blink, eyeBlinkRight: blink, jawOpen: talk * 0.6,
    mouthSmileLeft: smile, mouthSmileRight: smile, cheekSquintLeft: smile * 0.5, cheekSquintRight: smile * 0.5,
    browInnerUp: Math.max(0, Math.sin((t / 5) * 2 * Math.PI)) * 0.5,
  };
  return {
    faceLandmarks: [[]],
    faceBlendshapes: [{ categories: Object.entries(shapes).map(([categoryName, score]) => ({ categoryName, score })) }],
    facialTransformationMatrixes: [{ data: headMatrix(
      20 * Math.sin((t / 4) * 2 * Math.PI), 10 * Math.sin((t / 3) * 2 * Math.PI), 12 * Math.sin((t / 5) * 2 * Math.PI)) }],
  };
}

/**
 * Feed synthetic results at 30 fps, like the camera would.
 * @param {(result: FaceResult, now: number) => void} onResult
 * @returns {() => void} stop
 */
export function startFakeFace(onResult) {
  const start = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    onResult(fakeFaceResult((now - start) / 1000), now);
  }, 1000 / 30);
  return () => clearInterval(timer);
}
