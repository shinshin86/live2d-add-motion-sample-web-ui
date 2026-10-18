// @ts-check
// Classic worker; pinned to the same telemetry-free runtime as face tracking.
const scope = /** @type {any} */ (self);
const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MODEL = new URL("../vendor/mediapipe/pose_landmarker_lite.task", scope.location.href).href;
let tracker;
let nextFrame = 0;
scope.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      const response = await fetch(`${MEDIAPIPE}/vision_bundle.cjs`);
      if (!response.ok) throw new Error("runtime unavailable");
      const url = URL.createObjectURL(new Blob([await response.text()], { type: "text/javascript" }));
      scope.exports = {};
      try { scope.importScripts(url); } finally { URL.revokeObjectURL(url); }
      const files = await scope.exports.FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
      tracker = await scope.exports.PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "VIDEO",
        numPoses: 1, outputSegmentationMasks: false,
        minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      });
      scope.postMessage({ type: "ready" });
      scope.setInterval(() => scope.postMessage({ type: "tick" }), 100);
    } catch { scope.postMessage({ type: "error" }); }
  } else if (data.type === "frame") {
    try {
      const now = performance.now();
      if (tracker && now >= nextFrame) {
        const result = tracker.detectForVideo(data.frame, now);
        const elapsed = performance.now() - now;
        nextFrame = performance.now() + Math.max(100, elapsed * 2);
        scope.postMessage({ type: "result", elapsed, result: { landmarks: result.landmarks, worldLandmarks: result.worldLandmarks } });
      }
    } catch { scope.postMessage({ type: "error" }); }
    finally { data.frame.close(); scope.postMessage({ type: "consumed" }); }
  }
};
