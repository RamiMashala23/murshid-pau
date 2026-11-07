import json
import re
import threading
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

from .rag import MODEL, ProviderError

from collections import deque
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from time import monotonic

SITE_ORIGIN = "https://murshid-academic-advisor.xramimashala.chatgpt.site"

class MurshidServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 12

    def __init__(self, advisor, port=8000, html_path=None):
        self.advisor = advisor
        self.request_times = deque()
        self.rate_lock = threading.Lock()
        self.capacity = threading.BoundedSemaphore(2)
        self.html = None
        if html_path is not None:
            html = Path(html_path).read_text(encoding="utf-8")
            html, count = re.subn(r"const backend = \{ url: '[^']*', kind: '[^']*', endpoint: 'ask' \};",
                "const backend = { url: '/ask', kind: 'rest', endpoint: 'ask' };", html, count=1)
            if count != 1:
                raise ValueError("ملف واجهة مُرشد لا يحتوي إعداد الاتصال المتوقع.")
            self.html = html.encode("utf-8")
        self.allowed_origins = {SITE_ORIGIN, f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
        super().__init__(("127.0.0.1", port), MurshidHandler)
        actual_port = self.server_port
        self.allowed_origins.update({f"http://127.0.0.1:{actual_port}", f"http://localhost:{actual_port}"})

    def allow_request(self):
        with self.rate_lock:
            now = monotonic()
            while self.request_times and self.request_times[0] < now - 60:
                self.request_times.popleft()
            if len(self.request_times) >= 12:
                return False
            self.request_times.append(now)
            return True

class MurshidHandler(BaseHTTPRequestHandler):
    timeout = 10

    def log_message(self, format, *args):
        return

    def _send(self, status, data=None, content_type="application/json; charset=utf-8", extra=()):
        if isinstance(data, bytes):
            body = data
        elif data is not None:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        else:
            body = b""
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self.headers.get("Origin")
        if origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, ngrok-skip-browser-warning")
        for name, value in extra:
            self.send_header(name, value)
        self.end_headers()
        if body:
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _error(self, status, code, message, extra=()):
        self._send(status, {"status": "error", "code": code, "answer": message, "sources": []}, extra=extra)

    def _path(self):
        return urlsplit(self.path).path.rstrip("/") or "/"

    def do_OPTIONS(self):
        if self._path() != "/ask":
            return self._error(404, "not_found", "المسار غير موجود.")
        if self.headers.get("Origin") not in self.server.allowed_origins:
            return self._error(403, "origin_denied", "هذا الموقع غير مسموح له بالاتصال.")
        self._send(204)

    def do_GET(self):
        path = self._path()
        if path == "/health":
            return self._send(200, {"status": "ok", "model": MODEL,
                "indexed_units": len(self.server.advisor.knowledge.rows),
                "provider_configured": bool(self.server.advisor.key)})
        if path == "/" and self.server.html:
            return self._send(200, self.server.html, "text/html; charset=utf-8")
        if path == "/docs" or path == "/":
            return self._send(200, {"ask": {"method": "POST", "path": "/ask",
                "body": {"question": "كم ساعة لبكالوريوس الذكاء الاصطناعي؟"},
                "response": {"status": "ok | insufficient_evidence", "answer": "...", "sources": []}},
                "health": "/health"})
        self._error(404, "not_found", "المسار غير موجود.")

    def do_POST(self):
        if self._path() != "/ask":
            return self._error(404, "not_found", "المسار غير موجود.")
        origin = self.headers.get("Origin")
        if origin and origin not in self.server.allowed_origins:
            return self._error(403, "origin_denied", "هذا الموقع غير مسموح له بالاتصال.")
        if self.headers.get_content_type() != "application/json":
            return self._error(415, "content_type", "أرسل السؤال بصيغة JSON.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._error(400, "invalid_length", "حجم الطلب غير صالح.")
        if not 1 <= length <= 8192:
            return self._error(413, "invalid_length", "حجم الطلب خارج الحد المسموح.")
        try:
            data = json.loads(self.rfile.read(length))
        except (UnicodeError, ValueError, TimeoutError):
            return self._error(400, "invalid_json", "صيغة الطلب غير صالحة.")
        question = data.get("question") if isinstance(data, dict) else None
        if not isinstance(question, str) or not 1 <= len(question.strip()) <= 600:
            return self._error(422, "invalid_question", "اكتب سؤالًا من حرف واحد إلى 600 حرف.")
        if not self.server.capacity.acquire(blocking=False):
            return self._error(429, "busy", "الخدمة مشغولة. جرّب بعد قليل.", (("Retry-After", "5"),))
        try:
            if not self.server.allow_request():
                return self._error(429, "rate_limit", "وصلت لحد الطلبات. جرّب بعد دقيقة.",
                    (("Retry-After", "60"),))
            return self._send(200, self.server.advisor.ask(question))
        except ProviderError as error:
            if error.status in {401, 403}:
                return self._error(503, "provider_auth", "تعذّر توصيل النموذج. افحص إعداد مفتاح Groq.")
            if error.status == 429:
                return self._error(429, "provider_rate_limit", "وصل النموذج لحد الاستخدام. جرّب بعد دقيقة.",
                    (("Retry-After", "60"),))
            return self._error(502, "provider_error", "تعذّر الاتصال بالنموذج. جرّب مرة ثانية.")
        finally:
            self.server.capacity.release()

@contextmanager
def running_api(advisor, port=8000, html_path=None):
    with MurshidServer(advisor, port, html_path) as server:
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}"
        finally:
            server.shutdown()
            worker.join(timeout=3)

def start_api(advisor, port=8000, html_path=None):
    # Notebook cells can be run again without leaving another listener on this port.
    stop_api()
    server = MurshidServer(advisor, port, html_path)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    globals()["api_server"] = server
    globals()["api_thread"] = thread
    return f"http://127.0.0.1:{server.server_port}"

def stop_api():
    server = globals().pop("api_server", None)
    worker = globals().pop("api_thread", None)
    if server is not None:
        server.shutdown()
        server.server_close()
        worker.join(timeout=3)

def api_question(base_url, question):
    request = urllib.request.Request(base_url.rstrip("/") + "/ask",
        data=json.dumps({"question": question}, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=35) as response:
        return json.load(response)
