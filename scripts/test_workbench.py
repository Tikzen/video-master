"""Portable WebUI launcher regressions; no installs, network or child servers."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stderr, redirect_stdout
import copy
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from urllib.request import HTTPRedirectHandler, Request

import start_workbench as workbench


class WorkbenchTest(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory(prefix="video-master-workbench-")
        self.addCleanup(self.workspace.cleanup)
        self.base = Path(self.workspace.name).resolve()
        self.root = self.base / "project"
        self.root.mkdir()
        self.folder = self.root / ".editor"
        self.outside = self.base / "outside"
        self.outside.mkdir()

    def file(self, relative, content="", root=None):
        target = (root or self.root) / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return target

    def json_file(self, relative, value):
        return self.file(relative, json.dumps(value))

    def compatible_project(self):
        for name in ("video.json", "timeline.json", "package.json",
                     "src/server.mjs", "src/planner.html"):
            self.file(name, "{}" if name.endswith(".json") else "")

    def link(self, target, path, directory=False):
        try:
            path.symlink_to(target, target_is_directory=directory)
        except OSError as exc:
            if getattr(exc, "winerror", None) != 1314:
                raise
            # Unprivileged Windows cannot create file symlinks. Exercise the
            # containment check using their actual resolved-path contract.
            original_resolve = Path.resolve

            def resolve(candidate, *args, **kwargs):
                if candidate == path:
                    return original_resolve(target, *args, **kwargs)
                return original_resolve(candidate, *args, **kwargs)

            self.enterContext(patch.object(workbench.Path, "resolve", resolve))

    def current(self, root=None):
        return {"service": "video-master", "status": "ok",
                "root": str(root or self.root), "read_only": False,
                "pid": 1234, "instance_id": "fixture-instance"}

    def stage1(self):
        return {"stage": "stage1", "revision": 2, "title": "A real user request",
                "fields": {
                    "topic": {"value": "Instrument launch", "choices": [
                        "Instrument launch", "Instrument tour", "Instrument history"],
                        "allow_custom": True},
                    "style": {"value": "Graphic rhythm", "choices": [
                        "Graphic rhythm", "Pixel studio", "Typography montage"],
                        "allow_custom": True},
                }}

    def flow(self):
        first = {**self.stage1(), "proposal_hash": "first-proposal"}
        return {
            "stage1": first,
            "stage2": {"proposal_hash": "empty-second"},
            "confirmations": {"stage1": None, "stage1_hash": None, "stage2": None},
        }

    def response(self, url, value=None, status=200):
        response = MagicMock()
        response.__enter__.return_value = response
        response.url = url
        response.status = status
        response.read.return_value = json.dumps(value or {}).encode("utf-8")
        return response

    def sockets(self, occupied=(), selected=52999):
        opened = []

        def create():
            probe = MagicMock()
            probe.__enter__.return_value = probe
            probe.getsockname.return_value = ("127.0.0.1", selected)

            def bind(address):
                if address[1] in occupied:
                    raise OSError("occupied fixture port")

            probe.bind.side_effect = bind
            opened.append(probe)
            return probe

        return opened, create

    def test_local_url_accepts_only_plain_loopback_origin(self):
        self.assertEqual(workbench.local_url("http://127.0.0.1:5184/"),
                         "http://127.0.0.1:5184")
        rejected = [
            "https://127.0.0.1:5184", "http://localhost:5184",
            "http://[::1]:5184", "http://example.invalid:5184",
            "http://127.0.0.1", "http://127.0.0.1:0",
            "http://127.0.0.1:65536", "http://name@127.0.0.1:5184",
            "http://127.0.0.1:5184/create", "http://127.0.0.1:5184/?panel=music",
            "http://127.0.0.1:5184/#round",
        ]
        for url in rejected:
            with self.subTest(url=url), self.assertRaises(ValueError):
                workbench.local_url(url)

    def test_redirects_are_rejected_before_following_another_url(self):
        handlers = [handler for handler in workbench.HTTP.handlers
                    if isinstance(handler, HTTPRedirectHandler)]
        self.assertEqual(len(handlers), 1)
        for target in ("http://127.0.0.1:5199/api/health",
                       "https://remote.invalid/api/health"):
            with self.subTest(target=target):
                request = Request("http://127.0.0.1:5184/api/health")
                self.assertIsNone(handlers[0].redirect_request(
                    request, None, 302, "Found", {}, target,
                ))
                with patch.object(workbench.HTTP, "open") as transport:
                    handlers[0].http_error_302(
                        request, io.BytesIO(b"redirect"), 302,
                        "Found", {"location": target},
                    )
                transport.assert_not_called()

    def test_json_request_has_bounded_read_and_defensive_redirect_check(self):
        response = self.response("http://127.0.0.1:5184/api/proposals",
                                 {"status": "published"})
        with patch.object(workbench.HTTP, "open", return_value=response) as opened:
            result = workbench.request_json(
                "http://127.0.0.1:5184/", "/api/proposals", {"proposal": "fixture"},
                timeout=2,
            )
        self.assertEqual(result, {"status": "published"})
        request = opened.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:5184/api/proposals")
        self.assertEqual(json.loads(request.data), {"proposal": "fixture"})
        self.assertEqual(opened.call_args.kwargs["timeout"], 2)
        response.read.assert_called_once_with(2_000_000)
        response.url = "https://remote.invalid/api/proposals"
        with patch.object(workbench.HTTP, "open", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "redirect"):
                workbench.request_json("http://127.0.0.1:5184", "/api/proposals", {})

    def test_health_matches_writable_project_not_just_service_name(self):
        valid = self.current()
        with patch.object(workbench, "request_json", return_value=valid):
            self.assertEqual(workbench.health("http://127.0.0.1:5184", self.root), valid)
        invalid = [
            {**valid, "root": str(self.outside)},
            {**valid, "read_only": True},
            {**valid, "status": "starting"},
            {**valid, "service": "another-service"},
            {"service": "video-master", "status": "ok", "root": None},
            ["not", "a", "health", "object"],
        ]
        for current in invalid:
            with self.subTest(current=current):
                with patch.object(workbench, "request_json", return_value=current):
                    self.assertIsNone(workbench.health("http://127.0.0.1:5184", self.root))

    def test_initialize_preserves_nonempty_incompatible_project(self):
        existing = self.file("user-document.txt", "never overwrite me")
        with patch.object(workbench.subprocess, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "Preserve this project"):
                workbench.initialize(self.root)
        run.assert_not_called()
        self.assertEqual(existing.read_text(encoding="utf-8"), "never overwrite me")
        self.assertEqual(list(self.root.iterdir()), [existing])

    def test_initialize_reuses_compatible_project_without_copying(self):
        self.compatible_project()
        existing = self.file("video.json", '{"name":"Keep this project"}')
        with patch.object(workbench.subprocess, "run") as run:
            workbench.initialize(self.root)
        run.assert_not_called()
        self.assertEqual(json.loads(existing.read_text(encoding="utf-8")),
                         {"name": "Keep this project"})

    def test_initialize_new_project_uses_bundled_initializer(self):
        output = self.base / "new-output"

        def initialize(command, **options):
            self.assertEqual(Path(command[-1]), output)
            output.mkdir()
            for name in ("video.json", "timeline.json", "package.json",
                         "src/server.mjs", "src/planner.html"):
                self.file(name, root=output)
            return subprocess.CompletedProcess(command, 0)

        with patch.object(workbench.subprocess, "run", side_effect=initialize) as run:
            workbench.initialize(output)
        command = run.call_args.args[0]
        self.assertEqual(command[0], sys.executable)
        self.assertEqual(Path(command[1]).name, "init_video_project.py")
        self.assertTrue(run.call_args.kwargs["check"])
        self.assertNotIn("shell", run.call_args.kwargs)

    def test_initialize_refuses_output_inside_skill(self):
        with patch.object(workbench, "SKILL_DIR", self.base), \
                patch.object(workbench.subprocess, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "installed skill"):
                workbench.initialize(self.root)
        run.assert_not_called()

    def test_external_editor_link_is_rejected_without_writes(self):
        self.link(self.outside, self.folder, directory=True)
        with self.assertRaisesRegex(RuntimeError, "outside"):
            workbench.checked_editor_dir(self.root)
        self.assertEqual(list(self.outside.iterdir()), [])

    def test_external_log_link_is_rejected_before_server_launch(self):
        self.folder.mkdir()
        target = self.file("private.log", "private log", root=self.outside)
        self.link(target, self.folder / "workbench.log")
        with patch.object(workbench, "detached") as detached:
            with self.assertRaisesRegex(RuntimeError, "outside"):
                workbench.start_server("node", self.root, self.folder, 5184, 1)
        detached.assert_not_called()
        self.assertEqual(target.read_text(encoding="utf-8"), "private log")

    def test_external_receipt_link_is_rejected_before_read_or_probe(self):
        self.folder.mkdir()
        target = self.file("private.json", '{"secret":"preserve"}', root=self.outside)
        self.link(target, self.folder / "workbench.json")
        with patch.object(workbench, "read_json") as read, \
                patch.object(workbench, "health") as health:
            with self.assertRaisesRegex(RuntimeError, "outside"):
                workbench.find_slot(self.root, self.folder, None)
        read.assert_not_called()
        health.assert_not_called()
        self.assertEqual(target.read_text(encoding="utf-8"), '{"secret":"preserve"}')

    def test_external_receipt_link_cannot_be_overwritten(self):
        self.folder.mkdir()
        target = self.file("private.json", '{"secret":"preserve"}', root=self.outside)
        self.link(target, self.folder / "workbench.json")
        with self.assertRaisesRegex(RuntimeError, "outside"):
            workbench.save_receipt(self.folder, self.root,
                                   "http://127.0.0.1:5184", self.current())
        self.assertEqual(target.read_text(encoding="utf-8"), '{"secret":"preserve"}')

    def test_external_lock_link_is_rejected_before_touching_target(self):
        self.folder.mkdir()
        target = self.file("private.lock", "private lock", root=self.outside)
        self.link(target, self.folder / "workbench-launch.lock")
        with self.assertRaisesRegex(RuntimeError, "outside"):
            with workbench.launch_lock(self.folder):
                self.fail("an external lock must not be acquired")
        self.assertEqual(target.read_text(encoding="utf-8"), "private lock")

    def test_launch_lock_excludes_concurrent_launchers_then_releases(self):
        self.folder.mkdir()

        def compete():
            try:
                with workbench.launch_lock(self.folder):
                    return "acquired"
            except RuntimeError:
                return "blocked"

        with workbench.launch_lock(self.folder), ThreadPoolExecutor(max_workers=1) as pool:
            self.assertEqual(pool.submit(compete).result(timeout=5), "blocked")
            self.assertEqual(pool.submit(compete).result(timeout=5), "blocked")
        with workbench.launch_lock(self.folder):
            self.assertTrue((self.folder / "workbench-launch.lock").is_file())

    def test_find_slot_reuses_matching_saved_project_without_socket(self):
        self.json_file(".editor/workbench.json", {
            "root": str(self.root), "url": "http://127.0.0.1:5186",
        })
        current = self.current()
        with patch.object(workbench, "health", return_value=current) as health, \
                patch.object(workbench.socket, "socket") as socket:
            self.assertEqual(workbench.find_slot(self.root, self.folder, None),
                             (5186, current))
        health.assert_called_once_with("http://127.0.0.1:5186", self.root)
        socket.assert_not_called()

    def test_find_slot_ignores_saved_url_from_foreign_project(self):
        self.json_file(".editor/workbench.json", {
            "root": str(self.outside), "url": "http://127.0.0.1:5184",
        })
        sockets, create = self.sockets(occupied={5184})
        foreign = self.current(self.outside)
        with patch.object(workbench, "request_json", return_value=foreign) as request, \
                patch.object(workbench.socket, "socket", side_effect=create), \
                patch.object(workbench.subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(RuntimeError, "occupied"):
                workbench.find_slot(self.root, self.folder, 5184)
        self.assertEqual(request.call_count, 1)
        self.assertEqual(sockets[0].bind.call_args.args[0], ("127.0.0.1", 5184))
        spawn.assert_not_called()

    def test_find_slot_keeps_scanning_for_matching_project_after_free_port(self):
        self.folder.mkdir()
        current = self.current()
        sockets, create = self.sockets()

        def health(url, root):
            return current if url == "http://127.0.0.1:5181" else None

        with patch.object(workbench, "health", side_effect=health), \
                patch.object(workbench.socket, "socket", side_effect=create):
            self.assertEqual(workbench.find_slot(self.root, self.folder, None),
                             (5181, current))
        self.assertEqual([item.bind.call_args.args[0][1] for item in sockets],
                         [5179, 5180])

    def test_find_slot_ephemeral_port_binds_loopback_only(self):
        self.folder.mkdir()
        sockets, create = self.sockets(selected=53211)
        with patch.object(workbench.socket, "socket", side_effect=create):
            self.assertEqual(workbench.find_slot(self.root, self.folder, 0), (53211, None))
        sockets[0].bind.assert_called_once_with(("127.0.0.1", 0))

    def test_find_slot_exact_port_does_not_reuse_other_saved_port(self):
        self.json_file(".editor/workbench.json", {
            "root": str(self.root), "url": "http://127.0.0.1:5185",
        })
        _, create = self.sockets()
        with patch.object(workbench, "health", return_value=None) as health, \
                patch.object(workbench.socket, "socket", side_effect=create):
            self.assertEqual(workbench.find_slot(self.root, self.folder, 5184), (5184, None))
        health.assert_called_once_with("http://127.0.0.1:5184", self.root)

    def test_start_server_accepts_only_own_ready_instance(self):
        self.folder.mkdir()
        child = MagicMock(pid=1234)
        child.poll.return_value = None
        own = self.current()
        foreign = {**own, "pid": 9999}
        with patch.object(workbench, "detached", return_value=child), \
                patch.object(workbench, "health", side_effect=[foreign, own]), \
                patch.object(workbench.time, "monotonic", side_effect=[0, 0.1, 0.2]), \
                patch.object(workbench.time, "sleep"):
            self.assertEqual(workbench.start_server(
                "node", self.root, self.folder, 5184, 1,
            ), own)
        child.terminate.assert_not_called()

    def test_start_timeout_terminates_only_created_child(self):
        self.folder.mkdir()
        child = MagicMock(pid=1234)
        child.poll.return_value = None
        foreign = {**self.current(), "pid": 9999}
        with patch.object(workbench, "detached", return_value=child), \
                patch.object(workbench, "health", return_value=foreign), \
                patch.object(workbench.time, "monotonic", side_effect=[0, 0.1, 2]), \
                patch.object(workbench.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                workbench.start_server("node", self.root, self.folder, 5184, 1)
        child.terminate.assert_called_once_with()
        child.wait.assert_called_once_with(timeout=10)

    def test_publish_identical_proposal_preserves_confirmations(self):
        flow = self.flow()
        flow["confirmations"]["stage1"] = {"values": {"style": "Graphic rhythm"},
                                         "proposal_hash": "first-proposal"}
        flow["confirmations"]["stage1_hash"] = "actual-confirmation"
        before = copy.deepcopy(flow)
        proposal = self.json_file("planning/authored.json", self.stage1())
        with patch.object(workbench, "request_json", return_value=flow) as request:
            self.assertEqual(workbench.publish("http://127.0.0.1:5184", proposal), "stage1")
        request.assert_called_once_with("http://127.0.0.1:5184", "/api/workflow")
        self.assertEqual(flow, before)

    def test_stage2_publish_binds_current_stage1_receipt_without_changing_input(self):
        flow = self.flow()
        flow["confirmations"]["stage1"] = {"values": {"style": "Graphic rhythm"}}
        flow["confirmations"]["stage1_hash"] = "actual-confirmation"
        proposal = {"stage": "stage2", "revision": 1, "title": "Treatments",
                    "fields": {}, "candidates": [{"id": "a"}, {"id": "b"}, {"id": "c"}],
                    "stage1_hash": "stale-input"}
        file = self.json_file("planning/treatments.json", proposal)
        with patch.object(workbench, "request_json", side_effect=[flow, {"status": "published"}]) as request:
            self.assertEqual(workbench.publish("http://127.0.0.1:5184", file), "stage2")
        posted = request.call_args_list[1].args[2]
        self.assertEqual(posted["proposal"]["stage1_hash"], "actual-confirmation")
        self.assertEqual(posted["expected_hash"], "empty-second")
        self.assertEqual(workbench.read_json(file), proposal)
        self.assertEqual(flow["confirmations"]["stage1_hash"], "actual-confirmation")

    def test_stage2_publish_without_actual_confirmation_is_rejected_before_post(self):
        file = self.json_file("planning/treatments.json", {
            "stage": "stage2", "revision": 1, "title": "Treatments", "fields": {},
            "candidates": [{"id": "a"}, {"id": "b"}, {"id": "c"}],
        })
        with patch.object(workbench, "request_json", return_value=self.flow()) as request:
            with self.assertRaisesRegex(RuntimeError, "Stage 1"):
                workbench.publish("http://127.0.0.1:5184", file)
        request.assert_called_once_with("http://127.0.0.1:5184", "/api/workflow")

    def test_identical_stage2_reuses_current_binding_without_resetting_receipt(self):
        flow = self.flow()
        flow["confirmations"]["stage1"] = {"values": {"style": "Graphic rhythm"}}
        flow["confirmations"]["stage1_hash"] = "actual-confirmation"
        flow["confirmations"]["stage2"] = {"treatment_id": "a", "proposal_hash": "second"}
        proposal = {"stage": "stage2", "revision": 1, "title": "Treatments",
                    "fields": {}, "candidates": [{"id": "a"}, {"id": "b"}, {"id": "c"}],
                    "stage1_hash": "actual-confirmation"}
        flow["stage2"] = {**proposal, "proposal_hash": "second"}
        file = self.json_file("planning/treatments.json", {
            **proposal, "stage1_hash": "old-input-binding",
        })
        before = copy.deepcopy(flow)
        with patch.object(workbench, "request_json", return_value=flow) as request:
            self.assertEqual(workbench.publish("http://127.0.0.1:5184", file), "stage2")
        request.assert_called_once_with("http://127.0.0.1:5184", "/api/workflow")
        self.assertEqual(flow, before)

    def test_verify_round_rejects_generic_unprepared_defaults(self):
        flow = self.flow()
        flow["stage1"]["fields"] = {
            "topic": {"value": "Starter project"},
            "genre": {"value": "product", "options": ["mv", "studio", "product", "report"]},
            "style": {"value": "clear layout"},
        }
        with patch.object(workbench, "request_json", return_value=flow):
            with self.assertRaisesRegex(RuntimeError, "contextual"):
                workbench.verify_round("http://127.0.0.1:5184", "stage1")

    def test_verify_round_accepts_three_authored_choices_and_returns_actual_hash(self):
        with patch.object(workbench, "request_json", return_value=self.flow()):
            self.assertEqual(workbench.verify_round("http://127.0.0.1:5184", "stage1"),
                             {"stage": "stage1", "proposal_hash": "first-proposal",
                              "confirmed": False})

    def test_known_chat_context_can_be_confirmed_without_reasking_supplied_fields(self):
        flow = self.flow()
        flow["stage1"]["context"] = {"genre": "report", "topic": "Known launch",
                                    "style": "User-specified kinetic type"}
        flow["stage1"]["fields"] = {
            "mode": {"value": "interactive", "options": ["interactive", "one_sentence"]},
        }
        with patch.object(workbench, "request_json", return_value=flow):
            state = workbench.verify_round("http://127.0.0.1:5184", "stage1")
        self.assertEqual(state["proposal_hash"], "first-proposal")
        self.assertFalse(state["confirmed"])

    def test_verify_stage2_rejects_stale_receipt(self):
        flow = self.flow()
        flow["confirmations"]["stage1"] = {"values": {"style": "Graphic rhythm"}}
        flow["confirmations"]["stage1_hash"] = "actual-confirmation"
        flow["stage2"].update({
            "stage1_hash": "stale-confirmation",
            "candidates": [{"id": "a"}, {"id": "b"}, {"id": "c"}],
        })
        with patch.object(workbench, "request_json", return_value=flow):
            with self.assertRaisesRegex(RuntimeError, "stale"):
                workbench.verify_round("http://127.0.0.1:5184", "stage2")

    def test_browser_suppression_keeps_manual_url_semantics(self):
        with patch.object(workbench.webbrowser, "open") as opened:
            result = workbench.open_browser("http://127.0.0.1:5184/create?panel=music", True)
        self.assertFalse(result["attempted"])
        self.assertFalse(result["accepted"])
        self.assertIn("URL", result["reason"])
        opened.assert_not_called()

    def test_headless_host_does_not_treat_webui_as_unavailable(self):
        with patch.object(workbench.sys, "platform", "linux"), \
                patch.object(workbench.platform, "release", return_value="fixture-linux"), \
                patch.dict(workbench.os.environ, {}, clear=True), \
                patch.object(workbench.webbrowser, "open") as opened:
            result = workbench.open_browser("http://127.0.0.1:5184/create?round=stage1", False)
        self.assertFalse(result["attempted"])
        self.assertFalse(result["accepted"])
        self.assertIn("URL", result["reason"])
        opened.assert_not_called()

    def test_missing_opener_has_actionable_result_not_false_visibility(self):
        with patch.object(workbench.sys, "platform", "win32"), \
                patch.object(workbench.platform, "release", return_value="fixture-windows"), \
                patch.object(workbench.webbrowser, "open", return_value=False):
            result = workbench.open_browser("http://127.0.0.1:5184/", False)
        self.assertTrue(result["attempted"])
        self.assertFalse(result["accepted"])
        self.assertIn("URL", result["reason"])

    def test_successful_dispatch_does_not_claim_page_visibility(self):
        with patch.object(workbench.sys, "platform", "win32"), \
                patch.object(workbench.platform, "release", return_value="fixture-windows"), \
                patch.object(workbench.webbrowser, "open", return_value=True):
            result = workbench.open_browser("http://127.0.0.1:5184/", False)
        self.assertTrue(result["attempted"])
        self.assertTrue(result["accepted"])
        self.assertIn("not proof", result["reason"])
        self.assertNotIn("visible", result)

    def test_wsl_without_windows_opener_preserves_link_fallback(self):
        with patch.object(workbench.sys, "platform", "linux"), \
                patch.object(workbench.platform, "release", return_value="microsoft-standard-WSL"), \
                patch.dict(workbench.os.environ, {}, clear=True), \
                patch.object(workbench.shutil, "which", return_value=None), \
                patch.object(workbench.Path, "is_file", return_value=False), \
                patch.object(workbench.subprocess, "run") as run:
            result = workbench.open_browser("http://127.0.0.1:5184/", False)
        self.assertTrue(result["attempted"])
        self.assertFalse(result["accepted"])
        self.assertIn("PowerShell", result["reason"])
        run.assert_not_called()

    def test_present_dependencies_do_not_need_npm(self):
        with patch.object(workbench.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run, \
                patch.object(workbench, "npm_command") as npm:
            self.assertFalse(workbench.dependencies("node", self.root, True))
        self.assertEqual(run.call_count, 1)
        npm.assert_not_called()

    def test_skip_install_missing_dependencies_fails_without_installing(self):
        with patch.object(workbench.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)) as run, \
                patch.object(workbench, "npm_command") as npm:
            with self.assertRaisesRegex(RuntimeError, "skip-install"):
                workbench.dependencies("node", self.root, True)
        self.assertEqual(run.call_count, 1)
        npm.assert_not_called()

    def test_missing_npm_fails_before_any_install_command(self):
        with patch.object(workbench.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)) as run, \
                patch.object(workbench, "npm_command", side_effect=RuntimeError("Install npm")):
            with self.assertRaisesRegex(RuntimeError, "Install npm"):
                workbench.dependencies("node", self.root, False)
        self.assertEqual(run.call_count, 1)

    def test_dependency_install_failure_to_resolve_modules_is_not_ready(self):
        results = [subprocess.CompletedProcess([], 1),
                   subprocess.CompletedProcess([], 0),
                   subprocess.CompletedProcess([], 1)]
        with patch.object(workbench.subprocess, "run", side_effect=results) as run, \
                patch.object(workbench, "npm_command", return_value=["node", "npm-cli.js"]):
            with self.assertRaisesRegex(RuntimeError, "still missing"):
                workbench.dependencies("node", self.root, False)
        self.assertEqual(run.call_count, 3)

    def test_dependency_install_uses_structured_portable_npm_then_reprobes(self):
        results = [subprocess.CompletedProcess([], 1),
                   subprocess.CompletedProcess([], 0),
                   subprocess.CompletedProcess([], 0)]
        with patch.object(workbench.subprocess, "run", side_effect=results) as run, \
                patch.object(workbench, "npm_command", return_value=["node", "npm-cli.js"]):
            self.assertTrue(workbench.dependencies("node", self.root, False))
        install = run.call_args_list[1]
        self.assertEqual(install.args[0],
                         ["node", "npm-cli.js", "install", "--no-audit", "--no-fund"])
        self.assertEqual(install.kwargs["cwd"], self.root)
        self.assertNotIn("shell", install.kwargs)
        self.assertEqual(run.call_count, 3)

    def test_main_reuses_server_and_keeps_verified_url_without_browser(self):
        self.compatible_project()
        self.folder.mkdir()
        url = "http://127.0.0.1:5184"
        page = url + "/create?panel=music"
        output = io.StringIO()
        with patch.object(sys, "argv", [
            "start_workbench.py", "--project", str(self.root),
            "--panel", "music", "--no-browser",
        ]), patch.object(workbench, "find_slot", return_value=(5184, self.current())), \
                patch.object(workbench, "node_runtime") as node, \
                patch.object(workbench, "dependencies") as dependencies, \
                patch.object(workbench, "start_server") as launch, \
                patch.object(workbench.HTTP, "open", return_value=self.response(page)) as opened, \
                redirect_stdout(output):
            workbench.main()
        result = json.loads(output.getvalue())
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["url"], url)
        self.assertEqual(result["page_url"], page)
        self.assertTrue(result["reused"])
        self.assertFalse(result["browser"]["attempted"])
        self.assertFalse(result["installed_dependencies"])
        self.assertEqual(workbench.read_json(self.folder / "workbench.json")["root"],
                         str(self.root))
        opened.assert_called_once_with(page, timeout=3)
        node.assert_not_called()
        dependencies.assert_not_called()
        launch.assert_not_called()

    def test_round_mismatch_rejected_before_project_mutation(self):
        file = self.json_file("authored.json", self.stage1())
        output = self.base / "not-created"
        with patch.object(sys, "argv", [
            "start_workbench.py", "--project", str(output),
            "--proposal", str(file), "--round", "stage2",
        ]), patch.object(workbench, "initialize") as initialize, \
                patch.object(workbench, "publish") as publish, \
                redirect_stderr(io.StringIO()):
            with self.assertRaises((RuntimeError, SystemExit)):
                workbench.main()
        initialize.assert_not_called()
        publish.assert_not_called()
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
