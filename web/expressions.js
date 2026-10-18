// @ts-check
// exp3 expressions are layered after blink/face tracking and before lip sync.
// Cubism saves motion parameters before beforeModelUpdate and reloads them
// afterwards: Add and Multiply therefore never accumulate between frames.

/** @typedef {{ Id: string, Value: number, Blend?: "Add" | "Multiply" | "Overwrite" }} Parameter */
/** @typedef {{ Type: string, Parameters: Parameter[], FadeInTime?: number, FadeOutTime?: number }} Expression */
/** @typedef {{ data: Expression, weight: number, from: number, target: number, start: number, duration: number }} Layer */

/** @param {any} model a pixi-live2d-display Cubism 4 model */
export function attachExpressions(model) {
  const internal = model.internalModel;
  const core = internal.coreModel;
  /** @type {{ Name: string, File: string }[]} */
  const entries = internal.settings.expressions || [];
  /** @type {Map<number, Promise<Expression>>} */
  const cache = new Map();
  /** @type {Map<number, Layer>} */
  const layers = new Map();
  let selected = -1;
  let request = 0;

  /** @param {number} index */
  function load(index) {
    let pending = cache.get(index);
    if (!pending) {
      pending = (async () => {
        const response = await fetch(internal.settings.resolveURL(entries[index].File));
        if (!response.ok) throw new Error(`表情を読み込めません (${response.status})`);
        const data = await response.json();
        if (data.Type !== "Live2D Expression" || !Array.isArray(data.Parameters) ||
            ![data.FadeInTime ?? 1, data.FadeOutTime ?? 1].every(v => Number.isFinite(v) && v >= 0) ||
            !data.Parameters.every((/** @type {Parameter} */ p) => p && typeof p.Id === "string" &&
              Number.isFinite(p.Value) && ["Add", "Multiply", "Overwrite"].includes(p.Blend ?? "Add"))) {
          throw new Error("表情ファイルの形式が正しくありません");
        }
        return data;
      })();
      cache.set(index, pending);
      pending.catch(() => cache.delete(index));
    }
    return pending;
  }

  /** @param {Layer} layer @param {number} now */
  function advance(layer, now) {
    const t = layer.duration > 0 ? Math.min(1, Math.max(0, (now - layer.start) / layer.duration)) : 1;
    const eased = (1 - Math.cos(Math.PI * t)) / 2;
    layer.weight = layer.from + (layer.target - layer.from) * eased;
  }

  /** Selecting -1 clears; selecting while a file loads cancels the older request.
   * @param {number} index
   */
  async function select(index) {
    if (index < -1 || index >= entries.length || !Number.isInteger(index)) return false;
    const version = ++request;
    const data = index >= 0 ? await load(index) : null;
    if (version !== request) return false;
    const now = performance.now() / 1000;
    if (data && !layers.has(index)) {
      layers.set(index, { data, weight: 0, from: 0, target: 0, start: now, duration: 0 });
    }
    for (const [key, layer] of layers) {
      advance(layer, now);
      layer.from = layer.weight;
      layer.target = key === index ? 1 : 0;
      layer.start = now;
      layer.duration = (key === index ? layer.data.FadeInTime : layer.data.FadeOutTime) ?? 1;
    }
    selected = index;
    return true;
  }

  internal.on("beforeModelUpdate", () => {
    const now = performance.now() / 1000;
    for (const [key, layer] of layers) {
      advance(layer, now);
      if (layer.target === 0 && layer.weight <= 0) {
        layers.delete(key);
        continue;
      }
      for (const p of layer.data.Parameters) {
        const i = core.getParameterIndex(p.Id);
        if (i < 0 || i >= core.getParameterCount()) continue;
        const value = core.getParameterValueByIndex(i);
        const w = layer.weight;
        const next = p.Blend === "Multiply" ? value * (1 + (p.Value - 1) * w)
          : p.Blend === "Overwrite" ? value + (p.Value - value) * w : value + p.Value * w;
        core.setParameterValueByIndex(i, Math.max(core.getParameterMinimumValue(i),
          Math.min(core.getParameterMaximumValue(i), next)));
      }
    }
  });

  return { entries, select, get selected() { return selected; } };
}
