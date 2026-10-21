// @ts-check
// Synthetic shoulder/hip results go through the real geometry/filter/recording path.
import { startBackgroundClock } from "./background-clock.js";
/** @param {number} seconds @param {boolean} [hips] @returns {import("./body-tracking.js").BodyResult} */
export function fakeBody(seconds, hips = true) {
  const yaw = Math.sin(seconds * 1.3) * 0.6, pitch = Math.sin(seconds * 0.8) * 0.45;
  const roll = Math.sin(seconds * 1.1) * 0.35;
  const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1, presence: 1 }));
  for (const [i, x, y] of [[11,.2,-.45],[12,-.2,-.45],[23,.14,0],[24,-.14,0]]) {
    const py = y * Math.cos(pitch), pz = y * Math.sin(pitch);
    const px = x * Math.cos(yaw) + pz * Math.sin(yaw), z = -x * Math.sin(yaw) + pz * Math.cos(yaw);
    world[i] = { x: px * Math.cos(roll) - py * Math.sin(roll), y: px * Math.sin(roll) + py * Math.cos(roll), z, visibility: 1, presence: 1 };
  }
  const image = world.map(p => ({ ...p, x: .5 + p.x * .8, y: .65 + p.y * .8 * 4 / 3 }));
  if (!hips) for (const i of [23, 24]) image[i].visibility = 0.1;
  return { worldLandmarks: [world], landmarks: [image] };
}
/** @param {(result: import("./body-tracking.js").BodyResult, now: number) => void} onResult
 * @param {number | null} [fixed] @param {boolean} [hips] */
export function startFakeBody(onResult, fixed = null, hips = true) {
  const started = performance.now();
  onResult(fakeBody(0, hips), started);
  return startBackgroundClock(now => onResult(fakeBody(fixed ?? (now - started) / 1000, hips), now));
}
