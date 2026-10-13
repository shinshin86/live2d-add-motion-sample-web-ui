// @ts-check
/** @typedef {import("./hotkeys.js").Action} Action */

/** Connect external commands only after the model and its Action list are ready.
 * @param {boolean} relayOn @param {Action[]} actions
 * @param {(id: string | null) => void} run @param {() => string | null} playingId
 */
export async function attachMotionRemote(relayOn, actions, run, playingId) {
  const note = /** @type {HTMLElement} */ (document.getElementById("remoteNote"));
  const fields = /** @type {HTMLFieldSetElement} */ (document.getElementById("remoteFields"));
  if (!relayOn) { note.textContent = "tools/serve.py で開くと使えます"; return; }
  try {
    const res = await fetch("/live/status", { cache: "no-store" });
    if (!res.ok) throw new Error("サーバーに接続できません");
    if (!(await res.json()).motionRemote) {
      note.textContent = "サーバーを再起動して、このページを再読み込みしてください";
      return;
    }
    const url = /** @type {HTMLInputElement} */ (document.getElementById("remoteUrl"));
    const token = /** @type {HTMLInputElement} */ (document.getElementById("remoteToken"));
    const selection = /** @type {HTMLSelectElement} */ (document.getElementById("remoteMotion"));
    const fallback = /** @type {HTMLTextAreaElement} */ (document.getElementById("remoteCopyText"));
    const copyMotion = /** @type {HTMLButtonElement} */ (document.getElementById("copyMotionCurl"));
    const regenerate = /** @type {HTMLButtonElement} */ (document.getElementById("regenerateToken"));
    url.value = location.origin + "/live/motion";
    for (const action of actions) selection.add(new Option(action.label, action.id));
    copyMotion.disabled = !actions.length;
    selection.disabled = !actions.length;
    /** @param {boolean} rotate */
    async function loadToken(rotate) {
      const response = await fetch("/live/token", rotate ? {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      } : { cache: "no-store" });
      if (!response.ok) throw new Error(`トークンを取得できません (HTTP ${response.status})`);
      const data = await response.json();
      if (typeof data.token !== "string" || !data.token) throw new Error("トークンが不正です");
      token.value = data.token;
    }
    await loadToken(false);
    fields.disabled = false;
    const events = new EventSource("/live/commands");
    events.onopen = () => { note.textContent = "外部操作に接続中。この操作ページを開いたまま使ってください"; };
    events.onerror = () => { note.textContent = "外部操作に再接続しています。サーバーの起動状態を確認してください"; };
    events.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "stop") run(null);
        else if (message.type === "motion" && typeof message.id === "string") run(message.id);
      } catch { /* Ignore malformed commands. */ }
    };
    window.addEventListener("pagehide", () => events.close(), { once: true });
    window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });
    document.getElementById("showRemoteToken")?.addEventListener("click", (event) => {
      token.type = token.type === "password" ? "text" : "password";
      const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
      button.textContent = token.type === "password" ? "表示" : "隠す";
      button.setAttribute("aria-pressed", String(token.type === "text"));
    });
    const quote = (/** @type {string} */ text) => "'" + text.replace(/'/g, "'\\''") + "'";
    const curl = (/** @type {object} */ body) => `curl -X POST ${quote(url.value)} -H ${quote("X-Live-Token: " + token.value)} -H 'Content-Type: application/json' -d ${quote(JSON.stringify(body))}`;
    async function copy(/** @type {string} */ text) {
      try {
        await navigator.clipboard.writeText(text);
        fallback.hidden = true;
        fallback.value = "";
        note.textContent = "コピーしました";
      } catch {
        fallback.value = text;
        fallback.hidden = false;
        fallback.select();
        note.textContent = "自動コピーできません。選択した内容を手動でコピーしてください";
      }
    }
    document.getElementById("copyRemoteUrl")?.addEventListener("click", () => void copy(url.value));
    document.getElementById("copyRemoteToken")?.addEventListener("click", () => void copy(token.value));
    copyMotion.onclick = () => void copy(curl({ motion: selection.value }));
    document.getElementById("copyStopCurl")?.addEventListener("click", () => void copy(curl({ stop: true })));
    // Opening settings picks the playing motion; the selector can then choose any other one.
    document.getElementById("hotkeySettings")?.addEventListener("toggle", () => {
      const id = playingId();
      if (id) selection.value = id;
    });
    regenerate.onclick = async () => {
      regenerate.disabled = true;
      try {
        await loadToken(true);
        fallback.value = "";
        fallback.hidden = true;
        note.textContent = "トークンを再生成しました。外部アプリの設定も更新してください";
      } catch (error) { note.textContent = String(error); }
      finally { regenerate.disabled = false; }
    };
  } catch (error) { note.textContent = String(error); }
}
