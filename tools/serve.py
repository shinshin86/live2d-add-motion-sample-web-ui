#!/usr/bin/env python3
"""Local server for the WebUI: serves the repository as static files and relays
live messages from the control page (index.html) to the streaming page
(stream.html), e.g. an OBS browser source.

Endpoints besides the static files:
  GET  /live/status        {"relay": true} (the WebUI checks for the relay with it)
  POST /live/send          one JSON message from the control page
  GET  /live/events        Server-Sent Events stream of those messages
  POST /recordings         save a camera recording (web/recorder.js) as
                           motion-defs/recordings/<model>/<id>.json, then
                           generate and validate motions before replying
  GET  /__verify_hold?s=N  answers after N seconds (tools/verify_browser.sh)

Only small JSON objects with a known "type" are relayed. Camera frames and
microphone audio never reach this server: the control page sends only the
resulting parameters (head angles, mouth openness, ...) and motion commands.

The server binds to 127.0.0.1, so other machines cannot reach it, and it only
accepts POSTs with a JSON content type from its own pages, so other websites
open in the browser cannot post to it.

Usage: python3 tools/serve.py [--port 8765]
"""
import argparse
import http.server
import json
import math
import os
import queue
import re
import subprocess
import sys
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
clients_lock = threading.Lock()
recordings_lock = threading.Lock()  # serialize writes and model regeneration


def current_model_stem():
    """The model3.json stem from model.config.json (recordings go only there)."""
    with open(os.path.join(ROOT, "model.config.json")) as fh:
        return os.path.basename(json.load(fh)["model3"]).replace(".model3.json", "")


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
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/live/events":
            self.stream_events()
        elif url.path == "/live/status":
            body = b'{"relay":true,"recordingsVersion":2}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
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
        if not self.same_origin_json():
            self.send_error(403)
            return
        path = urllib.parse.urlparse(self.path).path
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

    def stream_events(self):
        q = queue.Queue(maxsize=64)
        with clients_lock:
            clients.add(q)
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
                clients.discard(q)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
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
