# MediaPipe Face Landmarker

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
