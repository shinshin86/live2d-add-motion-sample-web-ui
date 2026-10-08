// Worker timer independent of animation frames. At most one tick awaits the page.
let pending = false;
self.onmessage = () => { pending = false; };
self.setInterval(() => {
  if (pending) return;
  pending = true;
  self.postMessage(null);
}, 1000 / 30);
