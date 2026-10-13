// @ts-check
/** @typedef {{id: string, label: string, index: number, button: HTMLButtonElement}} Action */
/** @typedef {{version: 1, stop: string | null, motions: Record<string, string>}} Bindings */

const MODIFIER = /^(Shift|Alt|Control|Meta)(Left|Right)$|^(CapsLock|Fn|FnLock|AltGraph)$/;

/** @param {KeyboardEvent} event */
export function keyBinding(event) {
  if (event.ctrlKey || event.metaKey || event.isComposing || !event.code ||
      MODIFIER.test(event.code) || ["Escape", "Backspace", "Delete", "Unidentified"].includes(event.code)) return null;
  return `${event.shiftKey ? "Shift+" : ""}${event.altKey ? "Alt+" : ""}${event.code}`;
}

/** @param {string | null} binding */
export function keyLabel(binding) {
  return binding ? binding.split("+").map((part) => part.replace(/^(Digit|Key)/, "").replace(/^Numpad/, "Num")).join("+") : "未割り当て";
}

/** @param {Action[]} actions @returns {Bindings} */
export function defaultBindings(actions) {
  return { version: 1, stop: "Digit0", motions: Object.fromEntries(actions.slice(0, 9).map((a, i) => [a.id, `Digit${i + 1}`])) };
}

/** Reject malformed saved settings, but ignore IDs no longer in this model.
 * @param {unknown} input @param {Action[]} actions @returns {Bindings} */
export function readBindings(input, actions) {
  const defaults = () => defaultBindings(actions);
  if (!input || typeof input !== "object") return defaults();
  const saved = /** @type {Bindings} */ (input);
  const valid = (/** @type {unknown} */ value) => {
    if (typeof value !== "string" || !/^(Shift\+)?(Alt\+)?[A-Za-z][A-Za-z0-9]*$/.test(value)) return false;
    const code = value.split("+").pop() || "";
    return !MODIFIER.test(code) && !["Escape", "Backspace", "Delete", "Unidentified"].includes(code);
  };
  if (saved.version !== 1 || (saved.stop !== null && !valid(saved.stop)) ||
      !saved.motions || typeof saved.motions !== "object" || Array.isArray(saved.motions)) return defaults();
  /** @type {Record<string, string>} */
  const motions = Object.create(null);
  const used = new Set(saved.stop ? [saved.stop] : []);
  for (const action of actions) {
    if (!Object.hasOwn(saved.motions, action.id)) continue;
    const binding = saved.motions[action.id];
    if (!valid(binding) || used.has(binding)) return defaults();
    used.add(binding);
    motions[action.id] = binding;
  }
  return { version: 1, stop: saved.stop, motions };
}

/** Keyboard bindings belong only to the control page, separately for each model URL.
 * @param {string} modelPath @param {Action[]} actions
 * @param {(id: string | null) => void} run null returns to idle
 */
export function attachHotkeys(modelPath, actions, run) {
  const storageKey = `live2d-motion-hotkeys:${new URL(modelPath, location.href).href}`;
  let bindings = defaultBindings(actions);
  try { bindings = readBindings(JSON.parse(localStorage.getItem(storageKey) || "null"), actions); }
  catch { /* Defaults also work when storage is unavailable. */ }
  const panel = /** @type {HTMLDetailsElement} */ (document.getElementById("hotkeySettings"));
  const rows = /** @type {HTMLElement} */ (document.getElementById("hotkeyRows"));
  const notice = /** @type {HTMLElement} */ (document.getElementById("hotkeyNotice"));
  /** @type {{ id: string | null, label: string, key: HTMLButtonElement, badge?: HTMLElement }[]} */
  const controls = [];
  /** @type {typeof controls[number] | null} */
  let waiting = null;

  for (const action of [{ id: null, label: "通常に戻す", button: null }, ...actions]) {
    const row = document.createElement("div");
    row.className = "hotkey-row";
    const label = document.createElement("span");
    label.textContent = action.label;
    const key = document.createElement("button");
    key.type = "button";
    key.className = "action";
    row.append(label, key);
    rows.append(row);
    const control = { id: action.id, label: action.label, key, badge: document.createElement("kbd") };
    if (action.button) {
      control.badge.className = "hotkey-badge";
      action.button.append(control.badge);
    }
    controls.push(control);
    key.onclick = () => {
      waiting = control;
      notice.textContent = "キーを押してください。Esc: キャンセル / Backspace・Delete: 解除";
      render();
    };
  }

  const value = (/** @type {string | null} */ id) => id === null ? bindings.stop
    : Object.hasOwn(bindings.motions, id) ? bindings.motions[id] : null;
  function render() {
    for (const control of controls) {
      const binding = value(control.id);
      control.key.textContent = waiting === control ? "キーを押してください" : keyLabel(binding);
      control.key.setAttribute("aria-label", `${control.label} のキー: ${control.key.textContent}`);
      control.key.classList.toggle("on", waiting === control);
      if (control.badge) {
        control.badge.textContent = keyLabel(binding);
        control.badge.hidden = !binding;
      }
    }
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(bindings)); }
    catch { notice.textContent += " このブラウザでは保存できないため、再読み込みすると初期値に戻ります。"; }
  }
  function cancel() {
    if (!waiting) return;
    waiting = null;
    notice.textContent = "割り当てをキャンセルしました";
    render();
  }
  function set(/** @type {string | null} */ id, /** @type {string | null} */ binding) {
    if (id === null) bindings.stop = binding;
    else if (binding) Object.defineProperty(bindings.motions, id, { value: binding, enumerable: true, writable: true, configurable: true });
    else delete bindings.motions[id];
  }
  document.getElementById("resetHotkeys")?.addEventListener("click", () => {
    waiting = null;
    bindings = defaultBindings(actions);
    notice.textContent = "初期の割り当てに戻しました";
    save();
    render();
  });
  panel.addEventListener("toggle", () => { if (!panel.open) cancel(); });
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.isComposing) return;
    if (waiting) {
      if (!panel.open || panel.closest("[hidden]")) { cancel(); return; }
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        notice.textContent = "Ctrl / Command を使うキーは割り当てできません";
        return;
      }
      if (event.code === "Escape") { cancel(); return; }
      const clear = event.code === "Backspace" || event.code === "Delete";
      const binding = clear ? null : keyBinding(event);
      if (!clear && !binding) return;
      const previous = binding && controls.find((control) => control !== waiting && value(control.id) === binding);
      if (previous) set(previous.id, null);
      set(waiting.id, binding);
      notice.textContent = previous ? `${keyLabel(binding)} を「${previous.label}」から移しました`
        : binding ? `「${waiting.label}」に ${keyLabel(binding)} を割り当てました` : `「${waiting.label}」の割り当てを解除しました`;
      waiting = null;
      save();
      render();
      return;
    }
    const target = event.target;
    const focused = document.activeElement;
    const editing = (/** @type {EventTarget | null} */ node) => node instanceof HTMLElement &&
      (node.matches("input, textarea, select") || node.isContentEditable);
    if (event.ctrlKey || event.metaKey || editing(target) || editing(focused)) return;
    if (event.code === "Escape") {
      event.preventDefault();
      run(null);
      return;
    }
    const binding = keyBinding(event);
    if (!binding) return;
    const control = controls.find((control) => value(control.id) === binding);
    if (control) { event.preventDefault(); run(control.id); }
  });
  render();
}
