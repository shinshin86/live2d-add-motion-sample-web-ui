// @ts-check
// Camera capture: feeds camera frames to the tracking worker and reports the
// face results. Frames are transferred to the worker and never leave the browser.

/** @typedef {import("./tracking.js").FaceResult} FaceResult */
/**
 * @typedef {"stopped" | "starting" | "running" | "cameraBlocked" | "cameraUnavailable" | "modelError"} CameraState
 * @typedef {new (options: { track: MediaStreamTrack, maxBufferSize: number }) => { readable: ReadableStream<VideoFrame> }} TrackProcessor
 */

export class CameraCapture {
  generation = 0;
  /** @type {MediaStream | undefined} */ stream;
  /** @type {Worker | undefined} */ worker;
  /** @type {ReadableStreamDefaultReader<VideoFrame> | undefined} */ reader;
  /** @type {VideoFrame | undefined} */ pendingFrame;
  videoCallback = 0;
  busy = false;
  lastVideo = -1;
  lastCallback = -Infinity;
  timing = { frames: 0, totalMs: 0, delegate: "" };

  /**
   * @param {HTMLVideoElement} video preview element (also the fallback frame source)
   * @param {(result: FaceResult, now: number) => void} onResult
   * @param {(state: CameraState) => void} onState
   */
  constructor(video, onResult, onState) {
    this.video = video;
    this.onResult = onResult;
    this.onState = onState;
  }

  stop() {
    this.generation++;
    if (this.videoCallback) this.video.cancelVideoFrameCallback?.(this.videoCallback);
    this.videoCallback = 0;
    void this.reader?.cancel().catch(() => undefined);
    this.reader = undefined;
    this.pendingFrame?.close();
    this.pendingFrame = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.video.srcObject = null;
    this.busy = false;
    this.onState("stopped");
  }

  /** @param {string} [deviceId] */
  async start(deviceId = "") {
    this.stop();
    const generation = this.generation;
    this.onState("starting");
    let loadingModel = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("Camera unavailable");
      track.addEventListener("ended", () => {
        if (this.stream === stream) {
          this.stop();
          this.onState("cameraUnavailable");
        }
      }, { once: true });
      void this.video.play().catch(() => undefined);
      loadingModel = true;
      const worker = new Worker(new URL("./tracking-worker.js", import.meta.url));
      this.worker = worker;
      const fail = () => {
        if (generation === this.generation) {
          this.stop();
          this.onState("modelError");
        }
      };
      worker.onerror = fail;
      worker.onmessage = ({ data }) => {
        if (generation !== this.generation) return;
        if (data.type === "ready") {
          this.timing.delegate = data.delegate;
          this.onState("running");
          this.startFrames(track, generation);
        } else if (data.type === "delegate") {
          this.timing.delegate = data.delegate;
        } else if (data.type === "result") {
          this.timing.frames++;
          this.timing.totalMs += data.elapsed;
          this.onResult(data.result, performance.now());
        } else if (data.type === "consumed") {
          this.busy = false;
          if (this.pendingFrame) {
            const frame = this.pendingFrame;
            this.pendingFrame = undefined;
            this.sendFrame(frame);
          }
        } else if (data.type === "tick" && !this.reader && performance.now() - this.lastCallback > 100) {
          void this.sendBitmap(generation);
        } else if (data.type === "error") {
          fail();
        }
      };
      worker.postMessage({ type: "init" });
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.onState(loadingModel ? "modelError"
        : error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)
          ? "cameraBlocked" : "cameraUnavailable");
    }
  }

  /** @param {MediaStreamTrack} track @param {number} generation */
  startFrames(track, generation) {
    this.lastVideo = -1;
    this.lastCallback = -Infinity;
    const Processor = /** @type {{ MediaStreamTrackProcessor?: TrackProcessor }} */ (/** @type {unknown} */ (globalThis)).MediaStreamTrackProcessor;
    if (Processor) {
      try {
        this.reader = new Processor({ track, maxBufferSize: 1 }).readable.getReader();
        void this.readFrames(this.reader, generation);
        return;
      } catch {
        // fall back on browsers that expose an unusable processor
      }
    }
    this.startVideoCallbacks(generation);
  }

  /** @param {ReadableStreamDefaultReader<VideoFrame>} reader @param {number} generation */
  async readFrames(reader, generation) {
    try {
      while (generation === this.generation) {
        const { value, done } = await reader.read();
        if (done) break;
        if (generation !== this.generation) {
          value.close();
          continue;
        }
        if (this.busy) {
          // keep only the newest frame while the worker is busy
          this.pendingFrame?.close();
          this.pendingFrame = value;
          continue;
        }
        this.sendFrame(value);
      }
    } catch {
      // a failed track processor can still have a playable video preview
    } finally {
      reader.releaseLock();
      if (generation === this.generation) {
        this.reader = undefined;
        this.startVideoCallbacks(generation);
      }
    }
  }

  /** @param {number} generation */
  startVideoCallbacks(generation) {
    if (generation !== this.generation || typeof this.video.requestVideoFrameCallback !== "function") return;
    const frame = () => {
      if (generation !== this.generation) return;
      this.lastCallback = performance.now();
      void this.sendBitmap(generation);
      this.videoCallback = this.video.requestVideoFrameCallback(frame);
    };
    this.videoCallback = this.video.requestVideoFrameCallback(frame);
  }

  /** @param {VideoFrame | ImageBitmap} frame */
  sendFrame(frame) {
    this.busy = true;
    try {
      const timestamp = "timestamp" in frame ? frame.timestamp / 1000 : this.video.currentTime * 1000;
      this.worker?.postMessage({ type: "frame", frame, timestamp }, [frame]);
    } catch {
      frame.close();
      this.busy = false;
      this.stop();
      this.onState("modelError");
    }
  }

  /** @param {number} generation */
  async sendBitmap(generation) {
    if (this.busy || this.video.readyState < 2 || this.video.currentTime === this.lastVideo) return;
    this.busy = true;
    this.lastVideo = this.video.currentTime;
    try {
      const bitmap = await createImageBitmap(this.video);
      if (generation !== this.generation) {
        bitmap.close();
        return;
      }
      this.sendFrame(bitmap);
    } catch {
      if (generation === this.generation) this.busy = false;
    }
  }
}
