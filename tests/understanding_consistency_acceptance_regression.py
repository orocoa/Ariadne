"""Independent production backend/payload/receipt acceptance, synthetic-only, no network."""
from __future__ import annotations

import contextlib
import copy
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src import candidate_conversation_runtime as candidate
from src import job_conversation_runtime as job
from src import personal_understanding_runtime as personal
from src import job_overview_runtime as overview

NODE = os.environ.get("ARIADNE_NODE_BINARY") or shutil.which("node") or str(Path(sys.executable).resolve().parents[2] / "node" / "bin" / "node")
fixture_flag = "--requests-v3" if "--requests-v3" in sys.argv else "--requests"
bundle = json.loads(subprocess.check_output([NODE, str(ROOT / "tests/understanding_consistency_acceptance_regression.mjs"), fixture_flag], text=True))
assert bundle["synthetic_only"] is True
if fixture_flag == "--requests":
    # Current-history carries an actual production-stored assistant snapshot token;
    # validate that normal conversation continuity survives the new stale-history guard.
    current_history = json.loads(subprocess.check_output([NODE, str(ROOT / "tests/understanding_consistency_acceptance_regression.mjs"), "--current-history-request"], text=True))
    bundle["requests"].extend(current_history["requests"])
MODULES = {"CANDIDATE": candidate, "JOB": job, "PERSONAL": personal, "JOB_OVERVIEW": overview}
VALIDATE = {"CANDIDATE": candidate.validate_candidate_conversation_request, "JOB": job.validate_job_conversation_request,
            "PERSONAL": personal.validate_request, "JOB_OVERVIEW": overview.validate_request}
BUILD = {"CANDIDATE": candidate.build_candidate_conversation_payload, "JOB": job.build_job_conversation_payload,
         "PERSONAL": personal.build_payload, "JOB_OVERVIEW": overview.build_payload}
EXECUTE = {"CANDIDATE": candidate.execute_candidate_conversation_request, "JOB": job.execute_job_conversation_request,
           "PERSONAL": personal.execute, "JOB_OVERVIEW": overview.execute}
results = []


def check(name, run):
    try:
        run()
        results.append({"name": name, "status": "PASS"})
    except Exception as error:
        results.append({"name": name, "status": "FAIL", "error": str(error)})


def context(request, domain):
    return request["compiled_context" if domain in ("CANDIDATE", "JOB") else "context"]


def refresh_diagnostics(request, domain):
    if domain != "CANDIDATE":
        return
    value = request["compiled_context"]
    for _ in range(8):
        size = len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())
        value["diagnostics"]["serialized_size_bytes"] = size
        value["diagnostics"]["estimated_tokens"] = (size + 3) // 4


def valid_output(domain):
    if domain == "CANDIDATE":
        return {"action": "EXPLAIN", "message": "Synthetic transport receipt.", "patches": [], "clarification": None}
    if domain == "JOB":
        return {"contract_id": job.SEMANTIC_OUTPUT_CONTRACT, "action": "EXPLAIN", "message": "Synthetic transport receipt.",
                "fit_findings": [], "gap_findings": [], "recommendations": [], "candidate_delta_interpretation": None,
                "clarification": None, "source_need": None, "changes": []}
    if domain == "PERSONAL":
        return {"message": "Synthetic transport receipt.", "proposals": [], "card_proposals": []}
    return {"summary": "Synthetic transport receipt.", "insights": [], "uncertainties": []}


for case in bundle["requests"]:
    name, domain, request = case["id"], case["domain"], case["request"]

    def outbound(case=case, domain=domain, request=request):
        validated = VALIDATE[domain](request)
        payload = BUILD[domain](validated)
        model_body = json.dumps(payload["messages"], ensure_ascii=False)
        expected = case["expected"]
        if "current_saved" in expected:
            assert expected["current_saved"] in model_body, "saved correction did not reach actual model payload"
            if "replaced_saved" in expected:
                assert expected["replaced_saved"] not in model_body, "replaced version revived in model payload"
            if "unsaved_excluded" in expected:
                assert expected["unsaved_excluded"] not in model_body, "unsaved proposal was treated as current context"
            if "related_tail" in expected:
                assert expected["related_tail"] in model_body, "correction-bound complete evidence tail missing"
        elif "obsolete_saved_excluded" in expected:
            assert expected["obsolete_saved_excluded"] not in model_body, "retracted/invalidated correction reached model"
        else:
            assert expected["obsolete_reply_excluded"] is True
            assert all(turn.get("assistant") is None for turn in request["compiled_context"]["bounded_history"])
            assert "桥木项目最新更正：有效访谈实际为13人" not in model_body
        assert "HUMAN_CONFIRMED_PERSONAL_MEMORY" in model_body
        assert "read-only" in payload["messages"][0]["content"] or "no write permission" in payload["messages"][0]["content"]
        assert "credential_ref" not in model_body

    check(f"{name}: backend validator -> actual model payload", outbound)

    def receipt(domain=domain, request=request):
        count = {"calls": 0}
        expected_payload = BUILD[domain](VALIDATE[domain](request))

        def fake_provider(credential, payload):
            count["calls"] += 1
            assert payload["model"] == request["runtime_snapshot"]["model"]
            assert "personal_context" in json.dumps(payload["messages"], ensure_ascii=False)
            tool_name = payload["tools"][0]["function"]["name"]
            response = {"model": payload["model"], "choices": [{"finish_reason": "tool_calls", "message": {
                "tool_calls": [{"type": "function", "function": {"name": tool_name, "arguments": json.dumps(valid_output(domain))}}]}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}
            return 200, response

        with contextlib.redirect_stdout(io.StringIO()):
            result = EXECUTE[domain](request, lambda: "synthetic-fixture-credential", fake_provider)
        assert count["calls"] == 1
        assert result["persistence"] == "not_written"
        assert result["network_call_made"] is True  # This is adapter contract metadata; fake_provider made no network call.
        assert result["runtime_snapshot_id"] == request["runtime_snapshot"]["snapshot_id"]
        if domain in ("CANDIDATE", "JOB"):
            assert result["execution_id"] == request["turn"]["execution_id"]
        else:
            assert result["request_id"] == request["request_id"]
        assert "synthetic-fixture-credential" not in json.dumps(result)

    check(f"{name}: adapter fake-Provider receipt remains non-authoritative/unwritten", receipt)

    if "current_saved" not in case["expected"]:
        continue
    for corruption in ("wrong-scope", "duplicate-memory", "old-invalid-version", "wrong-reference", "tampered-text", "numeric-token", "numeric-reference", "missing-memory"):
        def reject(corruption=corruption, domain=domain, request=request):
            bad = copy.deepcopy(request)
            value = context(bad, domain)["personal_context"]
            if corruption == "wrong-scope":
                value["scope"] = "PROFILE" if domain == "CANDIDATE" else "CANDIDATE_SOURCE"
            elif corruption == "duplicate-memory":
                value["memories"].append(copy.deepcopy(value["memories"][0]))
            elif corruption == "old-invalid-version":
                value["memories"][0]["version"] = 0
            elif corruption == "wrong-reference":
                value["memories"][0]["related_refs"] = ["card-999" if domain == "CANDIDATE" else "confirmed-candidate-999"]
            elif corruption == "tampered-text":
                value["memories"][0]["text"] += "错误追加"
            elif corruption == "numeric-token":
                value["memories"][0]["version_token"] = 123
            elif corruption == "numeric-reference":
                value["memories"][0]["related_refs"] = [1]
            else:
                # PROFILE requires every saved memory carried by detailed current evidence;
                # Candidate's scoped bundle may validly be empty if no memory is applicable.
                if domain == "CANDIDATE":
                    value["scope_token"] = "f" * 64
                else:
                    value["memories"].pop()
            refresh_diagnostics(bad, domain)
            try:
                VALIDATE[domain](bad)
            except (candidate.CandidateConversationRuntimeError, job.JobConversationRuntimeError, personal.PersonalUnderstandingError, overview.JobOverviewError):
                return
            raise AssertionError(f"{corruption} passed production backend validation")
        check(f"{name}: {corruption} rejected before Provider", reject)

    def local_zero(domain=domain, request=request):
        bad = copy.deepcopy(request); bad["runtime_snapshot"]["mode"] = "local"
        count = {"credentials": 0, "provider": 0}

        def credential():
            count["credentials"] += 1
            return "synthetic-fixture-credential"

        def provider(*_args):
            count["provider"] += 1
            raise AssertionError("Local called a Provider")

        try:
            with contextlib.redirect_stdout(io.StringIO()):
                EXECUTE[domain](bad, credential, provider)
        except Exception:
            pass
        else:
            raise AssertionError("Model adapter accepted Local as executable model request")
        assert count == {"credentials": 0, "provider": 0}

    check(f"{name}: Local zero Provider calls", local_zero)

    if name == "candidate-card-current-history":
        def stale_assistant_token(request=request):
            bad = copy.deepcopy(request)
            assert bad["compiled_context"]["bounded_history"][0]["assistant"] is not None
            bad["compiled_context"]["bounded_history"][0]["assistant"]["personal_context_token"] = "f" * 64
            refresh_diagnostics(bad, "CANDIDATE")
            try:
                candidate.validate_candidate_conversation_request(bad)
            except candidate.CandidateConversationRuntimeError as error:
                assert error.code == "PERSONAL_SAVED_CONTEXT_INVALID"
                return
            raise AssertionError("obsolete assistant token passed production validation")
        check("Candidate history: wrong saved-context assistant token rejected", stale_assistant_token)

candidate_case = next(case for case in bundle["requests"] if case["domain"] == "CANDIDATE")
for message, should_reject in (
        ("没有看到新的已确认依据，不能断言人数已经更正。本次未修改记录。", False),
        ("该数字缺少支持，不宜作为已确认成果。", False),
        ("这是用户已确认的现有资料，当前回复没有修改或保存。", False),
        ("你此前已确认并人工保存的记录仍然有效，本次只做说明。", False),
        ("我已保存到个人资料。", True),
        ("我已写入正式资料。", True),
        ("我已确认你的个人资料。", True),
        ("已确认。", True)):
    def authority_copy(message=message, should_reject=should_reject):
        validated = candidate.validate_candidate_conversation_request(candidate_case["request"])
        raw = {"model": validated.runtime_snapshot["model"], "choices": [{"finish_reason": "tool_calls", "message": {
            "tool_calls": [{"type": "function", "function": {"name": "deliver_candidate_action",
                "arguments": json.dumps({"action": "EXPLAIN", "message": message, "patches": [], "clarification": None}, ensure_ascii=False)}}]}}]}
        try:
            normalized, _usage = candidate.normalize_candidate_conversation_response(raw, validated)
        except candidate.CandidateConversationRuntimeError as error:
            assert should_reject and error.code == "AUTHORITY_COPY_INVALID", (should_reject, error.code)
        else:
            assert not should_reject, "false automatic-save claim passed"
            assert normalized["message"] == message
    check(f"Candidate authority copy: {'reject fake save' if should_reject else 'allow explicit unknown'} — {message}", authority_copy)

report = {"synthetic_only": True, "real_network_calls": 0, "fake_provider_receipts": len(bundle["requests"]),
          "passed": sum(result["status"] == "PASS" for result in results), "failed": sum(result["status"] == "FAIL" for result in results), "results": results}
print(json.dumps(report, ensure_ascii=False, indent=2))
if report["failed"]:
    sys.exit(1)
