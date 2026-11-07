"""Run the Murshid website and local RAG API on the same loopback origin."""
import argparse
import base64
import json
import tempfile
import urllib.request
from pathlib import Path

from model.api import MurshidServer, api_question, running_api
from model.rag import make_advisor

WEB = Path(__file__).resolve().parent / "web"

def embedded_page():
    html = (WEB / "index.html").read_text(encoding="utf-8")
    css = (WEB / "styles.css").read_text(encoding="utf-8")
    script = (WEB / "app.js").read_text(encoding="utf-8")
    logo = base64.b64encode((WEB / "assets/pau-logo.png").read_bytes()).decode("ascii")
    font = base64.b64encode((WEB / "assets/pau-arabic.woff2").read_bytes()).decode("ascii")
    html = html.replace("assets/pau-logo.png", "data:image/png;base64," + logo)
    css = css.replace("assets/pau-arabic.woff2", "data:font/woff2;base64," + font)
    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}\n</style>")
    html = html.replace('<script src="app.js" defer></script>', "")
    return html.replace("</body>", f"<script>\n{script}\n</script>\n</body>")

def check(advisor, html_path):
    with running_api(advisor, port=0, html_path=html_path) as base:
        with urllib.request.urlopen(base + "/health", timeout=5) as response:
            health = json.load(response)
        if health["indexed_units"] < 1:
            raise RuntimeError("University corpus is empty")
        with urllib.request.urlopen(base + "/", timeout=5) as response:
            page = response.read().decode("utf-8")
        if "url: '/ask'" not in page or "data:image/png;base64," not in page:
            raise RuntimeError("Website is missing local API wiring or assets")
        for question, expected, source in [
            ("كم ساعة لبكالوريوس الذكاء الاصطناعي؟", "133", "page_id=145638"),
            ("أنا طالب إدارة وتأمين مخاطر، قطعت 80 ساعة، كم ضايل؟", "55", "page_id=16232"),
            ("كيف ممكن أنسحب من الجامعة؟", "البوابة الأكاديمية", "#page=17"),
        ]:
            result = api_question(base, question)
            if (result["status"] != "ok" or expected not in result["answer"]
                    or not any(source in entry["url"] for entry in result["sources"])):
                raise RuntimeError(f"Incorrect result for {question}")
        if api_question(base, "كم سعر الشاي اليوم في المقصف؟")["status"] != "insufficient_evidence":
            raise RuntimeError("Expected a refusal outside the corpus")
    print("Passed: website, local API, program credits, withdrawal procedure, and refusal.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--check", action="store_true", help="Run offline integration checks and exit.")
    args = parser.parse_args()
    advisor = make_advisor(key="" if args.check else None)
    with tempfile.TemporaryDirectory(prefix="murshid-") as folder:
        html_path = Path(folder) / "index.html"
        html_path.write_text(embedded_page(), encoding="utf-8")
        if args.check:
            check(advisor, html_path)
            return
        with MurshidServer(advisor, args.port, html_path) as server:
            print(f"Murshid: http://127.0.0.1:{server.server_port}/", flush=True)
            if not advisor.key:
                print("Source-backed catalog examples work offline. Set GROQ_API_KEY for generated answers.", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass

if __name__ == "__main__":
    main()
