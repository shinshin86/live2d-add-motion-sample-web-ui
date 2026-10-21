// @ts-check
// Fractions of viewport width/height and degrees; never placement state.
export const STAGE_LIMITS = { x: 0.15, y: 0.08, rot: 8 };
export const STAGE_ZERO = { x: 0, y: 0, rot: 0 };
/** Strict validation at the relay boundary; no landmarks or extra fields.
 * @param {unknown} input @returns {{x: number, y: number, rot: number} | null} */
export function stageMessage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = /** @type {Record<string, unknown>} */ (input);
  if (Object.keys(data).length !== 3) return null;
  for (const [key, limit] of Object.entries(STAGE_LIMITS)) {
    if (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || Math.abs(data[key]) > limit) return null;
  }
  return /** @type {{x: number, y: number, rot: number}} */ (input);
}

/** A separate parent transform leaves the model's drag/zoom and storage untouched.
 * Rotate about the user's current anchor, not the viewport's origin.
 * @param {any} app @param {any} model @param {any} container */
export function attachBodyStage(app, model, container) {
  return (/** @type {unknown} */ value) => {
    const stage = stageMessage(value) ?? STAGE_ZERO;
    container.pivot.set(model.x, model.y);
    container.position.set(model.x + stage.x * app.screen.width, model.y + stage.y * app.screen.height);
    container.rotation = stage.rot * Math.PI / 180;
  };
}
