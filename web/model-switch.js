// @ts-check
/** Select an installed model; notifications and successful POSTs share one reload.
 * @param {boolean} relayOn @param {string} modelPath
 * @param {() => string | null} blocked
 * @param {(text: string) => void} notice
 * @returns {() => void} Called when another control page switches the model.
 */
export function attachModelSwitch(relayOn, modelPath, blocked, notice) {
  const box = /** @type {HTMLElement} */ (document.getElementById("modelSwitch"));
  const selection = /** @type {HTMLSelectElement} */ (document.getElementById("modelSelect"));
  let reloading = false;
  let switching = false;
  function reload() {
    if (reloading) return;
    reloading = true;
    selection.disabled = true;
    notice("モデルが切り替わりました。再読み込みします");
    const url = new URL(location.href);
    url.searchParams.delete("model");
    url.searchParams.delete("expression");
    if (url.href === location.href) location.reload();
    else location.replace(url.href);
  }
  async function initialize() {
    if (!relayOn) return;
    const status = await fetch("/live/status", { cache: "no-store" });
    if (!status.ok || !(await status.json()).modelSwitch) return;
    const response = await fetch("/live/models", { cache: "no-store" });
    if (!response.ok) throw new Error(`モデル一覧を取得できません (HTTP ${response.status})`);
    const data = await response.json();
    /** @type {{ name: string, model3: string }[]} */
    const models = data.models;
    if (!Array.isArray(models) || models.length < 2) return;
    const loadedUrl = new URL(modelPath, location.href).href;
    const current = models.find((entry) => new URL(entry.model3, location.href).href === loadedUrl);
    const selected = current?.name || "";
    if (!current) {
      const label = new URL(location.href).searchParams.has("model") ? "(URL 指定)" : "モデルを選択";
      const option = new Option(label, "");
      option.disabled = true;
      selection.add(option);
    }
    for (const entry of models) selection.add(new Option(entry.name, entry.name));
    selection.value = selected;
    box.hidden = false;
    selection.onchange = async () => {
      if (switching || reloading) return;
      const reason = blocked();
      if (reason) {
        selection.value = selected;
        notice(reason);
        return;
      }
      switching = true;
      selection.disabled = true;
      try {
        const res = await fetch("/live/model", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: selection.value }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        reload();
      } catch (error) {
        if (!reloading) {
          selection.value = selected;
          notice(`モデルを切り替えられません: ${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        switching = false;
        selection.disabled = reloading;
      }
    };
  }
  void initialize().catch((error) => notice(String(error)));
  return reload;
}
