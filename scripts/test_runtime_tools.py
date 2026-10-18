"""Isolated runtime/wrapper regressions; no installs or external API requests."""
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import wave

import create_music_video
import create_program_video
import review_motion
from runtime_tools import npm_command


class RuntimeToolsTest(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory(prefix="video-master-runtime-")
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.node = self.file("node-runtime/node.exe")

    def file(self, relative):
        file = self.root / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.touch()
        return file

    def test_windows_adjacent_cli_without_path_npm(self):
        cli = self.file("node-runtime/node_modules/npm/bin/npm-cli.js")
        with patch("runtime_tools.shutil.which", return_value=None):
            self.assertEqual(npm_command(str(self.node)), [str(self.node), str(cli)])

    def test_windows_path_npm_uses_its_distinct_prefix(self):
        wrapper = self.file("separate npm prefix/npm.cmd")
        cli = self.file("separate npm prefix/node_modules/npm/bin/npm-cli.js")
        self.file("node-runtime/node_modules/npm/bin/npm-cli.js")
        with patch("runtime_tools.shutil.which", return_value=str(wrapper)):
            self.assertEqual(npm_command(str(self.node)), [str(self.node), str(cli)])

    def test_posix_npm_symlink_resolves_system_cli(self):
        wrapper = self.file("usr/bin/npm")
        cli = self.file("usr/share/nodejs/npm/bin/npm-cli.js")
        with patch("runtime_tools.shutil.which", return_value=str(wrapper)), \
                patch("runtime_tools.Path.resolve", return_value=cli):
            self.assertEqual(npm_command(str(self.node)), [str(self.node), str(cli)])

    def test_path_executable_and_manager_shim_remain_direct_argv(self):
        for relative in ("shim-prefix/npm", "shim-prefix/npm.exe"):
            with self.subTest(relative=relative):
                executable = self.file(relative)
                with patch("runtime_tools.shutil.which", return_value=str(executable)):
                    self.assertEqual(npm_command(str(self.node)), [str(executable)])

    def test_unresolved_windows_wrapper_has_actionable_error(self):
        wrapper = self.file("custom-prefix/npm.cmd")
        with patch("runtime_tools.shutil.which", return_value=str(wrapper)):
            with self.assertRaisesRegex(RuntimeError, "manual project initialization"):
                npm_command(str(self.node))

    def test_missing_npm_fails_before_generation(self):
        with patch("runtime_tools.shutil.which", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "Install npm"):
                npm_command(str(self.node))

    def test_actual_installed_npm_version(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is not installed")
        command = npm_command(node)
        result = subprocess.run(
            [*command, "--version"], capture_output=True, text=True, timeout=30
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(result.stdout.strip(), r"^\d+\.\d+\.\d+")

    def invoke_wrapper(self, module, argv):
        wrapper = self.file("separate npm prefix/npm.cmd")
        cli = self.file("separate npm prefix/node_modules/npm/bin/npm-cli.js")
        commands = []
        actual_run = subprocess.run

        def run(command, **kwargs):
            commands.append((command, kwargs))
            if Path(command[1]).name == "init_video_project.py":
                return actual_run(command, **kwargs)
            return subprocess.CompletedProcess(command, 0)

        def discover(name):
            return str(self.node) if name == "node" else str(wrapper) if name == "npm" else None

        with patch("runtime_tools.shutil.which", side_effect=discover), \
                patch.object(module.subprocess, "run", side_effect=run), \
                patch.object(sys, "argv", [str(Path(module.__file__)), *argv]), \
                redirect_stdout(io.StringIO()):
            module.main()
        installs = [command for command, _ in commands if "install" in command and "--no-audit" in command]
        self.assertEqual(installs, [[str(self.node), str(cli), "install", "--no-audit", "--no-fund"]])
        self.assertTrue(all("shell" not in options for _, options in commands))
        self.assertFalse(any("src/render.mjs" in command for command, _ in commands))
        return commands

    def audio(self, file):
        file.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(file), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(8000)
            output.writeframes(b"\0\0" * 8000)

    def test_program_wrapper_copies_supplied_music_from_input_folder(self):
        source = self.root / "supplied input"
        music = source / "music" / "licensed track.wav"
        narration = source / "voice.wav"
        self.audio(music)
        self.audio(narration)
        program = {
            "genre": "report",
            "title": "Fixture",
            "tts": {"provider": "provided"},
            "music": {"mode": "provided", "src": "music/licensed track.wav", "volume": 0.18},
            "pages": [{"type": "bullets", "title": "Fixture", "audio": "voice.wav", "bullets": ["One"]}],
        }
        input_file = source / "program.json"
        input_file.write_text(json.dumps(program), encoding="utf-8")
        output = self.root / "program project"
        self.invoke_wrapper(create_program_video, [
            "--input", str(input_file), "--output", str(output), "--draft-only",
        ])
        copied = json.loads((output / "program.json").read_text(encoding="utf-8"))
        self.assertTrue(copied["music"]["src"].startswith("assets/inputs/"))
        self.assertEqual((output / copied["music"]["src"]).read_bytes(), music.read_bytes())
        self.assertEqual((output / copied["pages"][0]["audio"]).read_bytes(), narration.read_bytes())
        self.assertEqual(copied["music"]["volume"], 0.18)
        self.assertEqual(json.loads(input_file.read_text(encoding="utf-8")), program)

    def test_mv_wrapper_uses_path_npm_without_adjacent_installation(self):
        output = self.root / "MV project"
        commands = self.invoke_wrapper(create_music_video, [
            "--prompt", "Fixture motion", "--output", str(output), "--draft-only",
        ])
        self.assertTrue((output / "video.json").is_file())
        self.assertTrue(any("src/create-mv.mjs" in command for command, _ in commands))

    def test_mv_plan_copies_nested_media_and_remaps_asset_references_without_mutating_source(self):
        folder = self.root / "plan inputs"
        picture = self.file("plan inputs/picture.svg")
        picture.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>', encoding="utf-8")
        plan = {
            "schema": "video-master.mv-plan.v1",
            "project": {"width": 640, "height": 360, "fps": 60, "duration_seconds": 4},
            "cues": [{"id": "scene", "layers": [{"id": "group", "layers": [
                {"id": "picture", "kind": "image", "src": "picture.svg", "asset_refs": ["picture.svg"]}
            ]}]}],
            "storyboard": [{"id": "scene", "asset_refs": ["picture.svg"]}],
        }
        source = folder / "mv-plan.json"
        source.write_text(json.dumps(plan), encoding="utf-8")
        output = self.root / "directed MV"
        commands = self.invoke_wrapper(create_music_video, [
            "--prompt", "Authored choreography", "--plan", str(source), "--output", str(output), "--draft-only",
        ])
        imported = json.loads((output / "mv-plan.json").read_text(encoding="utf-8"))
        layer = imported["cues"][0]["layers"][0]["layers"][0]
        self.assertTrue(layer["src"].startswith("assets/plan-inputs/"))
        self.assertEqual(layer["src"], layer["asset_refs"][0])
        self.assertEqual(layer["src"], imported["storyboard"][0]["asset_refs"][0])
        self.assertEqual((output / layer["src"]).read_bytes(), picture.read_bytes())
        self.assertEqual(json.loads(source.read_text(encoding="utf-8")), plan)
        self.assertTrue(any("--plan" in command for command, _ in commands))

    def test_mv_plan_rejects_media_path_escape_before_install(self):
        source = self.file("bad plan/mv-plan.json")
        self.file("outside.svg")
        source.write_text(json.dumps({"cues": [{"src": "../outside.svg"}]}), encoding="utf-8")
        with self.assertRaisesRegex(SystemExit, "relative paths"):
            self.invoke_wrapper(create_music_video, [
                "--prompt", "Path bounds", "--plan", str(source),
                "--output", str(self.root / "bad project"), "--draft-only",
            ])

    def test_motion_review_wrapper_forwards_full_size_frame_preflight(self):
        project = self.root / "motion project"
        project.mkdir()
        command = [
            "--project", str(project), "--sheet", "--save-frames",
            "--output", "renders/preview/preflight-v1.png",
        ]
        with patch.object(review_motion.shutil, "which", return_value=str(self.node)), \
                patch.object(review_motion.subprocess, "run",
                             return_value=subprocess.CompletedProcess([], 0)) as run, \
                patch.object(sys, "argv", [str(Path(review_motion.__file__)), *command]):
            with self.assertRaises(SystemExit) as exited:
                review_motion.main()
            invoked = run.call_args.args[0]
        self.assertEqual(exited.exception.code, 0)
        self.assertIn("--save-frames", invoked)
        self.assertTrue(invoked[1].endswith("contact-sheet.mjs"))
        self.assertIn("--project", invoked)


if __name__ == "__main__":
    unittest.main()
