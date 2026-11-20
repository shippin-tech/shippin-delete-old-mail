"""Regression evidence must not turn missing coverage into a successful full report."""

import contextlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import regression as r


class RegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.web = r.Step("web.fixture", "web", "Web fixture", [sys.executable, "-c", "print('ok')"], self.root)
        self.live = r.Step("live.fixture", "live", "Live fixture", self.web.argv, self.root, True)
        self.engine = r.Step("engine.fixture", "engine", "Engine fixture", self.web.argv, self.root)
        for name, value in {
            "ROOT": self.root, "RUNS": self.root / "runs",
            "OUT_JSON": self.root / "regression-results.json",
            "OUT_MD": self.root / "REGRESSION-RESULTS.md",
        }.items():
            p = patch.object(r, name, value)
            p.start()
            self.addCleanup(p.stop)

    def main(self, args, image=None, executor=None):
        image = image or {"name": "fixture", "id": "sha256:fixture"}
        with contextlib.ExitStack() as stack:
            for name, result in {
                "web_steps": [self.web], "live_steps": [self.live], "engine_steps": [self.engine],
                "git": "fixture", "stack_problem": None,
            }.items():
                stack.enter_context(patch.object(r, name, return_value=result))
            image_mock = stack.enter_context(patch.object(r, "image_identity", return_value=image))
            if isinstance(image, list):
                image_mock.side_effect = image
            stack.enter_context(patch.object(r, "ENGINE_URL", "http://127.0.0.1:28081"))
            stack.enter_context(patch.dict(r.os.environ, {"LIVE_URL": "http://127.0.0.1:28080"}))
            stack.enter_context(patch.object(sys, "argv", ["regression.py", *args]))
            if executor:
                stack.enter_context(patch.object(r, "run", side_effect=executor))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            stack.enter_context(contextlib.redirect_stderr(io.StringIO()))
            return r.main()

    @staticmethod
    def pass_step(step, *_):
        return {"id": step.id, "gate": step.gate, "title": step.title,
                "status": "pass", "seconds": 0, "detail": "fixture"}

    def test_cli_rejects_unknown_and_mixed_selection_before_reporting(self):
        for ids in (["typo"], ["web.fixture", "typo"], ["engine.fixture"]):
            with self.subTest(ids=ids), self.assertRaises(SystemExit) as raised:
                self.main([part for name in ids for part in ("--step", name)])
            self.assertEqual(raised.exception.code, 2)
        self.assertFalse(r.OUT_JSON.exists())

    def test_selection_rejects_empty_and_excluded_gates(self):
        with self.assertRaises(ValueError):
            r.select_steps([], None, None)
        with self.assertRaises(ValueError):
            r.select_steps([self.web, self.engine], "web", [self.engine.id])

    def test_default_run_preserves_full_report_and_records_omissions(self):
        r.OUT_JSON.write_text("previous full report")
        r.OUT_MD.write_text("previous full markdown")
        self.assertEqual(self.main([], executor=self.pass_step), 0)
        self.assertEqual(r.OUT_JSON.read_text(), "previous full report")
        self.assertEqual(r.OUT_MD.read_text(), "previous full markdown")
        report = json.loads(r.OUT_JSON.with_name("regression-results.partial.json").read_text())
        self.assertEqual(report["scope"], "partial")
        self.assertEqual(report["omitted_steps"], [self.engine.id])
        self.assertTrue(report["unverified_requirements"])

    def test_full_run_records_all_configured_suites_without_claiming_parity(self):
        self.assertEqual(self.main(["--engine"], executor=self.pass_step), 0)
        report = json.loads(r.OUT_JSON.read_text())
        self.assertEqual(report["omitted_steps"], [])
        self.assertEqual(len(report["steps"]), 3)
        self.assertIn("Baseline comparison", r.OUT_MD.read_text())

    def test_missing_image_blocks_live_process(self):
        with patch.object(r.subprocess, "run") as process:
            code = self.main(["--only", "live"], image={"id": "", "name": ""})
        self.assertEqual(code, 1)
        process.assert_not_called()
        report = json.loads(r.OUT_JSON.with_name("regression-results.partial.json").read_text())
        self.assertEqual(report["steps"][0]["status"], "not-run")

    def test_image_change_invalidates_live_success(self):
        self.assertEqual(self.main(["--engine"], image=[{"id": "one", "name": "a"},
                                                      {"id": "two", "name": "b"}],
                                   executor=self.pass_step), 1)
        report = json.loads(r.OUT_JSON.read_text())
        self.assertEqual(report["steps"][1]["status"], "fail")

    def test_engine_zero_exit_requires_nonempty_complete_evidence(self):
        for output in ("build only", "test result: ok. 0 passed; 0 failed; 0 ignored",
                       "test result: ok. 2 passed; 0 failed; 1 ignored",
                       "test result: FAILED. 2 passed; 1 failed; 0 ignored"):
            with self.subTest(output=output), patch.object(r.subprocess, "run", return_value=
                    subprocess.CompletedProcess([], 0, output, "")):
                self.assertEqual(r.run(self.engine, self.root, None)["status"], "fail")
        with patch.object(r.subprocess, "run", return_value=subprocess.CompletedProcess(
                [], 0, "test result: ok. 2 passed; 0 failed; 0 ignored", "")):
            self.assertEqual(r.run(self.engine, self.root, None)["status"], "pass")

    def test_process_failure_timeout_and_start_error_are_not_success(self):
        with patch.object(r.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", "failed")):
            self.assertEqual(r.run(self.web, self.root, None)["status"], "fail")
        with patch.object(r.subprocess, "run", side_effect=subprocess.TimeoutExpired([], 1, b"partial")):
            self.assertEqual(r.run(self.web, self.root, None)["status"], "fail")
        with patch.object(r.subprocess, "run", side_effect=PermissionError()):
            self.assertEqual(r.run(self.web, self.root, None)["status"], "not-run")

    def test_browser_and_unit_suites_cannot_hide_skips_or_empty_runs(self):
        for name in ("web.browser", "live.browser", "web.unit", "live.contract"):
            step = r.Step(name, name.split(".")[0], name, self.web.argv, self.root)
            for output in ("0 passed", "12 passed\n1 skipped", "4 passed | 2 todo", "No tests found"):
                with self.subTest(name=name, output=output):
                    self.assertIsNotNone(r.evidence_problem(step, output))
            self.assertIsNone(r.evidence_problem(step, "\x1b[32m12 passed\x1b[0m"))

    def test_real_process_and_full_report_exit_failure(self):
        self.assertEqual(r.run(self.web, self.root, None)["status"], "pass")
        self.web.argv = [sys.executable, "-c", "raise SystemExit(7)"]
        self.engine.argv = [sys.executable, "-c", "print('test result: ok. 1 passed; 0 failed; 0 ignored')"]
        self.assertEqual(self.main(["--engine"]), 1)
        self.assertEqual(json.loads(r.OUT_JSON.read_text())["steps"][0]["exit"], 7)


if __name__ == "__main__":
    unittest.main()
