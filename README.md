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

## Using the WebUI

- Play the newly added motions from the highlighted card (★ buttons); existing motions are in the collapsible sections below
- **Drag** the avatar to move it, **mouse wheel / pinch** to zoom around the cursor, and "Reset view" to restore the initial placement
- The card splits one-shot actions ("単発アクション") from loop motions ("ループ"). The motion that is playing is highlighted ("▶ 再生中" for a one-shot, a pulsing "⟳ ループ中" for a loop)
- A loop repeats until you press "■ ループ停止" (stop loop; only enabled while a loop plays) or play another motion
- "リップシンク" (lip sync) moves the mouth on top of any motion, one-shot or loop, to show how the avatar looks while speaking. Modes: OFF (the motion's own mouth), 疑似 (a simulated rhythm), 音声 (follows the loudness of an audio file you drop in or pick) and マイク (follows your microphone)
- The panel has two tabs: "モーション" (motions: everything above) and "カメラ" (camera: face tracking, recording and the streaming mode for OBS; see [Camera tracking and streaming](#camera-tracking-and-streaming)). The camera keeps running when you switch tabs, so you can play emotion motions while it drives the face; a red dot on the tab shows that it is on
- Debug query parameters: `?play=Action:0` (auto-play), `&freeze=1.2` (freeze the pose at a given second), `&cycles=3` (end a loop motion after its 3rd cycle), `&lipsync=1` (simulated lip sync; `&lipsync=mic` for the microphone), `&audio=<url>` (lip-sync to an audio file), `&tab=camera` (open the camera tab), `&camera=1` (start the camera on load), `&fakeface=1` (synthetic face movement, no camera), `&record=N` (record N seconds and save; `&recordloop=1` as a loop), `?uitest=1` (automated drag/zoom test)

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

Open the "カメラ" tab and press "● カメラ開始" (start camera). The avatar follows your head, eyes, gaze, mouth, brows and smile. The face you show first is taken as the front-facing, relaxed face; "正面をリセット" sets it again. Sensitivity, smoothing and mirroring can be adjusted (mirroring, moving like your reflection, is off by default). "映像を隠す" (hide image) hides the camera image, for example before taking a screenshot, while tracking continues; the choice is remembered, and `&preview=0` in the URL starts with it hidden.

The face is layered on top of the playing motion: play an emotion such as a sad loop and the sad brows stay while your head and mouth move the avatar.

Camera frames are processed in the browser (a Web Worker running MediaPipe Face Landmarker) and are never sent anywhere. The MediaPipe runtime is loaded from jsDelivr, pinned to version 0.10.21 (later versions add metrics reporting to an external service), and the face model is bundled in `vendor/mediapipe/`.

### Recording a performance as a motion

While the camera runs, "● 録画開始" (start recording) records your face for up to 60 seconds. Give it a name and save it; check "ループとして保存" (save as a loop) for a motion to play while speaking. Then run:

```bash
python3 tools/gen_motions.py   # the recording becomes a motion in the Action group
python3 tools/validate_motions.py
```

With `python3 tools/serve.py` the file is saved to `motion-defs/recordings/<model-name>/` (git-ignored, like the definitions); with another server it is downloaded and you move it there. The recording stores what your face adds to each parameter, so the idle or emotion motion that happened to be playing is not baked in. The generator puts it back on the model's base pose, keeps it within the observed value ranges, reduces it to keyframes, and eases in from and out to the base pose (a loop instead blends its end into its start and leaves out the lip-sync parameters). The result passes `validate_motions.py` as is.

### Streaming mode (OBS)

1. Start the server with `python3 tools/serve.py`. The streaming mode needs it; `python3 -m http.server` cannot relay
2. In the "配信モード" card of the "カメラ" tab, choose the background (transparent, green or blue) and copy the URL of `stream.html`
3. In OBS, add a "Browser" source with that URL

`stream.html` shows only the avatar. Motions, the camera face and the lip sync from the control page are mirrored to it through the local server. Only these parameters are relayed, never camera or microphone data, and the server listens on 127.0.0.1 only.

## Repository layout

```
index.html                  WebUI (static HTML, no build step); resolves the model via model.config.json
stream.html                 Streaming page (avatar only, for OBS)
web/                        WebUI modules (plain JavaScript with JSDoc types; no build step):
                            camera tracking, recording, streaming relay, loop playback
vendor/mediapipe/           MediaPipe face model (Apache-2.0) used by the camera tracking
tools/
  serve.py                  Local server: static files, relay to stream.html, saving recordings
  setup_model.py            Place a model (zip/folder → models/) + generate model.config.json
  analyze_model.py          Analyze parameters, value ranges, physics outputs
  gen_motions.py            Generation engine (model-agnostic); builds + registers motions from definitions (idempotent)
  validate_motions.py       Independently implemented validator
  verify_browser.sh         Real-rendering verification with headless Chrome (--loop: seam check)
                            (assumes the macOS Chrome path; override with env CHROME)
motion-defs/<model>.py      Motion definitions (creative content, one file per model)
                            [git-ignored; only the bundled sample is tracked]
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
- **MediaPipe** (`@mediapipe/tasks-vision` and the Face Landmarker model): Apache License 2.0. The runtime is loaded from jsDelivr; the model and its license are in `vendor/mediapipe/`.
