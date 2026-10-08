// @ts-check
/** Run updates independently of rendering, without accumulating queued ticks.
 * @param {(now: number) => void} update @returns {() => void} stop */
export function startBackgroundClock(update) {
  const worker = new Worker(new URL("./clock-worker.js", import.meta.url));
  worker.onmessage = () => {
    try { update(performance.now()); }
    finally { worker.postMessage(null); }
  };
  const stop = () => {
    worker.terminate();
    window.removeEventListener("pagehide", stop);
  };
  window.addEventListener("pagehide", stop);
  return stop;
}
