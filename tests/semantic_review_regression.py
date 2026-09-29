"""Receipt validation only: every output below is synthetic, no model is called."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from scripts.evaluate_semantic_review import CASES, evaluate

ROOT = Path(__file__).resolve().parents[1]


def receipt():
    cases = json.loads(CASES.read_text())["cases"]
    return {"data": "synthetic_only", "real_model_execution": True,
            "provider": "synthetic-test-provider", "model": "synthetic-test-model", "effort": "test",
            "prompt_version": "synthetic-test-v1", "source_commit": "a" * 40,
            "executed_at": "2026-09-29T12:00:00Z",
            "results": [{"case_id": case["id"], "raw_output": "Synthetic output for validator testing only.",
                         "latency_ms": 1.5, "input_tokens": 10, "output_tokens": 5,
                         "human_review": {"passed": True, "reviewer": "synthetic reviewer",
                                          "reason": "Synthetic review for validator testing only."}}
                        for case in cases]}


class SemanticReviewTest(unittest.TestCase):
    def test_complete_receipt_reports_only_self_reported_evidence(self):
        value = receipt()
        result = evaluate(value)
        self.assertEqual(result["status"], "REVIEWED")
        self.assertTrue(result["all_passed"])
        self.assertEqual(result["total_tokens"], 15 * len(value["results"]))
        self.assertEqual(result["evidence_authenticity"], "SELF_REPORTED_NOT_VERIFIED")
        self.assertEqual(result["network_calls_by_evaluator"], 0)

    def test_invalid_attestations_identities_and_case_coverage_are_rejected(self):
        original = receipt()
        values = [None, [], {**original, "real_model_execution": False},
                  {**original, "real_model_execution": 1}, {**original, "data": "private"},
                  {**original, "source_commit": "invented-commit"},
                  {**original, "executed_at": "2026-09-29"},
                  {**original, "executed_at": "not-a-date"},
                  {**original, "results": original["results"][:-1]},
                  {**original, "results": [original["results"][0]] * len(original["results"])}]
        for field in ("provider", "model", "effort", "prompt_version", "source_commit", "executed_at"):
            values.append({key: value for key, value in original.items() if key != field})
            values.append({**original, field: " \n\t"})
        for value in values:
            with self.subTest(value_type=type(value).__name__), self.assertRaises(ValueError):
                evaluate(value)
        for row in [None, False, [], "case", {"case_id": []}, {"case_id": "unknown"}]:
            value = copy.deepcopy(original)
            value["results"][0] = row
            with self.subTest(row=row), self.assertRaises(ValueError):
                evaluate(value)

    def test_review_and_original_output_must_be_typed_nonempty_evidence(self):
        for review in [None, [], "yes", {}, {"passed": 1, "reviewer": "r", "reason": "r"}]:
            value = receipt()
            value["results"][0]["human_review"] = review
            with self.subTest(review=review), self.assertRaises(ValueError):
                evaluate(value)
        for field in ("reviewer", "reason"):
            for invalid in [1, True, [], {}, " \n\t"]:
                value = receipt()
                value["results"][0]["human_review"][field] = invalid
                with self.subTest(field=field, invalid=invalid), self.assertRaises(ValueError):
                    evaluate(value)
        for invalid in [None, True, [], {}, " \n\t", {"number": float("nan")}]:
            value = receipt()
            value["results"][0]["raw_output"] = invalid
            with self.subTest(output=invalid), self.assertRaises(ValueError):
                evaluate(value)

    def test_execution_measurements_cannot_be_nonfinite_or_fake_booleans(self):
        for field in ("latency_ms", "input_tokens", "output_tokens"):
            for invalid in [None, True, False, "10", -1, float("nan"), float("inf"), float("-inf")]:
                value = receipt()
                value["results"][0][field] = invalid
                with self.subTest(field=field, invalid=invalid), self.assertRaises(ValueError):
                    evaluate(value)
        for field in ("input_tokens", "output_tokens"):
            value = receipt()
            value["results"][0][field] = 1.5
            with self.subTest(field=field), self.assertRaises(ValueError):
                evaluate(value)

    def test_human_failure_is_never_aggregated_as_passed(self):
        value = receipt()
        value["results"][2]["human_review"]["passed"] = False
        result = evaluate(value)
        self.assertEqual(result["status"], "REVIEW_FAILED")
        self.assertFalse(result["all_passed"])
        self.assertEqual(result["failed"], [value["results"][2]["case_id"]])
        self.assertEqual(result["passed"], len(value["results"]) - 1)

    def test_cli_exits_nonzero_for_failed_invalid_or_duplicate_verdicts(self):
        cache = ROOT / ".cache"
        cache.mkdir(exist_ok=True)
        output = Path(tempfile.mkdtemp(prefix="semantic-review-regression-", dir=cache))
        failed = receipt()
        failed["results"][0]["human_review"]["passed"] = False
        duplicate = json.dumps(receipt()).replace('"passed": true', '"passed": false, "passed": true', 1)
        nonfinite = json.dumps(receipt()).replace('"latency_ms": 1.5', '"latency_ms": NaN', 1)
        fixtures = [("complete", json.dumps(receipt()), 0, "REVIEWED"),
                    ("failed", json.dumps(failed), 1, "REVIEW_FAILED"),
                    ("incomplete", "{}", 2, "INVALID_RECEIPT"),
                    ("duplicate-verdict", duplicate, 2, "INVALID_RECEIPT"),
                    ("nonfinite", nonfinite, 2, "INVALID_RECEIPT")]
        for name, body, expected_exit, expected_status in fixtures:
            file = output / (name + ".json")
            file.write_text(body)
            result = subprocess.run([sys.executable, str(ROOT / "scripts/evaluate_semantic_review.py"), str(file)],
                                    capture_output=True, text=True, timeout=10)
            with self.subTest(name=name):
                self.assertEqual(result.returncode, expected_exit, result.stderr)
                self.assertEqual(json.loads(result.stdout)["status"], expected_status)
                self.assertNotIn("Traceback", result.stderr)
        empty = subprocess.run([sys.executable, str(ROOT / "scripts/evaluate_semantic_review.py")],
                               capture_output=True, text=True, timeout=10)
        self.assertEqual(json.loads(empty.stdout)["status"], "NOT_RUN")
        self.assertEqual(json.loads(empty.stdout)["network_calls_by_evaluator"], 0)


if __name__ == "__main__":
    unittest.main()
