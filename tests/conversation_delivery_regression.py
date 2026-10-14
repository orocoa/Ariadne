"""Synthetic-only tests; --live explicitly exercises the existing qualified Codex adapter."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.conversation_delivery import validate, conversation_delivery, VERSION
from src.personal_understanding_runtime import execute, PersonalUnderstandingError

PDF = dict(kind="PDF", title="星桥项目介绍", body="星桥是一个合成测试项目。\n\n项目角色\n由测试用户独立设计。", nodes=[], edges=[])
DIAGRAM = dict(kind="DIAGRAM", title="资料整理流程", body="用户提供资料，模型分析后交由用户核对。", nodes=["提供资料", "模型分析", "用户核对"], edges=[{"from": 0, "to": 1, "label": "理解"}, {"from": 1, "to": 2, "label": "确认"}])
assert validate(PDF) == PDF and validate(DIAGRAM) == DIAGRAM and validate(None) is None
for bad in [{**PDF, "kind": "SVG"}, {**PDF, "url": "file:///private"}, {**PDF, "body": "x" * 20001},
            {**DIAGRAM, "edges": [{"from": True, "to": 2, "label": ""}]},
            {**DIAGRAM, "edges": [{"from": 0, "to": 8, "label": ""}]},
            {**DIAGRAM, "edges": [DIAGRAM["edges"][0]] * 2},
            {**PDF, "body": "Bearer synthetic-private-secret"}]:
    try: validate(bad)
    except ValueError: pass
    else: raise AssertionError("invalid deliverable accepted")

node = os.environ.get("ARIADNE_NODE_BINARY", "node")
request = json.loads(subprocess.check_output([node, str(ROOT / "tests/personal_understanding_regression.mjs"), "--request"], text=True))
calls = []
def provider(delivery, malformed_domain=False):
    def call(credential, payload):
        calls.append(payload)
        assert payload["model"] == request["runtime_snapshot"]["model"]
        if payload["tools"][0]["function"]["name"] == "review_document_purpose":
            return 200, {"model": payload["model"], "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [{"function": {"name": "review_document_purpose", "arguments": json.dumps({"is_resume": False})}}]}}]}
        assert "deliverable" in payload["tools"][0]["function"]["parameters"]["properties"]
        output = {"message": "文件将在下方生成。", "proposals": [], "card_proposals": [], "deliverable": delivery}
        if malformed_domain: output["proposals"] = "invalid"
        return 200, {"model": payload["model"], "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [{"function": {"name": "deliver_personal_understanding", "arguments": json.dumps(output)}}]}}]}
    return call
for value in [None, PDF, DIAGRAM, dict(kind="UNSUPPORTED", title="暂不支持创作生图", body="此连接尚未接入插画生成能力。", nodes=[], edges=[])]:
    before = len(calls)
    result = execute(request, lambda: "synthetic-test", provider(value))
    assert len(calls) == before + (2 if value and value["kind"] == "PDF" else 1) and result["persistence"] == "not_written"
    assert result.get("deliverable") == value and "deliverable" not in result["output"]
for value, domain_bad in [({**PDF, "body": ""}, False), (PDF, True)]:
    try: execute(request, lambda: "synthetic-test", provider(value, domain_bad))
    except PersonalUnderstandingError: pass
    else: raise AssertionError("invalid domain/delivery accepted")
# Local rejection and invalid consent happen before provider; no new authority.
invalid = copy.deepcopy(request); invalid["runtime_snapshot"]["mode"] = "local"
before = len(calls)
try: execute(invalid, lambda: "synthetic-test", provider(PDF))
except PersonalUnderstandingError: pass
else: raise AssertionError("Local executed model")
assert len(calls) == before
# Non-discussion phases are passed through without extending their schema.
@conversation_delivery(PersonalUnderstandingError)
def probe(payload, credential_reader, provider_call):
    return provider_call(None, {"untouched": True})
assert probe({"phase": "DISTILL"}, None, lambda _, p: p) == {"untouched": True}
import contextlib
import io
import runpy
for filename, request_name, execute_name, response_name in [
    ("candidate_conversation_runtime_regression.py", "base_request", "execute_candidate_conversation_request", "valid_response"),
    ("job_conversation_runtime_regression.py", "request", "execute_job_conversation_request", None),
    ("job_overview_runtime_regression.py", "request", "execute", None),
]:
    with contextlib.redirect_stdout(io.StringIO()): fixture = runpy.run_path(str(ROOT / "tests" / filename))
    req = fixture[request_name]() if callable(fixture[request_name]) else fixture[request_name]
    if response_name: response = copy.deepcopy(fixture[response_name])
    elif filename.startswith("job_conversation"): response = fixture["provider_response"](fixture["semantic"]())
    else: response = fixture["provider"]("synthetic-secret", {})[1]
    choice = response["choices"][0]
    if choice["finish_reason"] == "tool_calls":
        function = choice["message"]["tool_calls"][0]["function"]
        function["arguments"] = json.dumps({**json.loads(function["arguments"]), "deliverable": PDF})
    else:
        choice["message"]["content"] = json.dumps({**json.loads(choice["message"]["content"]), "deliverable": PDF})
    domain_calls = []
    def domain_provider(_credential, payload):
        domain_calls.append(payload)
        if payload["tools"][0]["function"]["name"] == "review_document_purpose":
            return 200, {"model": payload["model"], "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [{"function": {"name": "review_document_purpose", "arguments": json.dumps({"is_resume": False})}}]}}]}
        return 200, response
    with contextlib.redirect_stdout(io.StringIO()): result = fixture[execute_name](req, lambda: "synthetic-key", domain_provider)
    assert result["deliverable"] == PDF and result["persistence"] == "not_written", filename
    assert len(domain_calls) == 2 and result["delivery_calls"] == 1, filename
print("delivery: bounded schema, semantic PDF purpose review, chat one call/report two calls, no-write, domain failure, Local and phase isolation PASS")

if "--live" in sys.argv:
    from src.runtime_binding import CODEX_MODEL, CODEX_PROTOCOL, CODEX_CREDENTIAL, adapter_for
    from src.model_settings import envelope
    from src.codex_runtime import call_codex
    from concurrent.futures import ThreadPoolExecutor
    live = copy.deepcopy(request)
    runtime = live["runtime_snapshot"]
    runtime.update(provider="codex", model=CODEX_MODEL, protocol=CODEX_PROTOCOL, credential_ref=CODEX_CREDENTIAL,
                   adapter_version=adapter_for("codex", runtime["adapter_version"]), execution_settings=envelope("codex", CODEX_MODEL))
    live["consent"].update(provider="codex", model=CODEX_MODEL)
    cases = [
        ("chat", "PDF和图片有什么区别？只要简单文字解释，不要生成文件。", None),
        ("pdf", "请给我一份星桥项目的介绍文件：星桥是我独立设计的资料整理工具，目前是原型阶段。只使用这三点，不要增加经历，不要提记忆保存建议。", "PDF"),
        ("diagram", "帮我画一张资料整理流程图：提供资料、模型分析、用户核对三个步骤。", "DIAGRAM"),
        ("unsupported", "请生成一张写实风格的森林照片，不要图解也不要文字图片。", "UNSUPPORTED"),
    ]
    target = ROOT / ".cache/conversation-delivery-20260910"; target.mkdir(exist_ok=True)
    def run(case):
        name, message, expected = case
        req = copy.deepcopy(live); req["human_message"] = message
        started = time.monotonic(); result = execute(req, lambda: None, call_codex)
        report = {"case": name, "seconds": round(time.monotonic() - started, 2), "result": result}
        path = target / f"live-{name}-{int(time.time())}.json"
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        actual = (result.get("deliverable") or {}).get("kind")
        assert actual == expected, (name, actual, expected)
        return {"case": name, "kind": actual, "seconds": report["seconds"], "path": str(path)}
    with ThreadPoolExecutor(max_workers=2) as pool:
        for report in pool.map(run, cases): print(json.dumps(report, ensure_ascii=False), flush=True)
