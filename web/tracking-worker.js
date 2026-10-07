// Face tracking worker. Camera frames stay in this worker: only the face pose
// (blendshape scores and the head transform) and timing go back to the page.
//
// @mediapipe/tasks-vision is pinned to 0.10.21 because later releases add
// metrics reporting to an external service (see vendor/mediapipe/README.md).
// A classic worker is required: the runtime loads its WASM glue with importScripts.
const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MODEL = new URL("../vendor/mediapipe/face_landmarker.task", self.location.href).href;

// jsDelivr serves .cjs files as application/node, which importScripts refuses,
// so fetch the bundle and load it from a blob URL with a JavaScript type.
async function loadMediaPipe() {
  const res = await fetch(`${MEDIAPIPE}/vision_bundle.cjs`);
  if (!res.ok) throw new Error(`MediaPipe: HTTP ${res.status}`);
  const url = URL.createObjectURL(new Blob([await res.text()], { type: "text/javascript" }));
  self.exports = {};
  try {
    self.importScripts(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  return self.exports;
}

let tracker;
let lastFrame = -Infinity;
let delegate = "GPU";
let frames = 0;
let gpuSamples = 0;
let gpuMs = 0;

self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      const { FaceLandmarker, FilesetResolver } = await loadMediaPipe();
      const files = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
      const options = {
        runningMode: "VIDEO", numFaces: 1,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      };
      try {
        tracker = await FaceLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: MODEL, delegate } });
      } catch {
        delegate = "CPU";
        tracker = await FaceLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: MODEL, delegate } });
      }
      self.postMessage({ type: "ready", delegate });
      // Also wakes the ImageBitmap fallback when video frame callbacks stop in a hidden tab
      self.setInterval(() => self.postMessage({ type: "tick" }), 1000 / 30);
    } catch {
      self.postMessage({ type: "error" });
    }
  } else if (data.type === "frame") {
    try {
      const now = performance.now();
      if (tracker && data.timestamp - lastFrame >= 1000 / 30 - 2) {
        lastFrame = data.timestamp;
        const start = performance.now();
        const result = tracker.detectForVideo(data.frame, now);
        const elapsed = performance.now() - start;
        self.postMessage({ type: "result", elapsed, result: {
          faceLandmarks: result.faceLandmarks.length ? [[]] : [],
          faceBlendshapes: result.faceBlendshapes,
          facialTransformationMatrixes: result.facialTransformationMatrixes,
        } });
        // Some worker GPU backends initialize but run too slowly. Ignore warm-up,
        // then switch to CPU if inference alone cannot keep 15 fps.
        if (delegate === "GPU" && ++frames > 5) {
          gpuMs += elapsed;
          if (++gpuSamples === 8) {
            if (gpuMs / gpuSamples > 1000 / 15) {
              await tracker.setOptions({ baseOptions: { delegate: "CPU" } });
              delegate = "CPU";
              self.postMessage({ type: "delegate", delegate });
            }
            gpuMs = 0;
            gpuSamples = 0;
          }
        }
      }
    } catch {
      self.postMessage({ type: "error" });
    } finally {
      data.frame.close();
      self.postMessage({ type: "consumed" });
    }
  }
};
