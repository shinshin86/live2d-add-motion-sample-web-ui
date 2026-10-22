// @ts-check
/** @typedef {import("./recorder.js").Recording} Recording */

/**
 * @param {{ root: HTMLElement, model: string, server: boolean,
 *   blocked: () => string | null, preview: (motion: any, label: string) => Promise<void>, stop: () => void }} options
 */
export function attachRecordingEditor(options) {
  const { root } = options;
  root.innerHTML = `
    <div class="card-title" id="editTitle">録画を編集</div>
    <fieldset id="editFields">
      <label>開始(秒)<input id="editStart" type="number" min="0" step="any"></label>
      <label>終了(秒)<input id="editEnd" type="number" min="0" step="any"></label>
      <label>速度(倍)<input id="editSpeed" type="number" min="0.25" max="4" step="0.05" value="1"></label>
      <label>なめらかさ<input id="editSmooth" type="range" min="0" max="1" step="0.05" value="0"></label>
      <label class="check"><input id="editLoop" type="checkbox">ループとして再生</label>
      <div id="editDuration" class="note"></div>
      <div class="choices"><button id="editPreview" type="button">試再生</button><button id="editStop" type="button">停止</button></div>
      <div class="choices"><button id="editSave" type="button">編集を保存</button><button id="editReset" type="button">元の設定</button></div>
      <button id="editDelete" type="button" class="action">録画を削除</button>
      <div id="editDeleteConfirm" hidden>
        <p id="editDeleteText"></p>
        <div class="choices"><button id="editDeleteYes" type="button">削除する</button><button id="editDeleteNo" type="button">キャンセル</button></div>
      </div>
    </fieldset>
    <div class="note">元のパラメータ値は残ります。試再生は操作ページのみで、カメラとリップシンクを一時的に反映しません。</div>
    <div id="editNote" class="note" role="status" aria-live="polite"></div>
    <button id="editReload" class="action" hidden>再読み込みして表示</button>
    <button id="editClose" class="action">編集を閉じる(未保存の編集は破棄)</button>`;
  /** @param {string} id */
  const input = (id) => /** @type {HTMLInputElement} */ (root.querySelector(`#${id}`));
  /** @param {string} id */
  const button = (id) => /** @type {HTMLButtonElement} */ (root.querySelector(`#${id}`));
  const start = input("editStart"), end = input("editEnd"), speed = input("editSpeed");
  const smooth = input("editSmooth"), loop = input("editLoop");
  const fields = /** @type {HTMLFieldSetElement} */ (root.querySelector("#editFields"));
  const note = /** @type {HTMLElement} */ (root.querySelector("#editNote"));
  const confirmation = /** @type {HTMLElement} */ (root.querySelector("#editDeleteConfirm"));
  /** @type {Recording | null} */
  let source = null;
  let id = "", label = "", baseline = "";
  let duration = 0, busy = false, dirty = false, ready = false;

  /** @param {string} text @param {boolean} [warn] */
  function notice(text, warn = false) {
    note.textContent = text;
    note.classList.toggle("warn", warn);
  }
  /** @param {boolean} value */
  function setBusy(value) {
    busy = value;
    fields.disabled = busy || ready || !source;
    button("editClose").disabled = busy;
  }
  function edit() {
    const result = { trimStart: Number(start.value), trimEnd: Number(end.value),
      speed: Number(speed.value), smooth: Number(smooth.value), loop: loop.checked };
    if ([start, end, speed].some(field => !field.value.trim()) ||
        !Object.values(result).every(value => typeof value === "boolean" || Number.isFinite(value)) ||
        result.trimStart < 0 || result.trimEnd > duration + 1e-6 || result.trimStart >= result.trimEnd ||
        result.speed < 0.25 || result.speed > 4 || result.smooth < 0 || result.smooth > 1 ||
        (result.trimEnd - result.trimStart) / result.speed < 1 / 30 - 1e-6) {
      throw new Error("開始 < 終了、速度0.25〜4倍で指定し、編集後の長さを1フレーム以上にしてください");
    }
    return result;
  }
  function update() {
    try {
      const value = edit();
      root.querySelector("#editDuration").textContent = `再生時間: ${((value.trimEnd - value.trimStart) / value.speed).toFixed(2)} 秒 / 元の録画: ${duration.toFixed(2)} 秒`;
      dirty = JSON.stringify(value) !== baseline;
    } catch (error) {
      dirty = true;
      root.querySelector("#editDuration").textContent = error.message;
    }
  }
  /** @param {any} value */
  function fill(value) {
    start.value = String(value.trimStart ?? 0);
    end.value = String(value.trimEnd ?? duration);
    speed.value = String(value.speed ?? 1);
    smooth.value = String(value.smooth ?? 0);
    loop.checked = value.loop ?? source?.loop ?? false;
    update();
  }
  async function checkServer() {
    if (!options.server) throw new Error("録画の編集には python3 tools/serve.py で起動してください");
    const response = await fetch("live/status", { cache: "no-store" });
    if (!response.ok || (await response.json()).recordingEdit !== 1) {
      throw new Error("サーバーを起動し直し、ページを強制再読み込みしてください(録画編集に未対応です)");
    }
  }
  /** @param {string} operation @param {any} [value] */
  async function request(operation, value) {
    await checkServer();
    const response = await fetch(`recordings/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: options.model, id, ...(value ? { edit: value } : {}) }) });
    const result = await response.json().catch(() => null);
    if (!response.ok && !result?.saved) throw new Error(result?.error || `処理できません (HTTP ${response.status})`);
    return result;
  }
  /** @param {string} recordingId @param {string} name */
  async function open(recordingId, name) {
    if (busy) return;
    const reason = options.blocked();
    if (reason || (dirty && id !== recordingId)) {
      notice(reason || "未保存の編集があります。保存するか編集を閉じてください", true);
      root.hidden = false;
      root.scrollIntoView({ block: "nearest" });
      return;
    }
    if (source && id === recordingId) { root.scrollIntoView({ block: "nearest" }); return; }
    root.hidden = false;
    root.scrollIntoView({ block: "nearest" });
    source = null; ready = false; dirty = false;
    id = recordingId; label = name;
    root.dataset.recording = id;
    root.querySelector("#editTitle").textContent = `録画を編集: ${label}`;
    confirmation.hidden = true;
    button("editReload").hidden = true;
    setBusy(true);
    notice("録画を読み込んでいます…");
    try {
      await checkServer();
      const response = await fetch(`motion-defs/recordings/${encodeURIComponent(options.model)}/${encodeURIComponent(id)}.json`, { cache: "no-store" });
      if (!response.ok) throw new Error("編集する元の録画が見つかりません");
      source = await response.json();
      duration = (Object.values(source.params)[0].values.length - 1) / source.fps;
      fill(source.edit || {});
      baseline = JSON.stringify(edit()); dirty = false;
      notice("設定を変えて試再生できます。保存するまで録画は変わりません");
      root.scrollIntoView({ block: "start" });
      start.focus({ preventScroll: true });
    } catch (error) { notice(error.message, true); source = null; }
    finally { setBusy(false); }
  }
  async function preview() {
    if (busy || !source || ready) return;
    try {
      const value = edit();
      setBusy(true); notice("試再生用のモーションを生成しています…");
      const result = await request("preview", value);
      await options.preview(result.motion, label);
      notice(`試再生中: ${result.motion.Meta.Duration.toFixed(2)} 秒${value.loop ? " (ループ)" : ""}。編集はまだ保存していません`);
    } catch (error) { notice(error.message, true); }
    finally { setBusy(false); }
  }
  button("editPreview").onclick = () => void preview();
  button("editStop").onclick = options.stop;
  fields.addEventListener("input", () => { options.stop(); update(); confirmation.hidden = true; });
  button("editReset").onclick = () => { options.stop(); fill({ loop: source?.loop }); };
  button("editSave").onclick = async () => {
    if (busy || !source || ready) return;
    try {
      const value = edit();
      options.stop(); setBusy(true); notice("編集を保存し、モーションを生成・検証しています…");
      const result = await request("edit", value);
      if (result.saved) { baseline = JSON.stringify(value); dirty = false; }
      ready = !!result.ready;
      button("editReload").hidden = !ready;
      notice(result.error || "編集を保存・検証しました。「再読み込みして表示」を押してください", !!result.error);
    } catch (error) { notice(error.message, true); }
    finally { setBusy(false); }
  };
  button("editDelete").onclick = () => {
    root.querySelector("#editDeleteText").textContent = `「${label}」の元の録画と生成済みモーションを削除します。復元できません。削除しますか？`;
    confirmation.hidden = false;
    button("editDeleteNo").focus();
  };
  button("editDeleteNo").onclick = () => { confirmation.hidden = true; button("editDelete").focus(); };
  button("editDeleteYes").onclick = async () => {
    if (busy || !source || ready) return;
    setBusy(true); options.stop(); notice("録画を削除し、モーションを生成・検証しています…");
    try {
      const result = await request("delete");
      ready = !!result.ready; dirty = false;
      confirmation.hidden = true;
      button("editReload").hidden = !ready;
      notice("録画を削除しました。「再読み込みして表示」を押してください");
    } catch (error) { notice(error.message, true); }
    finally { setBusy(false); }
  };
  button("editClose").onclick = () => { options.stop(); root.hidden = true; dirty = false; source = null; };
  button("editReload").onclick = () => {
    const url = new URL(location.href);
    for (const key of ["editrecording", "record", "recordloop", "recordname", "camera", "fakeface", "fakebody", "bodytime", "body", "play", "freeze", "hold"]) url.searchParams.delete(key);
    url.searchParams.set("tab", "motion"); url.hash = "recordedActions";
    location.href = url.href;
  };
  setBusy(false);
  return { open, preview, get active() { return !root.hidden; },
    blocked: () => busy ? "録画を処理しています。完了するまでモデルを切り替えられません" :
      dirty ? "未保存の録画編集があります。保存するか編集を閉じてください" : null };
}
