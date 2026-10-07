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

/**
 * @param {any} model a pixi-live2d-display Live2DModel
 */
export function createMotionPlayer(model) {
  const settings = model.internalModel.settings;
  const manager = model.internalModel.motionManager;
  /** @type {Record<string, boolean>} */
  const metaLoop = {};

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
    return { ok, loop, motion };
  }

  /** Stop now: the idle fades in from the current pose. */
  function stop() {
    manager.stopAllMotions();
  }

  return { isLoopMotion, play, stop, manager };
}
