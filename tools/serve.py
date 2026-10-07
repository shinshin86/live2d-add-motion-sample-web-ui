#!/usr/bin/env python3
"""Local server for the WebUI: serves the repository as static files and relays
live messages from the control page (index.html) to the streaming page
(stream.html), e.g. an OBS browser source.

Endpoints besides the static files:
  GET  /live/status        {"relay": true} (the WebUI checks for the relay with it)
  POST /live/send          one JSON message from the control page
  GET  /live/events        Server-Sent Events stream of those messages
  GET  /__verify_hold?s=N  answers after N seconds (tools/verify_browser.sh)

Only small JSON objects with a known "type" are relayed. Camera frames and
microphone audio never reach this server: the control page sends only the
resulting parameters (head angles, mouth openness, ...) and motion commands.

The server binds to 127.0.0.1, so other machines cannot reach it.

Usage: python3 tools/serve.py [--port 8765]
"""
import argparse
import http.server
import json
import os
import queue
import sys
import threading
import time
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MESSAGE_TYPES = {"pose", "motion", "stop"}  # see web/relay.js
MAX_MESSAGE_BYTES = 4096
KEEPALIVE_SECONDS = 15

clients = set()  # one queue per connected /live/events stream
clients_lock = threading.Lock()


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

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/live/events":
            self.stream_events()
        elif url.path == "/live/status":
            body = b'{"relay":true}'
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

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/live/send":
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
    print(f"serving http://localhost:{args.port}  (stream page: http://localhost:{args.port}/stream.html)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
