"""Local mock integration test. No real API key, paid service, or remote call."""
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
from PIL import Image

SKILL=Path(__file__).resolve().parents[1]


class ImageAdapterTest(unittest.TestCase):
    def test_external_mock_and_spend_guard(self):
        output=io.BytesIO()
        Image.new("RGB",(64,64),(40,170,140)).save(output,format="PNG")
        image=base64.b64encode(output.getvalue()).decode()
        requests=[]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):
                pass
            def do_POST(self):
                payload=json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                requests.append((self.path,payload))
                if payload.get("prompt")=="fail":
                    self.send_response(401)
                    content={"error":{"message":"invalid api key: mock-secret-123456"}}
                else:
                    self.send_response(200)
                    content={"data":[{"b64_json":image}]}
                self.send_header("Content-Type","application/json")
                self.end_headers()
                self.wfile.write(json.dumps(content).encode())
        server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
        worker=threading.Thread(target=server.serve_forever,daemon=True)
        worker.start()
        try:
            with tempfile.TemporaryDirectory(prefix="video-master-image-mock-") as folder:
                root=Path(folder)
                (root/"asset_tools.json").write_text(json.dumps({"image_path":"external","backend":"openai",
                    "configuration_variables":{"key":"OPENAI_API_KEY","model":"OPENAI_MODEL","base":"OPENAI_BASE_URL"}}))
                (root/".env").write_text(
                    "IMAGE_BACKEND=openai\nOPENAI_API_KEY=mock-secret-123456\n"
                    "OPENAI_MODEL=mock-image\nOPENAI_QUALITY=omit\n"
                    f"OPENAI_BASE_URL=http://127.0.0.1:{server.server_port}/v1\n"
                    "OPENAI_RESPONSE_FORMAT=b64_json\n"
                )
                env={key:value for key,value in os.environ.items() if not key.startswith(("OPENAI_","IMAGE_"))}
                base=[sys.executable,str(SKILL/"scripts/image_tools.py"),"generate","--project",str(root)]
                denied=subprocess.run(base+["--","mock"],capture_output=True,text=True,env=env)
                self.assertNotEqual(denied.returncode,0)
                self.assertEqual(len(requests),0)
                complete=subprocess.run(base+["--authorize-requests","--","mock","-o","assets","--filename","mock.png"],
                                        capture_output=True,text=True,encoding="utf-8",env=env)
                self.assertEqual(complete.returncode,0,complete.stdout+complete.stderr)
                self.assertTrue((root/"assets/mock.png").is_file())
                self.assertEqual(requests[0][0],"/v1/images/generations")
                failed=subprocess.run(base+["--authorize-requests","--","fail","-o","assets","--filename","failed.png"],
                                      capture_output=True,text=True,encoding="utf-8",env=env)
                self.assertNotEqual(failed.returncode,0)
                self.assertNotIn("mock-secret-123456",failed.stdout+failed.stderr)
                self.assertIn("[REDACTED]",failed.stdout)
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=5)


if __name__=="__main__":
    unittest.main()
