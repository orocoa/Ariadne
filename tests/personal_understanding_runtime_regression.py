"""Provider contract and no-write boundary for personal understanding."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.personal_understanding_runtime import (MANIFEST, MODEL, PersonalUnderstandingError, validate_request,
    validate_output, build_payload, execute, signature)

NODE = os.environ.get("ARIADNE_NODE_BINARY", "node")
request = json.loads(subprocess.check_output([NODE, str(ROOT / "tests/personal_understanding_regression.mjs"), "--request"], text=True))
validate_request(request)
assert signature()["operation"] == "PERSONAL_UNDERSTANDING_TURN"
outbound = build_payload(request)
assert outbound["model"] == MODEL
assert "Human-saved CORRECTION" in outbound["messages"][0]["content"]
assert "EXACT verbatim human_quote" in outbound["messages"][0]["content"]
assert "credential_ref" not in json.dumps(outbound)
assert "runtime_snapshot" not in json.dumps(outbound)
assert outbound["tools"][0]["function"]["strict"] is True
proposal = dict(operation="ADD", kind="PREFERENCE", text="更喜欢远程协作。", reason="用户明确陈述了偏好。", human_quote="我更喜欢远程协作。", target_memory_ref=None, related_refs=[])
output = {"message": "请查看并确认这条补充。", "proposals": [proposal], "card_proposals": []}
validate_output(output, request)


def expect(code, fn):
    try:
        fn()
    except PersonalUnderstandingError as error:
        assert error.code == code, (error.code, code)
    else:
        raise AssertionError(f"expected {code}")


counts = {"credentials": 0, "provider": 0}


def credential():
    counts["credentials"] += 1
    return "synthetic-secret-never-output"


def provider(key, payload):
    assert key == "synthetic-secret-never-output"
    counts["provider"] += 1
    return 200, {"model": MODEL, "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [{"function": {"name": "deliver_personal_understanding", "arguments": json.dumps(output)}}]}}], "usage": {"prompt_tokens": 150, "completion_tokens": 50, "total_tokens": 200, "private_diagnostic": "ignored"}}


result = execute(request, credential, provider)
assert result["persistence"] == "not_written"
assert result["authority"] == "NON_AUTHORITATIVE_PERSONAL_UNDERSTANDING"
assert result["usage"] == {"prompt_tokens": 150, "completion_tokens": 50, "total_tokens": 200}
baseline = dict(counts)
for field, value, code in [
    ("mode", "local", "PERSONAL_RUNTIME_OR_CONTEXT_INVALID"),
    ("model", "deepseek-v4-pro", "PERSONAL_RUNTIME_INVALID"),
    ("adapter_version", "unqualified-adapter", "PERSONAL_RUNTIME_INVALID"),
]:
    invalid = copy.deepcopy(request)
    invalid["runtime_snapshot"][field] = value
    try:
        execute(invalid, credential, provider)
    except PersonalUnderstandingError as error:
        assert error.code in {code, "PERSONAL_RUNTIME_OR_CONTEXT_INVALID"}
    else:
        raise AssertionError("unsafe runtime accepted")
    assert counts == baseline
invalid = copy.deepcopy(request); invalid["consent"]["confirmed"] = False
expect("PERSONAL_CONSENT_REQUIRED", lambda: execute(invalid, credential, provider)); assert counts == baseline
invalid = copy.deepcopy(request); invalid["context"]["oversized"] = "中" * 256000
expect("PERSONAL_CONTEXT_LIMIT", lambda: execute(invalid, credential, provider)); assert counts == baseline
invalid = copy.deepcopy(request); invalid["context"]["source_document_id"] = "private-source"
expect("PERSONAL_RUNTIME_OR_CONTEXT_INVALID", lambda: execute(invalid, credential, provider)); assert counts == baseline
invalid_output = copy.deepcopy(output); invalid_output["proposals"][0]["human_quote"] = "这是模型编造的经历。"
expect("PERSONAL_QUOTE_INVALID", lambda: validate_output(invalid_output, request))
invalid_output = copy.deepcopy(output); invalid_output["proposals"][0]["related_refs"] = ["other-user-evidence"]
expect("PERSONAL_GROUNDING_INVALID", lambda: validate_output(invalid_output, request))
invalid_output = copy.deepcopy(output); invalid_output["proposals"][0].update(operation="REPLACE", target_memory_ref="invented-memory")
expect("PERSONAL_TARGET_INVALID", lambda: validate_output(invalid_output, request))
card = {"operation": "CREATE", "target_candidate_ref": None, "item_type": "PROJECT", "category": None,
        "title": "Ariadne", "subtitle": None, "time": None, "summary": "个人职业资料理解工具。", "ownership": "产品与实现",
        "facts": [{"label": "项目", "value": "Ariadne"}], "uncertainties": [], "reason": "用户明确要求建立项目资料卡。",
        "source_quotes": ["我更喜欢远程协作。"], "related_refs": []}
card_output = {"message": "已生成待审阅资料卡。", "proposals": [], "card_proposals": [card]}
validate_output(card_output, request)
invalid_card = copy.deepcopy(card_output); invalid_card["card_proposals"][0]["source_quotes"] = ["并不存在的用户原话"]
expect("PERSONAL_CARD_QUOTE_INVALID", lambda: validate_output(invalid_card, request))

distill = copy.deepcopy(request); distill.update(phase="DISTILL", human_message="", context={"evidence": [{"ref": "fragment-1", "text": "Synthetic research"}, {"ref": "fragment-2", "text": "Synthetic portfolio"}]})
validate_request(distill)
validate_output({"summaries": [{"ref": "fragment-1", "summary": "Research"}, {"ref": "fragment-2", "summary": "Portfolio"}]}, distill)
expect("PERSONAL_COVERAGE_INCOMPLETE", lambda: validate_output({"summaries": [{"ref": "fragment-1", "summary": "one omitted"}]}, distill))
synthesis = copy.deepcopy(distill); synthesis["phase"] = "SYNTHESIZE"
validate_output({"summary": "Possible relationship, not confirmed.", "insights": [{"text": "Research and portfolio complement each other.", "evidence_refs": ["fragment-1", "fragment-2"]}], "uncertainties": ["Dates unclear."]}, synthesis)
expect("PERSONAL_GROUNDING_INVALID", lambda: validate_output({"summary": "x", "insights": [{"text": "x", "evidence_refs": ["invented"]}], "uncertainties": []}, synthesis))
expect("PERSONAL_TEXT_INVALID", lambda: validate_output({"summary": "x", "insights": [], "uncertainties": [""]}, synthesis))
expect("PERSONAL_INTERNAL_REFERENCE_IN_PROSE", lambda: validate_output({"summary": "Based on digest-1", "insights": [], "uncertainties": []}, synthesis))
assert build_payload(synthesis)["tools"][0]["function"]["parameters"]["properties"]["summary"]["maxLength"] == 2400
print(json.dumps({"personal_runtime": "pass", "human_quote_and_reference_validation": "pass", "runtime_and_consent_before_credentials": "pass", "coverage_validation": "pass", "live_provider_calls": 0}))
