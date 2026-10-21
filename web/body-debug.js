// @ts-check
// Opt-in local readout only; no landmarks or diagnostic data enter the relay.
import { BODY_AXES } from "./body-tracking.js";
import { faceToLive2D } from "./live2d-face.js";

/** @param {HTMLInputElement} toggle @param {HTMLElement} output
 * @param {import("./body-tracking.js").BodyPose} pose
 * @param {{ limits: Record<string, number[]>, source: string }} bounds */
export function attachBodyDebug(toggle, output, pose, bounds) {
  let last = -Infinity;
  toggle.onchange = () => { output.hidden = !toggle.checked; last = -Infinity; };
  output.hidden = !toggle.checked;
  /** @param {number | null | undefined} n */
  const value = n => Number.isFinite(n) ? Number(n).toFixed(1) : "—";
  /** @param {import("./tracking.js").FaceParams | null} params @param {number} weight */
  const angles = (params, weight) => {
    const live = Object.fromEntries(params ? faceToLive2D(params).map(p => [p.id, p.value * weight]) : []);
    return Object.values(BODY_AXES).map(({ id }) => value(live[id] ?? 0)).join(" / ");
  };
  /** @param {number} now @param {boolean} enabled @param {string} state
   * @param {import("./tracking.js").FaceParams | null} face @param {number} faceWeight
   * @param {import("./tracking.js").FaceParams | null} combined @param {number} weight */
  return (now, enabled, state, face, faceWeight, combined, weight) => {
    if (!toggle.checked || now - last < 200) return;
    last = now;
    const d = pose.diagnostics(now);
    const confidence = d.visibility.map(p => `${p.id}:${p.value.toFixed(2)}${p.weak ? "!" : ""}`).join(" ");
    const stateText = !enabled ? "OFF" : state === "error" ? "検出エラー" : state === "loading" ? "準備中" :
      d.mode === "torso" ? "肩＋腰" : d.mode === "shoulders" ? "肩のみ（前後傾きなし）" : "未検出";
    /** @param {import("./body-tracking.js").RawBody | null} raw */
    const rotation = raw => [raw?.yaw, raw?.pitch, raw?.roll].map(value).join(" / ");
    output.textContent = `状態: ${stateText} / 前回検出 ${Number.isFinite(d.age) ? Math.round(d.age) + "ms" : "—"}\n` +
      `信頼度 11/12=肩 23/24=腰 (!=0.6未満)\n${confidence}\n` +
      `最低: ${d.weakest ? d.weakest.id + ":" + d.weakest.value.toFixed(2) : "—"} / ${d.reason}\n` +
      `検出間隔: ${d.interval.toFixed(0)}ms / ${(1000 / d.interval).toFixed(1)}fps\n` +
      `角度 yaw/pitch/roll 生: ${rotation(d.raw)}°\nフィルタ後: ${rotation(d.filtered)}°\n正面との差: ${rotation(d.delta)}°\n` +
      `顔由来 XYZ: ${angles(face, faceWeight)}°\n` +
      `送信加算 ParamBodyAngleX/Y/Z:\n${angles(combined, 1)}° (重み ${weight.toFixed(2)})\n重み反映 XYZ: ${angles(combined, weight)}°\n` +
      `${bounds.source} XYZ: ${Object.values(bounds.limits).map(range => range.map(value).join("..")).join(" / ")}°\n` +
      "送信値はモーションに加算。映像・診断値は送信しません。";
  };
}
