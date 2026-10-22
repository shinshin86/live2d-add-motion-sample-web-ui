// @ts-check
// Body contributions use observed motion bounds, intersected with the actual rig.
import { BODY_AXES } from "./body-tracking.js";

/** @param {any} model @param {string} modelPath */
export async function loadBodyLimits(model, modelPath) {
  const core = model.internalModel.coreModel;
  /** @type {Record<string, any>} */
  let references = {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const url = new URL(modelPath, location.href);
    if (url.origin === location.origin) {
      const response = await fetch(`live/body-ranges?model=${encodeURIComponent(decodeURIComponent(url.pathname.slice(1)))}`, { signal: controller.signal });
      if (response.ok) references = (await response.json()).ranges || {};
    }
  } catch {
    // Static/older servers retain conservative standard-ID bounds.
  } finally { clearTimeout(timeout); }
  /** @type {Record<string, number[]>} */
  const limits = {};
  /** @type {Record<string, number[]>} */
  const ranges = {};
  const sources = new Set();
  for (const [key, { id }] of Object.entries(BODY_AXES)) {
    const index = core.getParameterIndex(id);
    if (index < 0 || index >= core.getParameterCount() || references[id]?.disabled) {
      limits[key] = [0, 0];
      continue;
    }
    const ref = references[id];
    const valid = ref && [ref.min, ref.max, ref.base].every(Number.isFinite) && ref.min <= ref.base && ref.base <= ref.max;
    const base = valid ? ref.base : core.getParameterDefaultValue(index);
    const lo = Math.max(core.getParameterMinimumValue(index), valid ? ref.min : -10);
    const hi = Math.min(core.getParameterMaximumValue(index), valid ? ref.max : 10);
    // Contributions are offsets from the reference pose, not absolute rig values.
    limits[key] = lo <= base && base <= hi ? [Math.max(-30, lo - base), Math.min(30, hi - base)] : [0, 0];
    if (lo <= base && base <= hi) ranges[id] = [lo, hi];
    sources.add(valid && ref.source === "observed" ? "observed" : "standard");
  }
  const source = sources.has("observed") ? sources.has("standard") ? "参照＋標準範囲" : "参照モーションの範囲" : "標準範囲";
  return { limits, ranges, source };
}
