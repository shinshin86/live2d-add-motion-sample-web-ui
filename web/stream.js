// @ts-check
// Streaming page (stream.html): the avatar alone, driven by the control page
// through the relay. Motions are played here from the same model files; the face
// and mouth arrive as parameters.

import "./verify-hold.js";
import { attachStreamView } from "./stream-view.js";
import { attachFaceDriver } from "./live2d-face.js";
import { createMotionPlayer } from "./motion-player.js";
import { receiveRelay } from "./relay.js";

const PIXI = /** @type {any} */ (globalThis).PIXI;
const params = new URLSearchParams(location.search);
const status = /** @type {HTMLElement} */ (document.getElementById("status"));
status.hidden = !params.get("status");

/** @param {string | null} value */
function backgroundColor(value) {
  if (value === "green") return "#00ff00";
  if (value === "blue") return "#0000ff";
  if (value && /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return `#${value.replace("#", "")}`;
  return "transparent";
}
document.documentElement.style.background = backgroundColor(params.get("bg"));

async function modelJson() {
  const override = params.get("model");
  if (override) return override;
  const res = await fetch("model.config.json");
  if (!res.ok) throw new Error("model.config.json がありません");
  return (await res.json()).model3;
}

async function main() {
  const stage = /** @type {HTMLElement} */ (document.getElementById("stage"));
  const app = new PIXI.Application({
    backgroundAlpha: 0, resizeTo: stage, autoDensity: true,
    resolution: window.devicePixelRatio || 1, preserveDrawingBuffer: true,
  });
  stage.appendChild(app.view);
  const modelPath = await modelJson();
  const model = await PIXI.live2d.Live2DModel.from(modelPath, { autoInteract: false });
  app.stage.addChild(model);
  attachStreamView(app, model, modelPath, params);

  const player = createMotionPlayer(model);
  const face = attachFaceDriver(model);
  /** @type {{ face: import("./tracking.js").FaceParams | null, weight: number, mouth: number | null, received: number }} */
  const pose = { face: null, weight: 0, mouth: null, received: -Infinity };
  let messages = 0;

  receiveRelay((message) => {
    messages++;
    if (message.type === "pose") {
      Object.assign(pose, message, { received: performance.now() });
    } else if (message.type === "motion") {
      void player.play(message.group, message.index);
    } else if (message.type === "stop") {
      player.stop();
    }
  });

  // When the control page goes quiet (closed, camera stopped), ease back to the motion alone
  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    const live = now - pose.received <= 1000;
    if (!live) pose.weight *= Math.exp(-dt / 0.2);
    face.set(pose.face, pose.weight < 0.005 ? 0 : pose.weight);
    if (!status.hidden) {
      status.textContent = `relay: ${live ? "受信中" : "待機中"} messages=${messages} face=${pose.face ? "on" : "off"}`;
    }
  });
  // Mouth from the control page's lip sync, written after physics like the WebUI does
  const lipsyncIds = (model.internalModel.settings.groups || [])
    .find((/** @type {{ Name: string }} */ g) => g.Name === "LipSync")?.Ids || [];
  model.internalModel.on("beforeModelUpdate", () => {
    if (pose.mouth === null || performance.now() - pose.received > 1000) return;
    for (const id of lipsyncIds) model.internalModel.coreModel.setParameterValueById(id, pose.mouth);
  });
}

main().catch((error) => {
  status.hidden = false;
  status.textContent = `エラー: ${error.message}`;
});
