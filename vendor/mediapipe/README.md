# MediaPipe landmark models

- Asset: `face_landmarker.task`, Face Landmarker float16, model version 1. The model is unmodified.
- Source: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- Copyright: The MediaPipe Authors. Licensed under the Apache License, Version 2.0;
  see [LICENSE](LICENSE). Distributed without warranties or conditions of any kind.

The camera tracking in the WebUI loads the `@mediapipe/tasks-vision` runtime
(JavaScript and WASM, Apache-2.0) from jsDelivr, pinned to version **0.10.21**, and
this model from this folder. No model is requested from a remote server.

Version 0.10.21 is kept on purpose: later releases add metrics reporting to an
external service. Before upgrading, inspect the JavaScript bundle and the WASM
loading script for telemetry and remote URLs.

Camera frames are processed in a Web Worker in the browser and never leave it.
Only the resulting face parameters (head angles, eye and mouth openness, ...) are
used by the page and, in streaming mode, relayed to `stream.html` through the
local server (`tools/serve.py`).

## Pose Landmarker Lite

- Asset: `pose_landmarker_lite.task`, float16, version 1, unmodified (5,777,746 bytes).
- Source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`
- Copyright: The MediaPipe Authors. Apache License, Version 2.0; see
  [POSE-LICENSE](POSE-LICENSE), copied from the upstream MediaPipe license.
- [Official model guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)
  and [upstream license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).

The optional upper-body feature uses the same **0.10.21** runtime from jsDelivr,
only when enabled. Its model is loaded from this folder. CPU inference runs in
a separate Worker, at most 10 frames/s with one bitmap in flight and additional
backoff for slow inference. The face Worker does not wait for the pose Worker.
Only shoulder/hip angles enter the model, recordings and local relay; images and
raw body landmarks are never sent over the network.

The pinned JavaScript bundle and WASM loading glue were inspected: network
operations load runtime/WASM/model assets, and no telemetry service, event
reporting, beacon or remote POST was found. When checking a runtime update,
also observe requests while running both trackers with a synthetic camera.
This check applies to the pinned version only.
