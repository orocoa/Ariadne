"""Offline contract regression for the J1 Job-specific Provider boundary."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from dataclasses import replace


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.execution_contract import create_runtime_snapshot  # noqa: E402
from src.job_conversation_runtime import (  # noqa: E402
    CREDENTIAL_REF, MANIFEST, MODEL_ID, OPERATION, PROVIDER_ID, REQUEST_CONTRACT,
    RESULT_CONTRACT, RUNTIME, SEMANTIC_OUTPUT_CONTRACT, JobConversationRuntimeError,
    build_job_conversation_payload, execute_job_conversation_request,
    job_conversation_runtime_signature, normalize_job_conversation_response,
    validate_job_conversation_request, validate_semantic_output,
)
from src.provider_runtime import deepseek_model_descriptors  # noqa: E402


SNAPSHOT = create_runtime_snapshot(
    {"mode": "model", "provider": PROVIDER_ID, "model": MODEL_ID},
    model_descriptor=replace(deepseek_model_descriptors([MODEL_ID])[0], delivery_method="compiled_context_text", runtime_capabilities={**deepseek_model_descriptors([MODEL_ID])[0].runtime_capabilities, "candidate_model_structuring": "unsupported", "ai_conversation": "supported"}),
    snapshot_id="runtime-snapshot-job-runtime-test", captured_at="2026-09-04T04:00:00Z",
    credential_ref=CREDENTIAL_REF, adapter_version=RUNTIME["adapter_version"],
    prompt_version=RUNTIME["prompt_version"], schema_version=SEMANTIC_OUTPUT_CONTRACT,
    operation=OPERATION, capability_basis="adapter_verified",
    action_schema_version=SEMANTIC_OUTPUT_CONTRACT,
    request_config_version=RUNTIME["request_config_version"], delivery_method="compiled_context_text",
).to_dict()


COMPILED_CONTEXT = {
    "contract_id": "ariadne-job-provider-context-v1",
    "job": {
        "title": "AI Systems Product Manager", "company": "Synthetic Labs", "location": "上海",
        "summary": "Build evidence-grounded AI products.",
        "requirements": [
            {"requirement_ref": "job-requirement-1", "label": "AI product", "detail": "Design AI product systems", "content_origin": "SOURCE_DERIVED"},
            {"requirement_ref": "job-requirement-2", "label": "Evaluation", "detail": "Build evaluation workflows", "content_origin": "HUMAN_CONFIRMED"},
        ],
        "source_availability": "ORIGINAL_AVAILABLE",
    },
    "candidate": {
        "confirmed": [{"candidate_ref": "confirmed-candidate-1", "authority": "CONFIRMED", "source_availability": "STRUCTURED_ONLY", "item_type": "PROJECT", "title": "AI evaluation project", "summary": "Designed an evidence workflow.", "facts": [], "uncertainties": []}],
        "working": [{"candidate_ref": "working-candidate-1", "authority": "NON_AUTHORITATIVE", "source_availability": "ORIGINAL_AVAILABLE", "item_type": "PROJECT", "title": "Working prototype", "summary": "Unconfirmed HITL prototype.", "facts": [], "uncertainties": []}],
        "policy": "Working information is NON_AUTHORITATIVE and must never be phrased as confirmed truth.",
    },
    "candidate_context_status": {
        "candidate_snapshot_present": True,
        "confirmed_count": 1,
        "working_count": 1,
        "project_count": 2,
        "evidence_count": 2,
    },
    "candidate_delta": [{"change_ref": "candidate-baseline", "change": "BASELINE", "layer": "ALL"}],
    "source_excerpts": [{"excerpt_ref": "source-excerpt-1", "material_owner": "JOB", "location": "p. 1", "text": "Design Human-in-the-loop AI workflows."}],
    "source_status": "AVAILABLE",
    "turn_scope": {"scope": "CURRENT_CANDIDATE_X_ACTIVE_JOB"},
    "change_policy": {"targets": [t for t in MANIFEST["change_targets"] if t.startswith("job.")]},
    "history": [],
    "authority_rules": ["Confirmed Candidate content is Human-authoritative.", "Working Candidate content is NON_AUTHORITATIVE."],
}


def request(message: str = "按照当前资料，我和这个职位差在哪里？") -> dict:
    return {
        "contract_id": REQUEST_CONTRACT,
        "conversation": {"contract_id": MANIFEST["conversation_session_version"], "conversation_id": "job-conversation:synthetic", "created_at": "2026-09-04T04:00:01Z"},
        "human_message": message,
        "observation": {
            "job_context_id": "job-context-private", "job_revision_id": "job-revision-private", "job_revision_version": 3,
            "candidate_confirmed_fingerprint": "sha256:" + "a" * 64,
            "candidate_working_fingerprint": "sha256:" + "b" * 64,
            "candidate_aggregate_fingerprint": "sha256:" + "c" * 64,
        },
        "candidate_manifest": {"confirmed_manifest": [{"identity": "private-candidate-identity"}], "working_manifest": [], "working_inclusion_policy": "INCLUDE_CURRENT_NON_AUTHORITATIVE"},
        "candidate_snapshot_summary": dict(COMPILED_CONTEXT["candidate_context_status"]),
        "candidate_delta": {"contract_id": MANIFEST["candidate_delta_version"], "mode": "BASELINE", "previous_fingerprint": None, "current_fingerprint": "sha256:" + "c" * 64, "changes": [], "provider_view": COMPILED_CONTEXT["candidate_delta"]},
        "source_excerpt_manifest": {"contract_id": MANIFEST["source_excerpt_manifest_version"], "policy_version": MANIFEST["source_retrieval"]["policy_version"], "purpose": "JOB_REQUIREMENT_DETAIL", "status": "AVAILABLE", "method": "EXTRACTION_ARTIFACT", "read_only": True, "excerpts": [{"source_document_id": "source-job-private", "content_hash": "sha256:" + "d" * 64}], "missing_source_document_ids": [], "created_at": "2026-09-04T04:00:02Z", "provider_view": []},
        "compiled_context": json.loads(json.dumps(COMPILED_CONTEXT)),
        "runtime_snapshot": SNAPSHOT,
        "turn": {"execution_id": "job-turn-private", "generation": "job-generation-private"},
    }


def semantic(action: str = "EXPLAIN") -> dict:
    value = {
        "contract_id": SEMANTIC_OUTPUT_CONTRACT,
        "action": action,
        "message": "确认资料支持一部分要求；Working 项目仍未确认。",
        "fit_findings": [{"requirement_ref": "job-requirement-1", "candidate_refs": ["confirmed-candidate-1"], "assessment": "PARTIALLY_SUPPORTED", "explanation": "现有项目展示了相关系统方法。", "uncertainty": None}],
        "gap_findings": [{"requirement_ref": "job-requirement-2", "candidate_refs": [], "gap_type": "EVIDENCE_GAP", "explanation": "当前资料没有足够证据，不能据此推断缺少能力。", "uncertainty": "需要更多验证案例。", "clarification_needed": True}],
        "recommendations": [{"kind": "PROJECT_POSITIONING", "text": "突出证据工作流与 Human-in-the-loop 取舍。", "evidence_state": "EXISTING_EVIDENCE"}],
        "candidate_delta_interpretation": None,
        "clarification": None,
        "source_need": None,
        "changes": [],
    }
    if action == "PROPOSE_JOB_EDIT":
        value["fit_findings"] = []
        value["gap_findings"] = []
        value["recommendations"] = []
        value["message"] = "已形成地点修改建议，等待你确认。"
        value["changes"] = [{"target": "job.location", "value": "深圳", "record_ref": None, "reason": "用户明确要求修改当前职位地点。"}]
    return value


def provider_response(output: dict) -> dict:
    return {"model": MODEL_ID, "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(output, ensure_ascii=False)}}], "usage": {"prompt_tokens": 10, "completion_tokens": 20}}


def expect(code: str, callback) -> None:
    try:
        callback()
        raise AssertionError(f"expected {code}")
    except JobConversationRuntimeError as error:
        assert error.code == code, (error.code, code)


validated = validate_job_conversation_request(request())
payload = build_job_conversation_payload(validated)
assert payload["model"] == MODEL_ID
assert payload["temperature"] == 0.35
assert payload["tool_choice"] == {"type": "function", "function": {"name": "deliver_job_conversation"}}
assert payload["tools"][0]["function"]["strict"] is True
serialized = json.dumps(payload, ensure_ascii=False)
for private in ["job-context-private", "job-revision-private", "private-candidate-identity", "source-job-private", "sha256:", "indexeddb://", "/Users/"]:
    assert private not in serialized
assert "working-candidate-1" in serialized and "NON_AUTHORITATIVE" in serialized
assert "match percentages" in payload["messages"][0]["content"]
assert "Advance the conversation instead of repeating" in payload["messages"][0]["content"]
assert "Public search is available only when the runtime explicitly supplies" in payload["messages"][0]["content"]
assert "Otherwise explain that live search is unavailable" in payload["messages"][0]["content"]
assert "copy every requirement_ref and candidate_ref byte-for-byte" in payload["messages"][0]["content"]
assert "For ordinary conversation use action exactly EXPLAIN" in payload["messages"][0]["content"]
assert "never Markdown delimiters" in payload["messages"][0]["content"]
followup_request = request("那这个项目应该怎么改进？")
followup_request["compiled_context"]["history"] = [
    {"role": "USER", "content": "我现有项目里哪个最适合证明这个能力？"},
    {"role": "ASSISTANT", "content": "AI evaluation project 最相关。"},
]
followup_payload = build_job_conversation_payload(validate_job_conversation_request(followup_request))
assert [message["role"] for message in followup_payload["messages"][-3:]] == ["user", "assistant", "user"]
assert followup_payload["messages"][-1]["content"] == "那这个项目应该怎么改进？"
assert job_conversation_runtime_signature()["runtime_result_contract_version"] == RESULT_CONTRACT

validated_output = validate_semantic_output(semantic(), COMPILED_CONTEXT)
assert validated_output["gap_findings"][0]["gap_type"] == "EVIDENCE_GAP"
redundant_ask = semantic("ASK_CLARIFICATION")
normalized_explain = validate_semantic_output(redundant_ask, COMPILED_CONTEXT)
assert normalized_explain["action"] == "EXPLAIN" and normalized_explain["message"] == redundant_ask["message"]
redundant_explain = semantic()
redundant_explain["clarification"] = "你指的是已确认项目还是 Working 项目？"
assert validate_semantic_output(redundant_explain, COMPILED_CONTEXT)["action"] == "ASK_CLARIFICATION"
conflicting_edit = semantic("PROPOSE_JOB_EDIT")
conflicting_edit["clarification"] = "你要修改地点吗？"
edit_context = json.loads(json.dumps(COMPILED_CONTEXT))

normalized_edit = validate_semantic_output(conflicting_edit, edit_context)
assert normalized_edit["action"] == "PROPOSE_JOB_EDIT" and normalized_edit["clarification"] is None
application_context = json.loads(json.dumps(COMPILED_CONTEXT))
application_context["application"] = {"stage": "APPLIED", "outcome": "", "note": "已联系 HR", "authority": "HUMAN_RECORDED_FOLLOWUP"}
application_context["change_policy"]["targets"] = list(MANIFEST["change_targets"])
application_context["journal"] = {"entries": [{"record_ref": "journal-record-1", "text": "原记录"}]}
stage_edit = semantic("PROPOSE_JOB_EDIT")
stage_edit["changes"] = [{"target": "application.stage", "value": "CLOSED", "record_ref": None, "reason": "用户要求结束本次跟进。"},
                         {"target": "journal.append", "value": "HR 让加老板微信，一直未通过。", "record_ref": None, "reason": "保存用户报告的经过。"}]
assert len(validate_semantic_output(stage_edit, application_context)["changes"]) == 2
invalid_stage = json.loads(json.dumps(stage_edit))
invalid_stage["changes"][0]["value"] = "RESUME_REJECTED"
expect("JOB_CHANGE_SET_INVALID", lambda: validate_semantic_output(invalid_stage, application_context))
expect("JOB_CHANGE_SET_INVALID", lambda: validate_semantic_output(stage_edit, COMPILED_CONTEXT))
for change in [
    {"target": "candidate.summary", "value": "不允许跨域写入", "record_ref": None, "reason": "test"},
    {"target": "journal.update", "value": "无法定位", "record_ref": "journal-record-99", "reason": "test"},
    {"target": "application.note", "value": "x" * 301, "record_ref": None, "reason": "test"},
    {"target": "application.outcome", "value": "HIRED", "record_ref": None, "reason": "test"},
]:
    invalid = semantic("PROPOSE_JOB_EDIT"); invalid["changes"] = [change]
    expect("JOB_CHANGE_SET_INVALID", lambda: validate_semantic_output(invalid, application_context))
duplicate = json.loads(json.dumps(stage_edit)); duplicate["changes"].append(duplicate["changes"][0])
expect("JOB_CHANGE_SET_INVALID", lambda: validate_semantic_output(duplicate, application_context))
fenced_output, _ = normalize_job_conversation_response(
    provider_response(semantic()) | {
        "choices": [{"finish_reason": "stop", "message": {"content": "```json\n" + json.dumps(semantic(), ensure_ascii=False) + "\n```"}}],
    },
    validate_job_conversation_request(request()),
)
assert fenced_output["message"] == semantic()["message"]
tool_output, _ = normalize_job_conversation_response(
    {"model": MODEL_ID, "choices": [{"finish_reason": "tool_calls", "message": {"content": None, "tool_calls": [{"type": "function", "function": {"name": "deliver_job_conversation", "arguments": json.dumps(semantic(), ensure_ascii=False)}}]}}]},
    validate_job_conversation_request(request()),
)
assert tool_output["message"] == semantic()["message"]
invalid_gap = semantic()
invalid_gap["gap_findings"][0]["gap_type"] = "CAPABILITY_BY_ABSENCE"
expect("GAP_FINDING_INVALID", lambda: validate_semantic_output(invalid_gap, COMPILED_CONTEXT))
invalid_ref = semantic()
invalid_ref["fit_findings"][0]["candidate_refs"] = ["persistent-candidate-id"]
expect("CANDIDATE_REF_INVALID", lambda: validate_semantic_output(invalid_ref, COMPILED_CONTEXT))
invalid_source_need = semantic()
invalid_source_need["source_need"] = {"purpose": "UNSUPPORTED_PROVIDER_HINT", "reason": "Need more context."}
normalized_source_need = validate_semantic_output(invalid_source_need, COMPILED_CONTEXT)
assert normalized_source_need["source_need"] is None
leaky_copy = semantic()
leaky_copy["message"] = "最相关的是 AI evaluation project（confirmed-candidate-1），对应 job-requirement-1。"
leaky_copy["fit_findings"][0]["explanation"] = "confirmed-candidate-1 支持 job-requirement-1。"
sanitized_copy = validate_semantic_output(leaky_copy, COMPILED_CONTEXT)
assert sanitized_copy["message"] == "最相关的是 AI evaluation project，对应。"
assert sanitized_copy["fit_findings"][0]["explanation"] == "支持。"

calls = []
result = execute_job_conversation_request(
    request(), lambda: "synthetic-key",
    lambda key, body: (calls.append((key, body)) or (200, provider_response(semantic()))),
)
assert len(calls) == 1
assert result["network_call_made"] is True and result["persistence"] == "not_written"
assert result["provider_called"] is True and result["assistant_copy_source"] == "PROVIDER"
assert result["output"]["gap_findings"][0]["gap_type"] == "EVIDENCE_GAP"

invalid_source_need_calls = []
invalid_source_need_result = execute_job_conversation_request(
    request(), lambda: "synthetic-key",
    lambda key, body: (invalid_source_need_calls.append((key, body)) or (200, provider_response(invalid_source_need))),
)
assert len(invalid_source_need_calls) == 1
assert invalid_source_need_result["output"]["source_need"] is None

edit_calls = []
edit_request = request("把这个职位地点改成深圳")

edit_result = execute_job_conversation_request(
    edit_request, lambda: "synthetic-key",
    lambda key, body: (edit_calls.append((key, body)) or (200, provider_response(semantic("PROPOSE_JOB_EDIT")))),
)
assert len(edit_calls) == 1
assert edit_result["output"]["changes"] == semantic("PROPOSE_JOB_EDIT")["changes"]
assert "job-context-private" not in json.dumps(edit_calls[0][1], ensure_ascii=False)

privacy_request = request()
privacy_request["compiled_context"]["job"]["local_reference"] = "indexeddb://private"
provider_was_called = False


def forbidden_provider(*_args):
    global provider_was_called
    provider_was_called = True
    return 200, provider_response(semantic())


expect("PROVIDER_PAYLOAD_INTERNAL_ID_FORBIDDEN", lambda: execute_job_conversation_request(privacy_request, lambda: "synthetic-key", forbidden_provider))
assert provider_was_called is False

malformed_calls = []
expect("MALFORMED_RESPONSE", lambda: execute_job_conversation_request(
    request(), lambda: "synthetic-key", lambda key, body: (malformed_calls.append((key, body)) or (200, {"model": MODEL_ID, "choices": [{"finish_reason": "stop", "message": {"content": "not json"}}]})),
))
assert len(malformed_calls) == 1

missing_credential_calls = []
expect("deepseek_key_not_configured", lambda: execute_job_conversation_request(request(), lambda: None, lambda *_args: missing_credential_calls.append(True)))
assert missing_credential_calls == []

print(json.dumps({
    "job_runtime_contract": "pass",
    "provider_safe_payload": "pass",
    "fit_gap_validation": "pass",
    "job_edit_semantic_binding": "pass",
    "provider_calls_per_turn": 1,
    "privacy_blocks_before_provider": "pass",
    "no_local_fallback": "pass",
}))
