"""Expression-differential sheet: build from the script, spend guard, mock reference edits,
pose-lock check and apply. No real API key, paid service, or remote call."""
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from PIL import Image, ImageDraw

SKILL = Path(__file__).resolve().parents[1]
SHEET = [sys.executable, str(SKILL / "scripts/expression_sheet.py")]


def figure(face=(250, 220, 200, 255), shift=0):
    im = Image.new("RGBA", (300, 600), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((70 + shift, 230, 230 + shift, 590), fill=(40, 110, 220, 255))   # body
    d.ellipse((90, 40, 210, 200), fill=face)                                     # head
    return im


class ExpressionSheetTest(unittest.TestCase):
    def test_build_generate_check_apply(self):
        edits = []
        good = io.BytesIO()
        figure(face=(255, 200, 200, 255)).save(good, format="PNG")
        payload = base64.b64encode(good.getvalue()).decode()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                self.rfile.read(int(self.headers["Content-Length"]))
                edits.append(self.path)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"data": [{"b64_json": payload}]}).encode())
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with tempfile.TemporaryDirectory(prefix="vm-expr-") as folder:
                root = Path(folder)
                (root / "assets/art").mkdir(parents=True)
                figure().save(root / "assets/art/a.png")
                figure().save(root / "assets/art/b.png")
                program = {"genre": "studio", "hosts": [
                    {"id": "host-a", "name": "蓝", "expressions": {"neutral": "assets/art/a.png"}},
                    {"id": "host-b", "name": "白", "master": "assets/art/b.png"}],
                    "lines": [{"speaker": "host-a", "text": "大家好，欢迎来到演播室。", "expression": "smile"},
                              {"speaker": "host-b", "text": "今天讲一个关键问题。", "expression": "explain"},
                              {"speaker": "host-a", "text": "真的吗？", "expression": "surprised"}]}
                (root / "program.json").write_text(json.dumps(program, ensure_ascii=False), encoding="utf-8")
                built = subprocess.run(SHEET + ["build", "--project", str(root)], capture_output=True, text=True, encoding="utf-8")
                self.assertEqual(built.returncode, 0, built.stderr)
                sheet = json.loads((root / "expression_sheet.json").read_text(encoding="utf-8"))
                keys = {(r["host"], r["key"]): r for r in sheet["rows"]}
                for need in [("host-a", "neutral"), ("host-a", "neutral_talk"), ("host-a", "smile"), ("host-a", "smile_talk"),
                             ("host-a", "surprised"), ("host-b", "explain_talk")]:
                    self.assertIn(need, keys)
                self.assertEqual(keys[("host-a", "neutral")]["status"], "master")
                self.assertEqual(keys[("host-a", "smile")]["lines"], [0])
                self.assertIn("只改脸部", keys[("host-a", "smile")]["prompt_zh"])
                md = (root / "expression_sheet.md").read_text(encoding="utf-8")
                self.assertIn("人物差分要求表", md)
                self.assertIn("`smile_talk`", md)

                (root / "asset_tools.json").write_text(json.dumps({"image_path": "builtin", "backend": None}))
                (root / ".env").write_text("OPENAI_API_KEY=mock-key-123456\nOPENAI_MODEL=mock-edit\nOPENAI_QUALITY=omit\n"
                                           f"OPENAI_BASE_URL=http://127.0.0.1:{server.server_port}/v1\nOPENAI_RESPONSE_FORMAT=b64_json\n")
                env = {k: v for k, v in os.environ.items() if not k.startswith(("OPENAI_", "IMAGE_"))}
                denied = subprocess.run(SHEET + ["generate", "--project", str(root), "--backend", "openai"],
                                        capture_output=True, text=True, env=env)
                self.assertNotEqual(denied.returncode, 0)
                self.assertIn("--authorize-requests", denied.stderr + denied.stdout)
                self.assertEqual(edits, [])
                ran = subprocess.run(SHEET + ["generate", "--project", str(root), "--authorize-requests", "--backend", "openai",
                                              "--host", "host-a", "--only", "smile,smile_talk"],
                                     capture_output=True, text=True, encoding="utf-8", env=env)
                self.assertEqual(ran.returncode, 0, ran.stdout + ran.stderr)
                self.assertEqual(len(edits), 2)
                self.assertTrue(all(p.endswith("/images/edits") for p in edits), edits)
                self.assertTrue((root / "assets/art/hosts/host-a/smile.png").is_file())

                # a redrawn body must fail the pose lock
                figure(shift=40).save(root / "assets/art/hosts/host-a/surprised.png")
                data = json.loads((root / "expression_sheet.json").read_text(encoding="utf-8"))
                for r in data["rows"]:
                    if r["host"] == "host-a" and r["key"] == "surprised":
                        r["status"] = "generated"
                (root / "expression_sheet.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
                checked = subprocess.run(SHEET + ["check", "--project", str(root)], capture_output=True, text=True, encoding="utf-8")
                self.assertEqual(checked.returncode, 0, checked.stderr)
                failed = {f["key"] for f in json.loads(checked.stdout)["failed"]}
                self.assertEqual(failed, {"surprised"})
                applied = subprocess.run(SHEET + ["apply", "--project", str(root)], capture_output=True, text=True, encoding="utf-8")
                self.assertEqual(applied.returncode, 0, applied.stderr)
                program = json.loads((root / "program.json").read_text(encoding="utf-8"))
                exprs = program["hosts"][0]["expressions"]
                self.assertEqual(exprs["smile_talk"], "assets/art/hosts/host-a/smile_talk.png")
                self.assertNotIn("surprised", exprs)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
