# live2d-add-motion-sample-web-ui

**Add new motions to a Live2D model by editing JSON only — no Cubism Editor required.** Comes with a browser-based WebUI.

[日本語版READMEはこちら](README.ja.md)

![Screenshot of the WebUI: the Hiyori avatar on the left, playback buttons for the newly added motions on the right](docs/images/webui.png)

<sub>Sample model: Hiyori Momose ©Live2D (model data is NOT included in this repository)</sub>

## What is this?

A Live2D motion file (`.motion3.json`) is just JSON — a set of keyframe curves per model parameter. That means you can create new motions with a text editor alone, as long as you stay within the parameters the model already has. No rigging, no mesh editing.

This repository adds the following 7 motions to the official Live2D sample model "Hiyori", using JSON only:

| Motion | Main parameters used |
|---|---|
| Happy | Smiling eyes (EyeSmile) + mouth form + cheek blush + body bounce |
| Wink | Single-eye blink + head tilt |
| Nod | Head pitch (double nod) |
| Thinking | Head tilt + averted gaze + furrowed brows |
| Surprised | Widened eyes + raised brows + "o" mouth + lean back |
| Shy | Cheek blush + looking down + lowered eyelids |
| Head shake | Head yaw oscillation |

For reproducibility, motions are not hand-written: they are built by a pipeline of **a generator script + an independent validator + headless-browser verification**. The repository also ships agent-facing documentation ([AGENTS.md](AGENTS.md)) so you can ask an AI agent (Claude Code, Codex, etc.) to "add a new motion" and have it work autonomously.

## Quick start

Requirements: **Python 3** (standard library only), a **modern browser**, and a coding agent such as Claude Code / Codex.

```bash
git clone https://github.com/shinshin86/live2d-add-motion-sample-web-ui.git
cd live2d-add-motion-sample-web-ui
```

Launch your agent at the repository root and **just ask, mentioning where your model is**:

> There is a Live2D model at `~/Downloads/model.zip`. Add motions to this model and make them viewable in the browser.

The agent handles everything — placing the model, setup, motion design, generation, validation, and starting the server (the workflow is defined in [AGENTS.md](AGENTS.md), which agents read automatically). A zip or a folder works, located anywhere.

If you don't have a model, download the official sample model ["Hiyori Momose (hiyori_pro)"](https://www.live2d.com/en/learn/sample/momose-hiyori/) — the bundled sample motion definitions work with it out of the box.

Adding or changing motions is also just a request:

> Add a "waving hand" motion to this model. If it cannot be made naturally with the existing parameters, do not force it — propose alternatives instead.

### Run manually

```bash
python3 tools/setup_model.py <model zip or folder>   # place model + generate model.config.json
python3 tools/gen_motions.py        # generate + register motions
python3 tools/validate_motions.py   # validate (should print "OK")

python3 tools/serve.py              # serve (add --port 8766 if 8765 is taken)
# → http://localhost:8765
```

Motion definitions live in `motion-defs/<model-name>.py`, one file per model (a sample definition is bundled as a reference). A different model needs its own definitions matching its parameters — that design work is exactly what you delegate to the AI agent. Definition files are treated as per-model workspace artifacts and are git-ignored just like `models/`, so switching models never dirties the repository.

For local additions to a bundled definition, create `motion-defs/<model-name>.local.py`
with the same `define(curve, motion)` format. Its motions and expressions are appended
after the main definitions; duplicate names fail. This file and any local motion
sources under `motion-defs/` stay git-ignored.

## Using the WebUI

- Play the newly added motions from the highlighted card (★ buttons); existing motions are in the collapsible sections below
- **Drag** the avatar to move it, **mouse wheel / pinch** to zoom around the cursor, and "Reset view" to restore the initial placement
- The card splits one-shot actions ("単発アクション") from loop motions ("ループ"). The motion that is playing is highlighted ("▶ 再生中" for a one-shot, a pulsing "⟳ ループ中" for a loop)
- A loop repeats until you press "■ ループ停止" (stop loop; only enabled while a loop plays) or play another motion
- "リップシンク" (lip sync) moves the mouth on top of any motion, one-shot or loop, to show how the avatar looks while speaking. Modes: OFF (the motion's own mouth), 疑似 (a simulated rhythm), 音声 (follows the loudness of an audio file you drop in or pick) and マイク (follows your microphone)
- "表情" (expressions) applies an expression over the playing motion. Press the selected expression again or "表情リセット" to fade it out. Expressions work with one-shots, loops and lip sync, and are mirrored to the streaming page when the local relay is available.
- The panel has two tabs: "モーション" (motions: everything above) and "カメラ" (camera: face tracking, recording and the streaming mode for OBS; see [Camera tracking and streaming](#camera-tracking-and-streaming)). The camera keeps running when you switch tabs, so you can play emotion motions while it drives the face; a red dot on the tab shows that it is on
- Debug query parameters: `?play=Action:0` (auto-play), `&freeze=1.2` (freeze the pose at a given second), `&cycles=3` (end a loop motion after its 3rd cycle), `&lipsync=1` (simulated lip sync; `&lipsync=mic` for the microphone), `&audio=<url>` (lip-sync to an audio file), `&tab=camera` (open the camera tab), `&camera=1` (start the camera on load), `&fakeface=1` (synthetic face movement, no camera), `&record=N` (record N seconds and save; `&recordloop=1` as a loop, `&recordname=<name>` the motion name), `?uitest=1` (automated drag/zoom test)

### Switching models

Set up multiple models with `python3 tools/setup_model.py <model zip or folder>` and start `python3 tools/serve.py`. When two or more models are installed, the "モデル" selector appears at the top of the control panel. It is not shown on a plain static server. Save or discard any camera recording before switching.

Selecting a model updates `model.config.json` and reloads the control and streaming pages. `gen_motions.py`, `validate_motions.py`, and camera recordings also use the selected model. To keep a streaming page on a particular model, specify its path, for example `stream.html?model=models/hiyori_pro_t11/hiyori_pro_t11.model3.json`.

Use the selector to switch between installed models. Running `setup_model.py` again for an existing model replaces its working copy and removes generated motions; run `gen_motions.py` to regenerate them afterward.

## Adding your own motions

If you use an AI agent, just reuse the prompt from the quick start (change the motion name). To do it manually:

1. `python3 tools/analyze_model.py` — inspect available parameters, their safe value ranges, and physics-driven parameters (do not animate those directly)
2. Add your keyframes to `motion-defs/<model-name>.py` (see the bundled sample for the format)
3. Generate → validate → verify in a browser:

```bash
python3 tools/gen_motions.py
python3 tools/validate_motions.py
tools/verify_browser.sh   # captures peak poses with headless Chrome (Chrome required)
```

Design rules (value ranges, returning to the base pose, avoiding physics-driven parameters, etc.) and model-specific knowledge are documented in [AGENTS.md](AGENTS.md). It is written for AI agents but useful for humans too.

### Sharing motions between models

`motion-defs/shared/gestures.py` contains portable nod, head-shake and surprised motions adapted from the Hiyori sample. Each shared pack uses `define(curve, motion)` and returns `(MOTIONS, MANIFEST)`. Times are seconds; parameter values are normalized: `0` is the model's estimated base pose, `-1` its safe minimum, and `+1` its safe maximum. Positive and negative sides scale independently. For example, a normalized MouthForm of `-0.5` maps to `-0.5` when the model rests at `1` with range `[-2,1]`.

Opt in from `motion-defs/<model-name>.py` or its optional `.local.py`:

```python
SHARED_MOTIONS = {
    "gestures": {
        "nod": {},
        "shakehead": {"scale": 0.8, "label": "Gentle head shake"},
        "surprised": {"name": "my_surprised"},
    },
}
```

Run the usual generator and validator. Shared entries appear at the end of Action, preserving existing indices; default IDs are `shared_<pack>_<motion>`. Omit a pack/motion to leave it out, or set an entry to `False` to disable one selected in the main file. Local declarations merge options for the same entry. `name` changes the ASCII file stem, `label` the display name, and `scale` accepts `[-1,1]` (negative values reverse direction). `parameters` remaps a template parameter ID, for example `{"ParamCheek": "ParamTere"}`, or skips it with `None`. Remapping keys must occur in that template.

Generation uses ranges/base poses from the model's original motions; standard IDs without a reference use conservative conventional ranges. Missing parameters, unknown ranges and physics outputs are skipped with a note; a motion with no usable parameters fails. One-shot curves must start/end at normalized `0`; loops use `loop=True` on both curves and motion. Unknown templates, unsafe values, duplicate target parameters and names colliding with model/local/recording definitions fail before files are written. Keep `models/<model>/.generated-shared-motions.json`: it records ownership so unselected generated files are excluded from future range analysis. Such files remain on disk but are unregistered; unmanaged files are never overwritten by shared motions. The validator independently checks conventional fallback ranges too. Always inspect the result on each model: the same parameter can produce a different expression or direction on a different rig.

## Expressions

An expression (`.exp3.json`) holds parameter changes independently of the motion. The Hiyori sample selects shared smile, shy, surprised and half-closed glare expressions, followed by its model-specific sleepy expression ("ねむい"). Its brows are hidden by bangs and the existing motions provide no angry brow pose, so the sample uses a sleepy face instead. To define your own, return an optional third dictionary from `define(curve, motion)`:

```python
EXPRESSIONS = {
    "custom_smile": {
        "label": "My smile", "fade_in": 0.4, "fade_out": 0.4,
        "parameters": [
            ("ParamEyeLOpen", 0, "Multiply"),
            ("ParamEyeROpen", 0, "Multiply"),
            ("ParamEyeLSmile", 1, "Overwrite"),
            ("ParamEyeRSmile", 1, "Overwrite"),
        ],
    },
}
return MOTIONS, MANIFEST, EXPRESSIONS
```

The old `(MOTIONS, MANIFEST)` return still works. File names use ASCII letters, digits, `_` or `-`; labels must be unique. Each parameter tuple is `(ID, value, blend)`: `Add` adds to the motion value, `Multiply` multiplies it, and `Overwrite` replaces it. Multiply eye openness to retain blinks. Leave LipSync parameters out when speech should control the mouth. Fades default to 0.4 seconds; `label` defaults to the file name.

Run the usual generator and validator. Files go to `models/<model>/expressions/` and are registered in `FileReferences.Expressions`. The generator keeps ownership records in `models/<model>/.generated-expressions.json`: retain this sidecar when reusing the working model. It updates/removes only its own registrations and rejects collisions with the model's existing names or files. Removing a definition unregisters it; the old generated file stays on disk. The validator checks the exp3 format, parameter IDs, physics outputs and the result of each blend on the estimated base pose against observed ranges (conservative conventional ranges for standard IDs without a reference). During playback values are clamped to the model's rig limits; lip sync writes the mouth last.

Use `?expression=smile` (file stem or exact display name) to apply on load. To check expressions alone and over a motion, with simulated lip sync:

```bash
OUT=tmp-verify/smile tools/verify_browser.sh --expression smile
OUT=tmp-verify/smile-nod tools/verify_browser.sh --expression smile Action:2 1.0
```

`OUT` selects the screenshot folder, which is cleared of PNG files at the start of each run. Inspect both screenshots for the intended face and smooth transitions when switching/resetting in the WebUI.

With `tools/serve.py`, selecting or clearing an expression (including `?expression=`) also updates `stream.html` using the same expression file and fade times. The expression layer runs after face tracking and before lip sync on both pages. The server holds the last expression selection in memory and replays it to a streaming page that opens or reconnects later. Clearing an expression or switching models clears this state; restarting the server forgets it. One-shot motions are not replayed to late joiners. Restart the server and reload both pages after updating this feature.

The relay message is `{"type":"expression","name":"smile"}`, or `name: null` to clear. `name` is the registered expression file stem (ASCII letters, digits, `_` or `-`, up to 240 characters), rather than an index or display label. This stays stable when expressions are reordered or translated, and lets a stream with an explicit `?model=` match its own registrations. Unknown or ambiguous stems leave its current expression unchanged; `?status=1` shows the diagnostic. Model changes also clear expressions on streams pinned to a model. Commands retain FIFO order even during file loading or a backlog; busy pose messages may be omitted. Recording-editor previews remain local.

### Portable expressions across models

Shared packs can return `(MOTIONS, MANIFEST, EXPRESSIONS)`; existing two-item packs still work. An expressions-only pack returns `({}, [], EXPRESSIONS)`. The bundled `motion-defs/shared/faces.py` provides smile, shy, surprised and sideways half-closed glare expressions, checked on both Hiyori and Haru. Select them separately from shared motions in the main or local model definitions:

```python
SHARED_EXPRESSIONS = {
    "faces": {
        "smile": {"name": "smile"},
        "shy": {"name": "shy"},
        "surprised": {},
        "glare": {"scale": 0.8},
    },
}
```

Use the ordinary expression dictionary format in the shared pack, with these value rules:

| Blend | Shared value and generated exp3 value |
|---|---|
| `Overwrite` | A normalized target `n` in `[-1,1]`: `0` = base, `-1` = safe minimum, `+1` = safe maximum. |
| `Add` | A normalized offset `n` in `[-1,1]`, using the distance from base to the corresponding safe bound. The exp3 value is the mapped target minus base. |
| `Multiply` | A finite plain factor, such as `0.5` to halve eye openness. It is not normalized. |

For Add/Overwrite, first apply `n *= scale`, then map to `base + n * (max - base)` for nonnegative `n`, or `base + n * (base - min)` for negative `n`. For Multiply, scale changes the factor to `1 + (factor - 1) * scale`. Scale is finite in `[-1,1]`; `0` is neutral and negative values reverse the change. If applying a blend to the base pose exceeds a safe bound, generation clamps that result, prints a note and adjusts the exp3 value for that blend. Runtime clamping still applies over moving poses.

Selection and options merge like `SHARED_MOTIONS`: local options override main options; `False` disables an entry; `name`, `label`, `scale` and `parameters` are supported. IDs default to `shared_<pack>_<expression>` and displayed labels start with `共通: `. Without a declaration, no shared expressions are added. Missing parameters, physics outputs and custom IDs without observed ranges are skipped with a note; no usable parameters fails. Model/local/shared name and label collisions, and collisions with shipped names or unmanaged files, fail before any output is written.

Generated registrations and the UI list shared expressions first, then shipped expressions in their original relative order, then model/local expressions. The examples keep `?expression=smile` / `shy` working through the `name` option; their labels become `共通: 笑顔` / `共通: 照れ`. Their former model definitions are removed. Hiyori retains its model-specific sleepy expression; Haru retains angry. `closed_smile` is removed because smile already closes the eyes in a smiling arc.

For Haru, remap `ParamCheek` to its observed `ParamTere` range `[0,1]` in both smile/shy selections. Smile also skips `ParamBrowLY` / `ParamBrowRY` with `None`, retaining Haru's original motion-driven brows. The shared smile uses blush `0.45` between the samples' previous `0.5` / `0.4`. Shy uses normalized brow targets and MouthForm multiplied by `0.3`; both samples rest at MouthForm `1`, giving the same restrained smile at rest while retaining the motion's mouth form.

Shared expressions use the same `.generated-expressions.json` ownership ledger as model expressions. Opting out unregisters them and retains their files and ownership for later reuse. Moving an owned expression into a shared pack can reuse its file stem; its old owned registration is replaced without touching shipped entries. Keep the ledger for this transition: unmanaged files still cause a collision. Action indices stay unchanged. Verify each selected expression alone and over a motion on every model, using e.g. `--expression shared_faces_glare` or `?expression=共通:%20ジト目`. The surprised sample sets mouth opening; lip sync overrides it while speaking. Smug, troubled and stronger embarrassment were omitted because they did not read consistently on both sample rigs using their common parameters.

## Loop motions (e.g. an emotion held while speaking)

A motion can be generated as a seamless loop: for example a "sad" motion played over and over for as long as a character speaks, with lip sync on top. The whole motion repeats, not a cut-out middle part, and the end flows into the start without a jump or a pause.

### Generating

In `motion-defs/<model-name>.py`, pass `loop=True` to both `motion()` and each `curve()`:

```python
MOTIONS["sad_loop"] = motion(6.0, [
    curve("ParamAngleY", [(0, -15), (0.75, -12.5), (2.25, -17.5), (3.75, -12.5), (5.25, -17.5), (6.0, -15)], loop=True),
    curve("ParamBrowLForm", [(0, -0.8), (6.0, -0.8)], loop=True),
    # ...
], loop=True)
```

- Each curve must end on its first value. `gen_motions.py` gives the keys tangents that carry the same speed through the seam and never overshoot, and writes `Meta.Loop: true`
- A loop may stay in the emotion's pose the whole time. It does not have to start from and return to the base pose like one-shot actions do
- `validate_motions.py` checks the seam: the same value (no jump) and the same slope (no jerk) at the end as at the start
- Keep the model's LipSync parameters (usually `ParamMouthOpenY`) out of loops that play while speaking. `validate_motions.py` warns about them, and `analyze_model.py` lists them
- Put blinks into the eye-open curves. The auto-blink pauses while any motion is playing

### Playing (in your app)

The Cubism Framework reads `Meta.Loop` but does not act on it. Your app has to switch looping on for the motion itself. This only uses the public motion API, so the Live2D / Cubism libraries stay unmodified. With pixi-live2d-display (as used by this WebUI):

```js
const mm = model.internalModel.motionManager;
const motion = await mm.loadMotion("Action", index); // the cached instance pixi will play
motion.setIsLoop(true);         // wrap back to the start at the end; never finishes
motion.setIsLoopFadeIn(false);  // no fade-in restart per cycle (it would stall every seam)
await model.motion("Action", index, PIXI.live2d.MotionPriority.FORCE);
```

- Set both flags **before** starting the motion. With the official Cubism SDK for Web, use the same two methods on `CubismMotion`. Other runtimes (Unity, native) may differ, which is not verified here
- Only loop motions from the `Action` group that have `Meta.Loop: true`. Motions exported from Cubism Editor often carry `Meta.Loop: true` even when their ends do not match
- FadeIn/FadeOut only apply when entering and leaving the loop, never between cycles
- To stop, either start another motion (it fades in from the current pose) or `mm.stopAllMotions()`. `motion.setIsLoop(false)` lets the running cycle finish first
- Lip sync: write the mouth value every frame after the motion update, e.g. in `model.internalModel.on("beforeModelUpdate", ...)` with `coreModel.setParameterValueById("ParamMouthOpenY", v)`
- After a loop, something has to put the face back. Parameters no motion writes keep their last value, so the model needs an idle motion (group `Idle`) that sets the face parameters

### Checking the seam

```bash
tools/verify_browser.sh --loop Action:1   # both sides of the 1st-3rd seams + a mid-cycle shot, lip sync on
```

The shots taken just before and after each seam should look alike and still show the loop's expression. In the WebUI, `?play=Action:1&cycles=3&lipsync=1` plays three cycles with simulated lip sync and then stops.

## Camera tracking and streaming

### Camera

Open the "カメラ" tab and press "● カメラ開始" (start camera). The avatar follows your head, eyes, gaze, mouth, brows and smile. The face you show first is taken as the front-facing, relaxed face; "正面をリセット" sets it again. Sensitivity, smoothing and mirroring can be adjusted. Sensitivity defaults to 1.5 and ranges from 0.25 to 3; it affects the head, mouth and brows, with head angles limited to ±30 degrees. "映像を隠す" (hide image) hides the camera image, for example before taking a screenshot, while tracking continues; the choice is remembered, and `&preview=0` in the URL starts with it hidden.

The face is layered on top of the playing motion: play an emotion such as a sad loop and the sad brows stay while your head and mouth move the avatar.

Camera frames are processed in the browser (a Web Worker running MediaPipe Face Landmarker) and are never sent anywhere. The MediaPipe runtime is loaded from jsDelivr, pinned to version 0.10.21 (later versions add metrics reporting to an external service), and the face model is bundled in `vendor/mediapipe/`.

### Recording a performance as a motion

While the camera runs, "● 録画開始" (start recording) records your face for up to 60 seconds. Press it again to stop, enter a title (up to 40 characters, including Japanese) in the focused field, then save it. Leaving the title empty uses "録画 M/D HH:MM" (the recorded date and time). The file name is assigned automatically as `rec_YYYYMMDD_HHMMSS`; you can change it under the initially closed "詳細設定(ファイル名)" (advanced file-name settings). It accepts letters, digits, `_` and `-`. Invalid or duplicate file names open these settings and show an error. Check "ループとして保存" (save as a loop) for a motion to play while speaking.

With `python3 tools/serve.py`, saving writes the recording to `motion-defs/recordings/<model-name>/` (git-ignored), then automatically generates and validates the motions. Recordings include their date and time with a local UTC offset. Saved-motion buttons show the title and a smaller "録画 M/D HH:MM" (recorded date and time); older recordings use the timestamp in the file name, or show the file name if no date is available. Once saving finishes, press "再読み込みして表示" (reload to display): the "モーション" tab opens with the recording in "保存したモーション" (saved motions). If generation or validation fails, the source recording is kept; the page shows an error and the server's terminal shows the details. Fix the reported problem and run the commands below before reloading.

After updating the app, restart `tools/serve.py` and force-reload the page so the server and page use the same version. An older server is detected before saving and the page asks you to restart it.

With another server, the recording is downloaded. Move it to `motion-defs/recordings/<model-name>/`, then run:

```bash
python3 tools/gen_motions.py   # the recording becomes a motion in the Action group
python3 tools/validate_motions.py
```

Reload the page to display the saved motion.

The recording stores what your face adds to each parameter, so the idle or emotion motion that happened to be playing is not baked in. The generator puts it back on the model's base pose, keeps it within the observed value ranges, reduces it to keyframes, and eases in from and out to the base pose (a loop instead blends its end into its start and leaves out the lip-sync parameters). The result passes `validate_motions.py` as is.

### Upper-body tracking

With the camera running, enable "上半身も動かす" to follow your shoulders and torso. It starts OFF after every page load. Keep both shoulders and hips in view; the first confident pose becomes neutral. "正面をリセット" recalibrates both face and body. Sensitivity, smoothing and mirroring also apply to the body. Turn it off to return to the existing face-driven body movement.

Shoulder/hip geometry drives `ParamBodyAngleX/Y/Z`, limited to ±8/±6/±8 degrees. While enabled it replaces the body movement derived from head rotation; face tracking continues independently. Low-confidence or lost poses fade back to neutral. Arms and model-specific shoulder controls are omitted because the installed rigs do not provide a consistently verified natural continuous mapping. Body tracking needs the hips in view even when only the upper half of the avatar is shown.

Pose Landmarker Lite is bundled locally with its [license and checksum](vendor/mediapipe/README.md). The runtime stays pinned to 0.10.21. Pose inference uses a separate CPU Worker at up to 10 fps, with one bitmap in flight and slower sampling when inference is expensive. It never holds up face-frame delivery. Camera images and body landmarks stay in the browser; only the resulting angles join recordings and the existing local OBS relay. Update/reload both control and streaming pages. During recording the body toggle is disabled to keep the parameter set consistent; old recordings remain unchanged.

For checks without a camera, `?fakebody=1&bodytime=1` holds a synthetic body pose; use `bodytime=-1` for the opposite pose, omit it for movement, and add `&body=0` to compare with tracking disabled. Combine with `&fakeface=1` and the existing recording hook to check both. Synthetic results do not establish real-camera accuracy or performance; check neutral calibration, loss recovery and face responsiveness with your camera.

### Editing a saved recording

In "保存したモーション", press the recording's "編集" button. Choose the start and end positions in the original recording (seconds), speed (0.25–4×), smoothing (0–1), and whether to loop. "試再生" previews these settings without saving; it runs only on the control page and temporarily leaves out live camera and lip-sync input. "停止" stops the preview. "編集を保存" saves and regenerates the motion; press "再読み込みして表示" to use it from the list. Close the editor to discard unsaved settings. "元の設定" restores the full source duration, normal speed, no smoothing and the original loop choice; save to apply that reset.

Edits are stored in an optional `edit` object in the recording JSON; the original `params`, duration, date and loop flag are preserved. For example, `{"trimStart":1,"trimEnd":6,"speed":1.5,"smooth":0.6,"loop":false}` keeps source seconds 1–6 and plays them in about 3.33 seconds. `trimEnd` is the retained end position, not a length to remove. The generator trims, smooths with a centered 11-frame moving average blended by `smooth`, then resamples the speed at 30 fps before the existing base-pose easing or loop seam treatment. Recordings without `edit` generate exactly as before.

"録画を削除" opens a confirmation inside the editor. "キャンセル" leaves the recording intact; "削除する" removes the source recording and its generated motion. If regeneration or validation fails, deletion is rolled back. After a successful deletion, reload to update the list.

Editing needs `tools/serve.py`; restart it and force-reload after updating. `GET /live/status` advertises `recordingEdit: 1` while retaining `recordingsVersion: 2`. Same-origin JSON POSTs to `/recordings/preview`, `/recordings/edit`, and `/recordings/delete` use `{model, id, edit}` (`edit` is omitted for deletion). They require a localhost/127.0.0.1 Host with the server's port and serialize with recording saves and model switches. Preview returns a motion without writing files. Edit saves only the settings, then generates and validates; if either fails, the settings remain saved and the page reports the error. No editing endpoint changes the raw parameter samples.

### Streaming mode (OBS)

1. Start the server with `python3 tools/serve.py`. The streaming mode needs it; `python3 -m http.server` cannot relay
2. In the "配信モード" card of the "カメラ" tab, choose the background (transparent, green or blue) and copy the URL of `stream.html`
3. In OBS, add a "Browser" source with that URL. Use the same host and port as the control page (for example, `http://localhost:8765/stream.html`); choose a canvas size such as 900 × 800

Keep the control page open and its camera running. You can put it behind OBS or minimize it: face sampling and lip-sync updates use a worker clock independently of rendering. The "配信モード" card shows how many streaming connections the server has, or a warning when none are connected or sending fails. For diagnosis, append `?status=1` (or `&status=1` after another query) to the OBS source URL: "受信中" means pose messages are arriving. If it stays "待機中", check the source URL, the local server and camera state. After updating the app, restart the server and reload both pages (use OBS's browser-source refresh).

In OBS, right-click the Browser source and choose "Interact" to adjust the avatar: drag to move, and use the wheel or trackpad pinch to zoom around the cursor. Double-click to reset. Placement is saved separately for each model in the streaming page's local storage and restored after reloads or OBS restarts. Relative positions follow changes to the source dimensions. If storage is unavailable, the controls still work but placement will not persist.

You can also set the initial placement in the URL: `stream.html?bg=green&zoom=1.2&x=0.5&y=0.55`. `zoom` is relative to the initial fitted size; `x` and `y` are the avatar's center as fractions of the source width and height (0–1). Valid URL values override saved values on each load. Double-click resets to the URL placement, or to the centered default when no values are specified. Actual model scale is limited to 0.05–5, as in the control page.

`stream.html` shows only the avatar. Motions, expressions, the camera face and the lip sync from the control page are mirrored to it through the local server. Only playback commands and parameters are relayed, never camera or microphone data, and the server listens on 127.0.0.1 only.

## Shortcut keys and switching motions from other apps

With the control page in front, keys **1–9** play the first nine Action motions in display order (one-shots, loops, then recordings). Pressing the same key while its motion is playing continues playback; after a one-shot finishes, the key plays it again. **0** or **Esc** stops any motion and returns to idle. Clicking a motion button still restarts it.

Open **ショートカットキー** (shortcut keys) in the "モーション" tab to assign keys to any Action motion, including recordings and motions beyond the first nine. Click a row's key button, then press a key; Shift and Alt combinations and numpad keys are supported. Esc cancels assignment; Backspace or Delete clears it. Assigning a key already in use moves it from the previous row. Ctrl/Command combinations cannot be assigned. Keys are ignored while typing in a form field or holding Ctrl/Command, and holding a key does not repeat playback. Esc always returns to idle outside form fields and assignment mode.

Bindings are saved in this browser for each model URL, using motion IDs. Once edited, they stay with the same motions when new motions are added; new entries remain unassigned. "初期の割り当てに戻す" restores the initial assignments. If browser storage is unavailable, bindings work for the current page but cannot be retained after a reload.

To switch while OBS or another app is in front, start `python3 tools/serve.py` and keep the control page open. Under **ショートカットキー → 外部アプリから切り替え**, copy the request URL, token, or a ready-to-use curl example. Choose a motion from the selector for its example; a separate button copies the stop command. If prompted, restart the server and reload the control page after updating.

**Try it from a terminal:** with the server running and http://localhost:8765 open, run these from the repository folder. `$(cat .live-token)` reads the token for you. `hiyori_happy` is a motion of the bundled Hiyori sample; for another model, use the small ID shown under a motion button, or its display name. If you started the server with `--port`, change `8765` to that port.

```sh
# play a motion
curl -X POST http://localhost:8765/live/motion -H "X-Live-Token: $(cat .live-token)" -H "Content-Type: application/json" -d '{"motion":"hiyori_happy"}'

# return to idle
curl -X POST http://localhost:8765/live/motion -H "X-Live-Token: $(cat .live-token)" -H "Content-Type: application/json" -d '{"stop":true}'
```

No output means success, and the avatar on the page moves. "操作ページが開いていません" means the control page is not open; "トークンが一致しません" means the token does not match (run the commands from the repository folder).

For other apps, the request has this general form:

```sh
curl -X POST http://localhost:8765/live/motion \
  -H 'X-Live-Token: <token>' -H 'Content-Type: application/json' \
  -d '{"motion":"<motion-id>"}'

curl -X POST http://localhost:8765/live/motion \
  -H 'X-Live-Token: <token>' -H 'Content-Type: application/json' \
  -d '{"stop":true}'
```

`Authorization: Bearer <token>` can replace `X-Live-Token`. A motion ID is its file name without `.motion3.json`; the API also accepts an exact display name. IDs take precedence, and duplicate display names return `409` (use an ID instead). Re-sending the currently playing motion keeps it running. Success returns `204` after queuing the command; it does not acknowledge playback. Missing/incorrect tokens return `401`, unknown motions `404`, and no connected control page `503`. If a newly saved motion has not loaded in the control page yet, reload that page. Requests resolve against the model in `model.config.json`.

**Stream Deck:** use a plugin action that sends a web request in the background. Set POST, the URL, JSON content type, token header, and body as above. The standard Website action only opens a browser tab and cannot send this command.

**macOS Shortcuts:** enable "Allow Running Scripts" in Settings → Advanced, add "Run Shell Script" with the curl command, and assign a keyboard shortcut in the shortcut's details. It may not work with every foreground app. For use across apps, run the same command through Raycast or Hammerspoon, or use Stream Deck.

Shortcuts, Raycast and Hammerspoon do not run commands in the repository folder, so `$(cat .live-token)` does not work there. Paste the command from "モーションの curl 例をコピー" in the settings instead; it contains the token itself.

The token is stored in `.live-token` (git-ignored) and survives server restarts. "トークンを再生成" replaces it; update external-app settings afterward, since the old token returns `401`. The server listens only on `127.0.0.1`; the token and motion endpoints accept only `localhost:<port>` or `127.0.0.1:<port>` as the Host. External commands go to control pages through `/live/commands`; the existing `/live/events` stream for OBS is separate. Connection counts can take until a keepalive to notice closed pages.

## Repository layout

```
index.html                  WebUI (static HTML, no build step); resolves the model via model.config.json
stream.html                 Streaming page (avatar only, for OBS)
web/                        WebUI modules (plain JavaScript with JSDoc types; no build step):
                            camera tracking, recording, streaming relay, loop playback
vendor/mediapipe/           MediaPipe face/pose models and licenses used by camera tracking
tools/
  serve.py                  Local server: static files, relay to stream.html, saving recordings
  setup_model.py            Place a model (zip/folder → models/) + generate model.config.json
  analyze_model.py          Analyze parameters, value ranges, physics outputs
  gen_motions.py            Generation engine (model-agnostic); builds + registers motions from definitions (idempotent)
  recording_edits.py        Non-destructive trim, smoothing and speed processing for recordings
  shared_motions.py         Map opted-in normalized shared motions to each model
  shared_expressions.py     Map shared expression blends to each model's safe ranges
  validate_motions.py       Independently implemented validator
  verify_browser.sh         Real-rendering verification with headless Chrome (--loop: seam check)
                            (assumes the macOS Chrome path; override with env CHROME)
motion-defs/<model>.py      Motion definitions (creative content, one file per model)
                            [git-ignored; only the bundled sample is tracked]
motion-defs/shared/*.py     Tracked motion/expression packs shared by opted-in models
AGENTS.md                   Working guide for AI agents
model.config.json           [git-ignored] current model configuration (generated by setup_model.py)
local-assets/ , models/     [git-ignored] Live2D model data (not included for licensing reasons)
```

## License

The original parts of this repository (HTML / scripts / documentation) are licensed under the [MIT License](LICENSE).

The following are NOT covered by MIT and are subject to their own licenses:

- **Live2D sample model "Hiyori"**: covered by the [Live2D Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html); redistribution is prohibited, so it is not included here. Download it yourself from the [official distribution page](https://www.live2d.com/en/learn/sample/momose-hiyori/). The copyright of the model shown in the README screenshot belongs to Live2D Inc.
- **Live2D Cubism Core** (`live2dcubismcore.min.js`): loaded by the WebUI from the official Live2D CDN ([Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)). This repository does not redistribute the Core itself. If you release a product embedding the SDK as a business, a [publication license](https://www.live2d.com/en/sdk/license/) may be required depending on your business scale.
- **PixiJS / pixi-live2d-display**: loaded from CDNs (both MIT licensed).
- **MediaPipe** (`@mediapipe/tasks-vision`, Face Landmarker and Pose Landmarker Lite): Apache License 2.0. The runtime is loaded from jsDelivr; the models and licenses are in `vendor/mediapipe/`.
