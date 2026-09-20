#!/usr/bin/env python3
"""Static dev server for E-Ride.

Also provides two tiny endpoints the game uses when it detects a dev server:
  POST /__save?name=<file>   the in-game trailer recorder drops its capture here
  POST /__feedback           player suggestions/bug reports -> feedback/inbox.json
                             and a regenerated SUGGESTIONS.md
Neither exists on GitHub Pages; the game degrades gracefully without them.
"""
import datetime
import http.server
import json
import os
import re
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3495
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
NL = "\n"


def write_markdown(inbox):
    """Keep SUGGESTIONS.md in sync so the next update has a ready to-do list."""
    order = {"approved": 0, "new": 1, "shipped": 2, "rejected": 3}
    items = sorted(inbox, key=lambda x: (order.get(x.get("status"), 9),
                                         -x.get("votes", 1), -x.get("at", 0)))
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = ["# E-Ride - player suggestions", "",
             "_auto-generated %s - %d report(s)_" % (stamp, len(items)), ""]
    sections = (("approved", "## Approved - build these next"),
                ("new", "## Awaiting review"),
                ("shipped", "## Shipped"),
                ("rejected", "## Rejected"))
    for status, heading in sections:
        group = [i for i in items if i.get("status") == status]
        if not group:
            continue
        lines += [heading, ""]
        for i in group:
            lines.append("- **#%s %s** `%s` - %s vote(s) - from %s" % (
                i.get("n"), i.get("title", ""), i.get("kind", "idea"),
                i.get("votes", 1), i.get("from", "anon")))
            if i.get("detail"):
                for dl in str(i["detail"]).splitlines():
                    lines.append("  > " + dl)
            c = i.get("context") or {}
            if c:
                lines.append("  <sub>%s (%s, %s) - %s - %s fps - v%s</sub>" % (
                    c.get("district") or "?", c.get("x"), c.get("z"),
                    c.get("vehicle", "?"), c.get("fps", "?"), i.get("version", "?")))
            lines.append("")
    with open(os.path.join(ROOT, "SUGGESTIONS.md"), "w", encoding="utf-8") as f:
        f.write(NL.join(lines))


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.startswith("/__feedback"):
            return self.handle_feedback()
        if self.path.startswith("/__save"):
            return self.handle_save()
        self.send_error(404)

    def handle_save(self):
        name = "capture.bin"
        m = re.search(r"[?&]name=([A-Za-z0-9._-]+)", self.path)
        if m:
            name = m.group(1)
        total = int(self.headers.get("Content-Length", 0))
        out = os.path.join(ROOT, "capture")
        os.makedirs(out, exist_ok=True)
        dest = os.path.join(out, name)
        remaining = total
        with open(dest, "wb") as f:
            while remaining > 0:
                chunk = self.rfile.read(min(1 << 20, remaining))
                if not chunk:
                    break
                f.write(chunk)
                remaining -= len(chunk)
        sys.stderr.write("saved %s (%d bytes)%s" % (dest, total, NL))
        self._json({"ok": True, "bytes": total, "path": dest})

    def handle_feedback(self):
        n = int(self.headers.get("Content-Length", 0))
        try:
            item = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            self.send_error(400)
            return
        os.makedirs(os.path.join(ROOT, "feedback"), exist_ok=True)
        path = os.path.join(ROOT, "feedback", "inbox.json")
        try:
            with open(path, encoding="utf-8") as f:
                inbox = json.load(f)
        except Exception:
            inbox = []
        inbox = [x for x in inbox if x.get("id") != item.get("id")]
        inbox.append(item)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(inbox, f, indent=2)
        write_markdown(inbox)
        sys.stderr.write("feedback #%s [%s] %r%s" % (
            item.get("n"), item.get("status"), item.get("title"), NL))
        self._json({"ok": True})

    def log_message(self, fmt, *args):
        sys.stderr.write((fmt % args) + NL)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """Threaded: a single stalled keep-alive connection must not be able to
    wedge the whole server, which a plain TCPServer happily does."""
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("", PORT), Handler) as httpd:
        print("E-Ride client  ->  http://localhost:%d" % PORT)
        print("  POST /__save?name=...  and  POST /__feedback  are enabled")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("bye")
