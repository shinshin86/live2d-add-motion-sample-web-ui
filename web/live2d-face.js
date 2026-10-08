// @ts-check
// Drives a Live2D model (pixi-live2d-display) with face parameters from web/tracking.js.
//
// The face is layered on top of whatever motion is playing, so an emotion motion
// (sad brows, a blush) stays visible while the head and mouth follow the camera:
//   add       head/body angles, brows, mouth form, eye smile: motion value + face
//   multiply  eye openness: motion value x face (a real blink also closes sad eyes)
//   replace   gaze and mouth openness come from the face
// Values are clamped to each parameter's range in the model.
//
// Live2D's head rotation axes run the other way from web/tracking.js's face
// parameters: turn, nod, tilt and horizontal gaze are negated here, so the
// avatar moves the same way as the face in the camera preview (look up -> up).

/** @typedef {import("./tracking.js").FaceParams} FaceParams */

/** @type {Record<string, string[]>} */
const ADD = {
  angleX: ["ParamAngleX"], angleY: ["ParamAngleY"], angleZ: ["ParamAngleZ"],
  bodyAngleX: ["ParamBodyAngleX"], bodyAngleZ: ["ParamBodyAngleZ"],
  browY: ["ParamBrowLY", "ParamBrowRY"], mouthForm: ["ParamMouthForm"],
  eyeSmile: ["ParamEyeLSmile", "ParamEyeRSmile"],
};
/** @type {Record<string, string[]>} */
const MULTIPLY = { eyeLOpen: ["ParamEyeLOpen"], eyeROpen: ["ParamEyeROpen"] };
/** @type {Record<string, string[]>} */
const REPLACE = { gazeX: ["ParamEyeBallX"], gazeY: ["ParamEyeBallY"], mouthOpen: ["ParamMouthOpenY"] };

/**
 * @typedef {"add" | "multiply" | "replace"} FaceMode
 * @typedef {{ id: string, mode: FaceMode, value: number }} FaceContribution
 */

/** Face parameters whose sign flips for Live2D. */
const FLIPPED = new Set(["angleX", "angleY", "angleZ", "bodyAngleX", "bodyAngleZ", "gazeX"]);

/**
 * What the face contributes to each Live2D parameter (also what a recording stores).
 * @param {FaceParams} params
 * @returns {FaceContribution[]}
 */
export function faceToLive2D(params) {
  /** @type {FaceContribution[]} */
  const out = [];
  for (const [mode, table] of /** @type {[FaceMode, Record<string, string[]>][]} */ (
    [["add", ADD], ["multiply", MULTIPLY], ["replace", REPLACE]])) {
    for (const [key, ids] of Object.entries(table)) {
      const value = FLIPPED.has(key) ? -params[key] : params[key];
      for (const id of ids) out.push({ id, mode, value });
    }
  }
  return out;
}

/**
 * @param {any} model a pixi-live2d-display Live2DModel (Cubism 4)
 * @returns {{ set: (params: FaceParams | null, weight: number) => void }}
 */
export function attachFaceDriver(model) {
  const internal = model.internalModel;
  const core = internal.coreModel;
  const autoBlink = internal.eyeBlink;
  const focus = internal.updateFocus.bind(internal);
  /** @type {{ params: FaceParams | null, weight: number }} */
  const state = { params: null, weight: 0 };

  /** @param {string} id */
  const index = (id) => core.getParameterIndex(id);
  /** @param {number} i @param {(value: number) => number} change */
  const write = (i, change) => {
    const min = core.getParameterMinimumValue(i);
    const max = core.getParameterMaximumValue(i);
    core.setParameterValueByIndex(i, Math.max(min, Math.min(max, change(core.getParameterValueByIndex(i)))));
  };

  // pixi-live2d-display calls updateFocus after the motion update and parameter
  // save, and before physics: written here, the face moves the hair through
  // physics and is not saved, so the added values do not pile up frame by frame.
  // While a face drives the model, it also replaces the cursor-following focus.
  internal.updateFocus = () => {
    const { params, weight: w } = state;
    if (!params || w <= 0) {
      focus();
      return;
    }
    for (const { id, mode, value } of faceToLive2D(params)) {
      const i = index(id);
      if (i < 0) continue;
      if (mode === "add") write(i, (v) => v + value * w);
      else if (mode === "multiply") write(i, (v) => v * (1 - w + w * value));
      else write(i, (v) => v + (value - v) * w);
    }
  };

  return {
    set(params, weight) {
      state.params = params;
      state.weight = weight;
      // the tracked eyes blink on their own; the automatic blink would fight them
      internal.eyeBlink = params && weight > 0 ? undefined : autoBlink;
    },
  };
}
