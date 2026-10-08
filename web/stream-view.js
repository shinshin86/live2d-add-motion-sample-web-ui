// @ts-check
// Placement belongs to the streaming page, separately for each model.
const MIN_SCALE = 0.05, MAX_SCALE = 5;
const clampScale = (/** @type {number} */ value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/**
 * @param {any} app Pixi application @param {any} model Live2D model
 * @param {string} modelPath @param {URLSearchParams} params
 */
export function attachStreamView(app, model, modelPath, params) {
  const key = `live2d-stream-view:${new URL(modelPath, location.href).href}`;
  const initial = { x: 0.5, y: 0.55, zoom: 1 };
  /** @type {Partial<{ x: number, y: number, zoom: number }>} */
  const overrides = {};
  for (const name of /** @type {const} */ (["x", "y", "zoom"])) {
    const raw = params.get(name);
    if (raw === null || raw.trim() === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value) && (name === "zoom" ? value > 0 : value >= 0 && value <= 1)) overrides[name] = value;
  }
  Object.assign(initial, overrides);
  const view = { ...initial };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved && typeof saved === "object") {
      for (const name of /** @type {const} */ (["x", "y", "zoom"])) {
        if (typeof saved[name] === "number" && Number.isFinite(saved[name]) && (name !== "zoom" || saved[name] > 0)) view[name] = saved[name];
      }
    }
  } catch { /* Storage can be unavailable in a browser source. */ }
  Object.assign(view, overrides);

  const baseScale = () => Math.min(app.screen.width / model.internalModel.width,
    app.screen.height / model.internalModel.height) * 1.1;
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(view)); } catch { /* Placement still works. */ }
  };
  const layout = () => {
    model.anchor.set(0.5, 0.5);
    model.scale.set(clampScale(baseScale() * view.zoom));
    model.position.set(view.x * app.screen.width, view.y * app.screen.height);
  };
  const remember = () => {
    if (app.screen.width <= 0 || app.screen.height <= 0) return;
    view.x = model.x / app.screen.width;
    view.y = model.y / app.screen.height;
    view.zoom = model.scale.x / baseScale();
    save();
  };
  layout();
  app.renderer.on("resize", layout);

  model.interactive = true;
  model.buttonMode = true;
  /** @type {{ dx: number, dy: number } | null} */
  let drag = null;
  model.on("pointerdown", (/** @type {any} */ e) => {
    drag = { dx: e.data.global.x - model.x, dy: e.data.global.y - model.y };
  });
  model.on("pointermove", (/** @type {any} */ e) => {
    if (!drag) return;
    model.position.set(e.data.global.x - drag.dx, e.data.global.y - drag.dy);
    remember();
  });
  model.on("pointerup", () => { drag = null; });
  model.on("pointerupoutside", () => { drag = null; });
  const canvas = /** @type {HTMLCanvasElement} */ (app.view);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * app.screen.width / rect.width;
    const my = (e.clientY - rect.top) * app.screen.height / rect.height;
    const base = model.scale.x;
    const next = clampScale(base * Math.exp(-e.deltaY * 0.002));
    const factor = next / base;
    if (factor === 1) return;
    model.scale.set(next);
    model.position.set(mx + (model.x - mx) * factor, my + (model.y - my) * factor);
    remember();
  }, { passive: false });
  canvas.addEventListener("dblclick", () => {
    drag = null;
    Object.assign(view, initial);
    layout();
    save();
  });
}
