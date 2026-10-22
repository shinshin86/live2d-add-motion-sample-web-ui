// @ts-check
// Shares the existing video, never opens another camera. Pose inference has its
// own CPU worker and one bitmap in flight; face capture never waits on it.
export class BodyCapture {
  /** @type {Worker | null} */ worker = null;
  generation = 0;
  busy = false;
  lastVideo = -1;
  /** @param {HTMLVideoElement} video
   * @param {(result: import("./body-tracking.js").BodyResult, now: number, aspect: number) => void} result
   * @param {(state: string) => void} state */
  constructor(video, result, state) { this.video = video; this.result = result; this.state = state; }
  stop() {
    this.generation++; this.worker?.terminate(); this.worker = null;
    this.busy = false; this.lastVideo = -1; this.state("off");
  }
  start() {
    if (this.worker) return;
    const generation = ++this.generation;
    this.state("loading");
    let worker;
    try { worker = new Worker(new URL("./body-worker.js", import.meta.url)); }
    catch { this.state("error"); return; }
    this.worker = worker;
    const fail = () => { if (generation === this.generation) { this.stop(); this.state("error"); } };
    worker.onerror = fail;
    worker.onmessage = ({ data }) => {
      if (generation !== this.generation) return;
      if (data.type === "ready") this.state("ready");
      else if (data.type === "tick") void this.frame(generation);
      else if (data.type === "consumed") this.busy = false;
      else if (data.type === "result") this.result(data.result, performance.now(), this.video.videoWidth / this.video.videoHeight);
      else if (data.type === "error") fail();
    };
    try { worker.postMessage({ type: "init" }); } catch { fail(); }
  }
  /** @param {number} generation */
  async frame(generation) {
    if (this.busy || this.video.readyState < 2 || !this.video.videoWidth || !this.video.videoHeight || this.video.currentTime === this.lastVideo) return;
    this.busy = true; this.lastVideo = this.video.currentTime;
    try {
      const frame = await createImageBitmap(this.video, { resizeWidth: 320,
        resizeHeight: Math.max(1, Math.round(320 * this.video.videoHeight / this.video.videoWidth)), resizeQuality: "low" });
      if (generation !== this.generation) { frame.close(); return; }
      try { this.worker.postMessage({ type: "frame", frame }, [frame]); }
      catch (error) { frame.close(); throw error; }
    } catch {
      if (generation === this.generation) { this.stop(); this.state("error"); }
    }
  }
}
