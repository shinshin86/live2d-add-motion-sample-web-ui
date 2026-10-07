// @ts-check
// Headless verification (tools/verify_browser.sh): Chrome takes its screenshot
// when "load" fires, so &hold=N keeps "load" pending with a request that only
// tools/serve.py answers, after N seconds (any other server answers 404 at
// once, so this is harmless outside verification). Import it first.
const hold = Number(new URLSearchParams(location.search).get("hold"));
if (hold > 0) {
  const img = document.createElement("img");
  img.hidden = true;
  img.src = `__verify_hold?s=${hold}`;
  document.body.appendChild(img);
}
