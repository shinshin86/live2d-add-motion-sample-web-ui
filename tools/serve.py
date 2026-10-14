#!/usr/bin/env python3
"""Local server for the WebUI: serves the repository as static files and relays
live messages from the control page (index.html) to the streaming page
(stream.html), e.g. an OBS browser source.

Endpoints besides the static files:
  GET  /live/status        relay capabilities, stream clients, and controllers
  GET  /live/models        installed models and the current model name
  POST /live/model         select an installed model (same-origin JSON)
  POST /live/send          one JSON message from the control page
  GET  /live/events        Server-Sent Events stream of those messages
  POST /live/motion        authenticated motion ID/name or stop from external apps
  GET  /live/commands      Server-Sent Events for control pages (separate from events)
  GET  /live/token         read the persistent external-control token
  POST /live/token         regenerate the token (same-origin JSON)
  POST /recordings         save a camera recording (web/recorder.js) as
                           motion-defs/recordings/<model>/<id>.json, then
                           generate and validate motions before replying
  GET  /__verify_hold?s=N  answers after N seconds (tools/verify_browser.sh)

Only small JSON objects with a known "type" are relayed. Camera frames and
microphone audio never reach this server: the control page sends only the
resulting parameters (head angles, mouth openness, ...) and motion commands.

The server binds to 127.0.0.1, so other machines cannot reach it. POSTs require
JSON and reject cross-origin browser requests; external apps may omit Origin.
External motion commands require a token persisted in the git-ignored .live-token.

Usage: python3 tools/serve.py [--port 8765]
"""
import argparse
import glob
import hmac
import http.server
import json
import math
import os
import queue
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MESSAGE_TYPES = {"pose", "motion", "stop"}  # see web/relay.js
MAX_MESSAGE_BYTES = 4096
MAX_RECORDING_BYTES = 4 * 1024 * 1024
RECORDING_MODES = {"add", "multiply", "replace"}
KEEPALIVE_SECONDS = 15

clients = set()  # one queue per connected /live/events stream
controllers = set()  # separate queues for /live/commands
clients_lock = threading.Lock()
recordings_lock = threading.Lock()  # serialize writes and model regeneration
token_lock = threading.Lock()


def live_token(regenerate=False):
    """Persist across restarts; replace atomically so readers never see a partial token."""
    path = os.path.join(ROOT, ".live-token")
    with token_lock:
        if not regenerate:
            try:
                with open(path, encoding="utf-8") as fh:
                    token = fh.read().strip()
                if token:
                    return token
            except FileNotFoundError:
                pass
        token = secrets.token_urlsafe(24)
        with tempfile.NamedTemporaryFile(mode="w", dir=ROOT, prefix=".live-token-", delete=False) as fh:
            temporary = fh.name  # NamedTemporaryFile creates it with mode 0600
            fh.write(token + "\n")
        try:
            if regenerate:
                os.replace(temporary, path)
            else:
                try:
                    os.link(temporary, path)  # another server may have created it first
                except FileExistsError:
                    with open(path, encoding="utf-8") as fh:
                        token = fh.read().strip()
                    if not token:
                        raise ValueError(".live-token is empty; remove it before restarting")
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        return token


def action_entries():
    """Read each request so newly saved recordings are available immediately."""
    with open(os.path.join(ROOT, "model.config.json"), encoding="utf-8") as fh:
        model_path = json.load(fh)["model3"]
    with open(os.path.join(ROOT, model_path), encoding="utf-8") as fh:
        return json.load(fh)["FileReferences"].get("Motions", {}).get("Action", [])


def motion_id(entry):
    return os.path.basename(entry["File"]).removesuffix(".motion3.json")


def current_model_stem():
    """The model3.json stem from model.config.json (recordings go only there)."""
    with open(os.path.join(ROOT, "model.config.json")) as fh:
        return os.path.basename(json.load(fh)["model3"]).replace(".model3.json", "")


def installed_models():
    """Only the single directory level created by setup_model.py."""
    paths = sorted(glob.glob(os.path.join(ROOT, "models", "*", "*.model3.json")))
    return sorted([
        {"name": os.path.basename(path).removesuffix(".model3.json"),
         "model3": os.path.relpath(path, ROOT).replace(os.sep, "/")}
        for path in paths if os.path.isfile(path)
    ], key=lambda model: model["name"])


def configured_model():
    """A missing or malformed config has no current model."""
    try:
        with open(os.path.join(ROOT, "model.config.json"), encoding="utf-8") as fh:
            path = json.load(fh)["model3"]
        if isinstance(path, str) and path.endswith(".model3.json"):
            return os.path.basename(path).removesuffix(".model3.json") or None
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


def valid_recording(rec):
    """Check a recording against web/recorder.js's format before writing it."""
    if not isinstance(rec, dict) or rec.get("version") != 1 or rec.get("fps") != 30:
        return False
    # the motion name chosen in the WebUI; it becomes the file and motion name
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,47}", str(rec.get("id"))):
        return False
    if not isinstance(rec.get("label"), str) or not 0 < len(rec["label"]) <= 40:
        return False
    if "recordedAt" in rec and (not isinstance(rec["recordedAt"], str) or len(rec["recordedAt"]) > 64):
        return False
    if not isinstance(rec.get("loop"), bool):
        return False
    duration = rec.get("duration")
    if not isinstance(duration, (int, float)) or not 1 <= duration <= 60:
        return False
    params = rec.get("params")
    if not isinstance(params, dict) or not 0 < len(params) <= 64:
        return False
    frames = round(duration * 30) + 1
    for pid, entry in params.items():
        if not re.fullmatch(r"Param\w{1,60}", pid) or not isinstance(entry, dict):
            return False
        values = entry.get("values")
        if entry.get("mode") not in RECORDING_MODES or not isinstance(values, list) or len(values) != frames:
            return False
        if not all(isinstance(v, (int, float)) and math.isfinite(v) and abs(v) <= 100 for v in values):
            return False
    return True


def broadcast(payload):
    with clients_lock:
        for q in clients:
            try:
                q.put_nowait(payload)
            except queue.Full:
                pass  # a stalled client drops messages rather than blocking others


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, format, *args):
        pass  # the relay posts ~30 messages per second; keep the console quiet

    def end_headers(self):
        # always revalidate, so a reload picks up edited modules and regenerated motions
        self.send_header("Cache-Control", "no-store" if self.path.split("?")[0] == "/live/token" else "no-cache")
        super().end_headers()

    def json_reply(self, code, body):
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def local_host(self):
        port = self.server.server_port
        return self.headers.get("Host") in {f"localhost:{port}", f"127.0.0.1:{port}"}

    def send_head(self):
        # Static serving must not bypass the token endpoint's Host check (also HEAD).
        path = os.path.realpath(self.translate_path(self.path))
        if os.path.dirname(path) == os.path.realpath(ROOT) and os.path.basename(path).startswith(".live-token"):
            self.send_error(403)
            return None
        return super().send_head()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path in {"/live/token", "/live/commands", "/live/motion"} and not self.local_host():
            self.json_reply(403, {"error": "localhost または 127.0.0.1 を使用してください"})
            return
        if url.path == "/live/events":
            self.stream_events(clients)
        elif url.path == "/live/commands":
            self.stream_events(controllers)
        elif url.path == "/live/token":
            self.json_reply(200, {"token": live_token()})
        elif url.path == "/live/status":
            with clients_lock:
                connected = len(clients)
                controlling = len(controllers)
            self.json_reply(200, {"relay": True, "recordingsVersion": 2, "clients": connected,
                                  "motionRemote": 1, "controllers": controlling, "modelSwitch": 1})
        elif url.path == "/live/models":
            self.json_reply(200, {"current": configured_model(), "models": installed_models()})
        elif url.path == "/__verify_hold":
            time.sleep(float(urllib.parse.parse_qs(url.query).get("s", ["0"])[0]))
            self.send_response(204)
            self.end_headers()
        else:
            super().do_GET()

    def same_origin_json(self):
        """A JSON POST from this server's own pages. Cross-site pages can only send
        a JSON content type after a CORS preflight, which this server never grants."""
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return False
        origin = self.headers.get("Origin")
        return origin is None or urllib.parse.urlparse(origin).netloc == self.headers.get("Host")

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path in {"/live/token", "/live/motion", "/live/model"} and not self.local_host():
            self.json_reply(403, {"error": "localhost または 127.0.0.1 を使用してください"})
            return
        if path == "/live/motion":
            bearer = self.headers.get("Authorization", "")
            supplied = [self.headers.get("X-Live-Token", "")]
            if bearer.startswith("Bearer "):
                supplied.append(bearer[7:])
            token = live_token().encode()
            if not any(hmac.compare_digest(value.encode(), token) for value in supplied):
                self.json_reply(401, {"error": "トークンが一致しません"})
                return
        if not self.same_origin_json():
            self.send_error(403)
            return
        if path in {"/live/token", "/live/motion", "/live/model"}:
            message = self.read_command()
            if message is None:
                return
            if path == "/live/token":
                self.json_reply(200, {"token": live_token(regenerate=True)})
            elif path == "/live/model":
                self.switch_model(message)
            else:
                self.send_motion_command(message)
            return
        if path == "/recordings":
            self.save_recording()
            return
        if path != "/live/send":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_MESSAGE_BYTES:
            self.send_error(413)
            return
        try:
            message = json.loads(self.rfile.read(length))
        except ValueError:
            self.send_error(400)
            return
        if not isinstance(message, dict) or message.get("type") not in MESSAGE_TYPES:
            self.send_error(400)
            return
        broadcast(json.dumps(message, separators=(",", ":")))
        self.send_response(204)
        self.end_headers()

    def read_command(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.json_reply(400, {"error": "Content-Length が不正です"})
            return None
        if not 0 < length <= MAX_MESSAGE_BYTES:
            self.json_reply(413, {"error": "JSON のサイズが範囲外です"})
            return None
        try:
            message = json.loads(self.rfile.read(length))
        except ValueError:
            self.json_reply(400, {"error": "JSON が不正です"})
            return None
        if not isinstance(message, dict):
            self.json_reply(400, {"error": "JSON オブジェクトを指定してください"})
            return None
        return message

    def send_motion_command(self, message):
        if set(message) == {"stop"} and message["stop"] is True:
            command = {"type": "stop"}
        elif set(message) == {"motion"} and isinstance(message["motion"], str) and message["motion"]:
            try:
                entries = action_entries()
                matches = [e for e in entries if motion_id(e) == message["motion"]]
                if not matches:
                    matches = [e for e in entries if e.get("Name") == message["motion"]]
            except (OSError, ValueError, KeyError, TypeError):
                self.json_reply(503, {"error": "現在のモデルのモーション一覧を読み込めません"})
                return
            if not matches:
                self.json_reply(404, {"error": "モーションが見つかりません"})
                return
            if len(matches) != 1:
                self.json_reply(409, {"error": "モーション名が重複しています。固有の ID を指定してください"})
                return
            command = {"type": "motion", "id": motion_id(matches[0])}
        else:
            self.json_reply(400, {"error": "motion または stop: true を指定してください"})
            return
        with clients_lock:
            if not controllers:
                self.json_reply(503, {"error": "操作ページが開いていません"})
                return
            sent = False
            for q in controllers:
                try:
                    q.put_nowait(json.dumps(command, ensure_ascii=False, separators=(",", ":")))
                    sent = True
                except queue.Full:
                    pass
        if not sent:
            self.json_reply(503, {"error": "操作ページが応答していません"})
            return
        self.send_response(204)
        self.end_headers()

    def switch_model(self, message):
        with recordings_lock:
            model = next((entry for entry in installed_models() if entry["name"] == message.get("name")), None)
            if model is None:
                self.json_reply(404, {"error": "モデルが見つかりません"})
                return
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=ROOT,
                                                 prefix=".model.config-", delete=False) as fh:
                    temporary = fh.name
                    json.dump(model, fh, ensure_ascii=False, indent=2)
                    fh.write("\n")
                os.replace(temporary, os.path.join(ROOT, "model.config.json"))
            except OSError:
                self.json_reply(500, {"error": "モデル設定を保存できません"})
                return
            finally:
                if temporary and os.path.exists(temporary):
                    os.unlink(temporary)
            payload = json.dumps({"type": "model", "name": model["name"]}, separators=(",", ":"))
            with clients_lock:
                for q in clients | controllers:
                    try:
                        q.put_nowait(payload)
                    except queue.Full:
                        # A model change must reach even a client with queued poses.
                        try:
                            q.get_nowait()
                        except queue.Empty:
                            pass
                        q.put_nowait(payload)
            self.json_reply(200, {"name": model["name"]})

    def save_recording(self):
        with recordings_lock:
            self.save_recording_locked()

    def save_recording_locked(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_RECORDING_BYTES:
            self.send_error(413)
            return
        try:
            body = json.loads(self.rfile.read(length))
            stem = current_model_stem()
        except (ValueError, OSError, KeyError):
            self.send_error(400)
            return
        rec = body.get("recording") if isinstance(body, dict) else None
        if not isinstance(body, dict) or body.get("model") != stem:
            requested = body.get("model") if isinstance(body, dict) else None
            print(f"recording rejected: it is for model {requested!r}, the current model is {stem!r}")
            self.send_error(400, "not the current model")
            return
        if not valid_recording(rec):
            print("recording rejected: invalid recording data")
            self.send_error(400, "invalid recording")
            return
        folder = os.path.join(ROOT, "motion-defs", "recordings", stem)
        target = os.path.join(folder, f"{rec['id']}.json")
        if os.path.exists(target):
            print(f"recording rejected: {os.path.relpath(target, ROOT)} already exists")
            self.send_error(409)
            return
        os.makedirs(folder, exist_ok=True)
        with open(target, "w") as fh:
            json.dump(rec, fh, ensure_ascii=False, separators=(",", ":"))
            fh.write("\n")
        path = os.path.relpath(target, ROOT)
        print(f"recording saved: {path}", flush=True)
        error = None
        for script in ("gen_motions.py", "validate_motions.py"):
            try:
                result = subprocess.run(
                    [sys.executable, os.path.join(ROOT, "tools", script)],
                    cwd=ROOT, capture_output=True, text=True, timeout=120,
                )
                print(f"{script}: exit {result.returncode}\n{result.stdout}{result.stderr}", flush=True)
                if result.returncode != 0:
                    error = f"{script} が失敗しました。録画は保存済みです。サーバーのターミナルで詳細を確認してください"
                    break
            except (OSError, subprocess.TimeoutExpired) as exc:
                print(f"{script} failed: {exc}", flush=True)
                error = f"{script} を完了できませんでした。録画は保存済みです。サーバーのターミナルで詳細を確認してください"
                break
        reply = json.dumps({"path": path, "saved": True, "ready": error is None,
                            "error": error}, ensure_ascii=False).encode()
        self.send_response(500 if error else 201)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)

    def stream_events(self, subscribers):
        q = queue.Queue(maxsize=64)
        with clients_lock:
            subscribers.add(q)
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while True:
                try:
                    data = f"data: {q.get(timeout=KEEPALIVE_SECONDS)}\n\n"
                except queue.Empty:
                    data = ": keepalive\n\n"
                self.wfile.write(data.encode())
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # the page was closed
        finally:
            with clients_lock:
                subscribers.discard(q)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    live_token()
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as e:
        sys.exit(f"ERROR: cannot listen on 127.0.0.1:{args.port} ({e.strerror}). "
                 f"Another program may be using it; try --port {args.port + 1}.")
    server.daemon_threads = True
    print(f"serving http://localhost:{args.port}  (stream page: http://localhost:{args.port}/stream.html)",
          flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
