"""Portable distribution checks; no runtime installs or credential access."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile


SKILL = Path(__file__).resolve().parents[1]


class DistributionTest(unittest.TestCase):
    def test_archive_excludes_runtime_data_and_only_obsolete_previews(self):
        with tempfile.TemporaryDirectory(prefix="vm-package-test-") as folder:
            output = Path(folder) / "video-master.zip"
            command = [sys.executable, "-B", str(SKILL / "scripts/package_skill.py"), "--output", str(output)]
            subprocess.run(command, check=True, capture_output=True)
            with zipfile.ZipFile(output) as archive:
                names = archive.namelist()
                self.assertEqual(archive.testzip(), None)
                self.assertIn("video-master/SKILL.md", names)
                self.assertIn("video-master/scripts/review_motion.py", names)
                self.assertIn("video-master/scripts/start_workbench.py", names)
                self.assertIn("video-master/scripts/agent_control.py", names)
                self.assertIn("video-master/references/agent-workbench.md", names)
                for extension in ("html", "css", "js"):
                    self.assertIn(f"video-master/assets/starter-project/src/planner.{extension}", names)
                self.assertIn("video-master/assets/starter-project/src/motion.js", names)
                for resource in ("src/composition.js", "src/composition-transitions.js", "src/mv-plan.mjs",
                                 "src/motion-sfx.mjs", "src/composition-pixels.test.mjs"):
                    self.assertIn(f"video-master/assets/starter-project/{resource}", names)
                self.assertIn("video-master/references/composition-format.md", names)
                self.assertIn("video-master/references/motion-style-library.md", names)
                self.assertIn("video-master/assets/examples/build-motion-study.mjs", names)
                self.assertIn("video-master/vendor/mg-styles-15/LICENSE", names)
                self.assertIn("video-master/vendor/ppt-master/LICENSE", names)
                self.assertNotIn("video-master/assets/starter-project/audio/demo-score.wav", names)
                for name in names:
                    parts = Path(name).parts
                    self.assertFalse(set(parts).intersection({"node_modules", "__pycache__", ".git", ".editor", "voice-samples", "delivery", "renders", "validation", ".venv", ".asr-env"}))
                    self.assertFalse(name.endswith(".pyc"))
                    self.assertFalse(Path(name).name.startswith(".env") and Path(name).name != ".env.example")
                for genre in ("mv", "studio", "product", "report"):
                    prefix = "video-master/assets/starter-project/assets/catalog/"
                    self.assertNotIn(prefix + genre + ".png", names)
                    self.assertIn(prefix + genre + "-v2.png", names)
            again = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(again.returncode, 0)
            self.assertIn("Refusing to overwrite", again.stderr)

    def test_initialized_project_contains_only_current_assets(self):
        with tempfile.TemporaryDirectory(prefix="vm-init-test-") as folder:
            output = Path(folder) / "project"
            subprocess.run([sys.executable, "-B", str(SKILL / "scripts/init_video_project.py"), str(output)], check=True, capture_output=True)
            for genre in ("mv", "studio", "product", "report"):
                catalog = output / "assets/catalog"
                self.assertFalse((catalog / f"{genre}.png").exists())
                self.assertTrue((catalog / f"{genre}-v2.png").is_file())
            self.assertTrue((output / "src/contact-sheet.mjs").is_file())
            self.assertTrue((output / "src/planner.html").is_file())
            self.assertFalse((output / ".env").exists())
            self.assertFalse((output / "node_modules").exists())
            self.assertFalse((output / "audio/demo-score.wav").exists())


if __name__ == "__main__":
    unittest.main()
