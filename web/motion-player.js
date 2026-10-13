// @ts-check
// Motion playback with loop support (reference implementation for apps; the
// Live2D / Cubism libraries are not modified).
//
// The Cubism Framework does not read Meta.Loop, so the player enables looping on
// the motion instance itself, before it starts:
//   setIsLoop(true)        wrap time back to 0 at Duration (never finishes)
//   setIsLoopFadeIn(false) no fade-in restart per cycle (it would stall the
//                          motion at every seam)
// Only the generated Action group is looped: Editor-exported motions often carry
// Meta.Loop=true without actually being seamless.

export const LOOP_GROUP = "Action";

// After a stop or a switch, parameters ease back to their defaults for this long
// (time constant SETTLE_TAU) — see createMotionPlayer.
const SETTLE_SECONDS = 1;
const SETTLE_TAU = 0.15;

/**
 * @param {any} model a pixi-live2d-display Live2DModel
 */
export function createMotionPlayer(model) {
  const settings = model.internalModel.settings;
  const manager = model.internalModel.motionManager;
  /** @type {Record<string, boolean>} */
  const metaLoop = {};

  // Cubism keeps each parameter at its last value until a motion writes it again.
  // Parameters that the idle (or the next motion) does not animate would stay
  // frozen where a stopped motion left them, e.g. a surprised mouth. After a stop
  // or a switch, ease every parameter towards its default *before* the motions
  // are applied: animated ones are still set by their motions, the rest return
  // to rest.
  // The remaining time counts rendered frames, not the clock, so a throttled
  // page still finishes easing once it renders again.
  const core = model.internalModel.coreModel;
  let settleLeft = 0;
  let lastUpdate = performance.now();
  model.internalModel.on("beforeMotionUpdate", () => {
    const now = performance.now();
    const dt = Math.min((now - lastUpdate) / 1000, 0.1);
    lastUpdate = now;
    if (settleLeft <= 0) return;
    settleLeft -= dt;
    const k = 1 - Math.exp(-dt / SETTLE_TAU);
    for (let i = 0; i < core.getParameterCount(); i++) {
      const value = core.getParameterValueByIndex(i);
      core.setParameterValueByIndex(i, value + (core.getParameterDefaultValue(i) - value) * k);
    }
  });
  function settle() {
    settleLeft = SETTLE_SECONDS;
  }

  /** @param {string} group @param {number} index */
  async function isLoopMotion(group, index) {
    const key = `${group}:${index}`;
    if (!(key in metaLoop)) {
      const entry = settings.motions[group]?.[index];
      let loop = false;
      if (entry && group === LOOP_GROUP) {
        const res = await fetch(settings.resolveURL(entry.File));
        loop = !!(await res.json()).Meta.Loop;
      }
      metaLoop[key] = loop;
    }
    return metaLoop[key];
  }

  /**
   * @param {string} group @param {number} index
   * @returns {Promise<{ ok: boolean, loop: boolean, motion: any }>}
   */
  async function play(group, index) {
    const loop = await isLoopMotion(group, index);
    const motion = await manager.loadMotion(group, index); // the cached instance pixi will play
    if (motion) {
      motion.setIsLoop(loop);
      motion.setIsLoopFadeIn(false);
    }
    const PIXI = /** @type {any} */ (globalThis).PIXI;
    const ok = await model.motion(group, index, PIXI.live2d.MotionPriority.FORCE);
    if (ok) settle();
    return { ok, loop, motion };
  }

  /** Stop now: the pose eases back to rest and the idle (if any) fades in. */
  function stop() {
    manager.stopAllMotions();
    settle();
  }

  return { isLoopMotion, play, stop, manager };
}
