"""Validate a human-reviewed real-model evaluation receipt; never call a model.

Structural regression and multimodal transport qualification are separate from
semantic quality. This command never fabricates an evaluation when results are
missing, and never decides intent with keywords.
"""
import argparse
from datetime import datetime
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CASES = ROOT / "tests/fixtures/semantic_review_cases.json"


def evaluate(receipt):
    cases = json.loads(CASES.read_text())["cases"]
    required = {case["id"] for case in cases}
    if not isinstance(receipt, dict) or receipt.get("data") != "synthetic_only" or receipt.get("real_model_execution") is not True:
        raise ValueError("Real execution of synthetic cases must be explicitly evidenced")
    for key in ("provider", "model", "effort", "prompt_version", "source_commit", "executed_at"):
        if not isinstance(receipt.get(key), str) or not receipt[key].strip():
            raise ValueError("Missing evaluation identity: " + key)
    if not re.fullmatch(r"(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})", receipt["source_commit"]):
        raise ValueError("source_commit must be a full Git commit hash")
    try:
        executed = datetime.fromisoformat(receipt["executed_at"].replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("executed_at must be an ISO timestamp with a timezone") from None
    if executed.utcoffset() is None:
        raise ValueError("executed_at must include a timezone")
    # Python's JSON decoder otherwise accepts NaN/Infinity, including inside an
    # original structured output. A receipt must be portable, finite JSON.
    try:
        json.dumps(receipt, allow_nan=False)
    except (TypeError, ValueError):
        raise ValueError("Receipt must contain finite JSON values") from None
    rows = receipt.get("results", [])
    if (not isinstance(rows, list) or len(rows) != len(required)
            or any(not isinstance(row, dict) or not isinstance(row.get("case_id"), str) for row in rows)
            or {row["case_id"] for row in rows} != required):
        raise ValueError("Every semantic case must be evaluated exactly once")
    for row in rows:
        output = row.get("raw_output")
        if not isinstance(output, (str, dict)) or not output or isinstance(output, str) and not output.strip():
            raise ValueError("Original model output required")
        review = row.get("human_review", {})
        if (not isinstance(review, dict) or type(review.get("passed")) is not bool
                or any(not isinstance(review.get(key), str) or not review[key].strip() for key in ("reviewer", "reason"))):
            raise ValueError("Independent human verdict and evidence required")
        for key in ("latency_ms", "input_tokens", "output_tokens"):
            value = row.get(key)
            valid_type = type(value) in (int, float) if key == "latency_ms" else type(value) is int
            if not valid_type or value < 0 or type(value) is float and not math.isfinite(value):
                raise ValueError("Missing execution measurement: " + key)
    failed = [row["case_id"] for row in rows if not row["human_review"]["passed"]]
    return {"status": "REVIEW_FAILED" if failed else "REVIEWED", "all_passed": not failed,
            "provider": receipt["provider"], "model": receipt["model"], "effort": receipt["effort"],
            "cases": len(rows), "passed": sum(row["human_review"]["passed"] for row in rows),
            "failed": failed,
            "total_tokens": sum(row["input_tokens"] + row["output_tokens"] for row in rows),
            # Local completeness checks cannot authenticate a claimed model run
            # or prove that the named reviewer actually performed the review.
            "evidence_authenticity": "SELF_REPORTED_NOT_VERIFIED",
            "network_calls_by_evaluator": 0}


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate JSON field: " + key)
        value[key] = item
    return value


def _reject_constant(_value):
    raise ValueError("Receipt must contain finite JSON values")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path, nargs="?")
    args = parser.parse_args(argv)
    exit_code = 0
    if args.receipt:
        try:
            result = evaluate(json.loads(args.receipt.read_text(), object_pairs_hook=_unique_object,
                                         parse_constant=_reject_constant))
            exit_code = 1 if result["failed"] else 0
        except (OSError, UnicodeError, ValueError):
            result = {"status": "INVALID_RECEIPT", "network_calls_by_evaluator": 0,
                      "reason": "Receipt is unreadable, incomplete, or contains invalid evaluation evidence."}
            exit_code = 2
    else:
        result = {"status": "NOT_RUN", "cases": str(CASES), "network_calls_by_evaluator": 0,
                  "reason": "Real model results and independent human review have not been supplied."}
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
