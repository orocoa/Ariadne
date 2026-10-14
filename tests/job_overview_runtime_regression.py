"""Job-only runtime, fail-closed Provider boundary, and grounded read-only output."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.job_overview_runtime import (MODEL, TOOL, JobOverviewError, validate_request,
    validate_output, build_payload, execute, signature, prompt)
from src.personal_understanding_runtime import prompt as personal_prompt

request = json.loads(subprocess.check_output([os.environ.get("ARIADNE_NODE_BINARY", "node"), str(ROOT / "tests/job_overview_regression.mjs"), "--request"], text=True))
validate_request(request)
assert signature()["operation"] == "JOB_OVERVIEW_TURN"
payload = build_payload(request)
assert payload["model"] == MODEL
assert "current Candidate evidence" in prompt("DISCUSS")
assert request["context"]["candidate"]["confirmed"]
assert "星桥访谈项目" in json.dumps(payload,ensure_ascii=False)
assert "past projects" in personal_prompt("DISCUSS")
assert "credential_ref" not in json.dumps(payload)
assert "source_document_id" not in json.dumps(payload)
assert payload["tools"][0]["function"]["strict"] is True
output = {"summary": "这些职位有不同侧重。", "insights": [{"text": "此职位关注用户研究。", "evidence_refs": [request["context"]["evidence"][0]["ref"]]}], "uncertainties": []}
counts = {"credentials": 0, "provider": 0}

def credential():
    counts["credentials"] += 1
    return "synthetic-secret"

def provider(key, value):
    assert key == "synthetic-secret"
    counts["provider"] += 1
    return 200, {"model": MODEL, "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [{"function": {"name": TOOL, "arguments": json.dumps(output)}}]}}], "usage": {"prompt_tokens": 10, "private": "ignored"}}

def rejected(fn, code=None):
    try:
        fn()
    except JobOverviewError as error:
        if code: assert error.code == code, error.code
    else:
        raise AssertionError("unsafe input/output accepted")

result = execute(request, credential, provider)
assert result["persistence"] == "not_written"
assert result["authority"] == "NON_AUTHORITATIVE_JOB_OVERVIEW"
assert result["usage"] == {"prompt_tokens": 10}
baseline = dict(counts)
for field, value in [("mode", "local"), ("model", "deepseek-v4-pro"), ("adapter_version", "unverified")]:
    invalid = copy.deepcopy(request); invalid["runtime_snapshot"][field] = value
    rejected(lambda: execute(invalid, credential, provider)); assert counts == baseline
invalid = copy.deepcopy(request); invalid["consent"]["confirmed"] = False
rejected(lambda: execute(invalid, credential, provider), "JOB_OVERVIEW_CONSENT_REQUIRED"); assert counts == baseline
for field in ("unknown_candidate_context", "personal_memory", "source_document_id", "public_web_sources"):
    invalid = copy.deepcopy(request); invalid["context"][field] = "must not reach Provider"
    rejected(lambda: execute(invalid, credential, provider), "JOB_OVERVIEW_SCOPE_INVALID"); assert counts == baseline
invalid = copy.deepcopy(request); invalid["context"]["evidence"][0]["candidate"] = {"summary": "private"}
rejected(lambda: execute(invalid, credential, provider)); assert counts == baseline
invalid = copy.deepcopy(request); invalid["context"]["history"] = "中" * 256000
rejected(lambda: execute(invalid, credential, provider), "JOB_OVERVIEW_CONTEXT_LIMIT"); assert counts == baseline
invalid = copy.deepcopy(output); invalid["proposals"] = [{"operation": "EDIT"}]
rejected(lambda: validate_output(invalid, request))
invalid = copy.deepcopy(output); invalid["insights"][0]["evidence_refs"] = ["other-job"]
rejected(lambda: validate_output(invalid, request), "JOB_OVERVIEW_GROUNDING_INVALID")
invalid = copy.deepcopy(output); invalid["summary"] = "根据 job-1"
rejected(lambda: validate_output(invalid, request), "JOB_OVERVIEW_INTERNAL_REFERENCE_IN_PROSE")
distill = copy.deepcopy(request); distill.update(phase="DISTILL", human_message="", context={"scope": "CURRENT_JOB_COLLECTION_ONLY", "evidence": [{"ref": "fragment-1", "title": "研究员", "text": "合成 JD", "part": 1, "total_parts": 1}]})
validate_request(distill)
validate_output({"summaries": [{"ref": "fragment-1", "summary": "研究岗位"}]}, distill)
rejected(lambda: validate_output({"summaries": []}, distill), "JOB_OVERVIEW_COVERAGE_INCOMPLETE")
empty = copy.deepcopy(request); empty["context"]["evidence"] = []
validate_request(empty); validate_output({"summary": "请先添加职位。", "insights": [], "uncertainties": []}, empty)
rejected(lambda: execute(request, credential, lambda *_: (503, {})), "JOB_OVERVIEW_PROVIDER_HTTP_ERROR")
rejected(lambda: execute(request, credential, lambda *_: (200, {"model": "wrong-model"})), "JOB_OVERVIEW_OUTPUT_INVALID")
print(json.dumps({"job_scope": "pass", "read_only_output": "pass", "runtime_and_consent_before_credentials": "pass", "grounding": "pass", "live_provider_calls": 0}))

# Detailed personal refs can ground a conclusion; catalog-only refs cannot.
personal_output = copy.deepcopy(output)
personal_output["insights"][0]["evidence_refs"].append(request["context"]["candidate"]["confirmed"][0]["candidate_ref"])
validate_output(personal_output, request)
for edit in (lambda v: v["context"].pop("candidate"),
             lambda v: v["context"]["candidate_coverage"].update(included_records=999),
             lambda v: v["context"]["candidate"].get("confirmed")[0].update(authority="MODEL_CONFIRMED"),
             lambda v: v["context"].update(candidate_status="NO_ACTIVE_RECORDS")):
    invalid=copy.deepcopy(request);edit(invalid);rejected(lambda:validate_request(invalid))
invalid=copy.deepcopy(output);invalid["insights"][0]["evidence_refs"]=["confirmed-candidate-999"]
rejected(lambda:validate_output(invalid,request))
print("Personal coverage, authority and grounding PASS")

# Web preparation happens only after valid runtime/expanded consent/credentials.
from unittest.mock import patch
web_request=copy.deepcopy(request);web_request['human_message']='请结合 https://example.org/ 比较我的项目'
receipt={'ref':'web-1','url':'https://example.org/','final_url':'https://example.org/','title':'合成公开项目','status':'READ','text':'public synthetic project evidence','truncated':False}
with patch('src.job_overview_runtime.prepare_web',return_value=[receipt]) as fetch:
    bad=copy.deepcopy(web_request);bad['consent']['purpose']='JOB_OVERVIEW'
    rejected(lambda:execute(bad,credential,provider),'JOB_OVERVIEW_CONSENT_REQUIRED');fetch.assert_not_called()
    def web_provider(key,value):
        assert 'public synthetic project evidence' in json.dumps(value)
        result=provider(key,value)
        data=json.loads(result[1]['choices'][0]['message']['tool_calls'][0]['function']['arguments'])
        data['insights'][0]['evidence_refs']=['web-1']
        result[1]['choices'][0]['message']['tool_calls'][0]['function']['arguments']=json.dumps(data)
        return result
    web_result=execute(web_request,credential,web_provider)
    fetch.assert_called_once_with(web_request['human_message'])
    assert web_result['web_sources'][0]['status']=='READ'
    assert 'text' not in web_result['web_sources'][0]
print('Web retrieval consent, provider grounding and read receipts PASS')
