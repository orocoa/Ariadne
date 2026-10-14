"""Synthetic resume contract checks; no model access or personal materials."""
import base64
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.conversation_delivery import validate, VERSION
from src.personal_understanding_runtime import execute, PersonalUnderstandingError

NODE = os.environ.get("ARIADNE_NODE_BINARY", "node")
RESUME = json.loads(subprocess.check_output([NODE, str(ROOT / "tests/resume_output_regression.mjs"), "--fixture"], text=True))
assert validate(RESUME) == RESUME
for path, item in [
    (("resume", "layout", "body_pt"), True),
    (("resume", "layout", "margin_mm"), 0),
    (("resume", "layout", "line_height"), float("nan")),
    (("resume", "layout", "name_pt"), float("inf")),
    (("resume", "review_notes"), ["Bearer synthetic-secret"]),
    (("resume", "blocks", 0, "text"), "sha256:" + "a" * 64),
    (("resume", "blocks", 3), None),
    (("resume", "blocks", 2, "right"), "not an entry"),
    (("resume", "blocks", 5, "text"), "unexpected page-break text"),
    (("body",), "Second prose authority"),
]:
    value = copy.deepcopy(RESUME)
    parent = value
    for key in path[:-1]: parent = parent[key]
    parent[path[-1]] = item
    try: validate(value)
    except ValueError: pass
    else: raise AssertionError(("invalid resume accepted", path))
invalid = copy.deepcopy(RESUME); invalid["resume"]["layout"]["script"] = "alert(1)"
try: validate(invalid)
except ValueError: pass
else: raise AssertionError("unknown layout field accepted")

request = json.loads(subprocess.check_output([NODE, str(ROOT / "tests/personal_understanding_regression.mjs"), "--request"], text=True))
calls = []
def provider(delivery):
    def call(_credential, payload):
        calls.append(payload)
        output = {"message": "Your resume is below; review notes stay in this chat.", "proposals": [], "card_proposals": [], "deliverable": delivery}
        return 200, {"model": payload["model"], "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [{"function": {"name": "deliver_personal_understanding", "arguments": json.dumps(output)}}]}}]}
    return call
result = execute(request, lambda: "synthetic-test", provider(RESUME))
assert result["deliverable"] == RESUME and result["delivery_version"] == VERSION and result["persistence"] == "not_written"
assert len(calls) == 1 and result["output"]["proposals"] == [] and result["output"]["card_proposals"] == []

# A historical filename alone cannot authorize claiming reference fidelity.
referenced = copy.deepcopy(RESUME); referenced["resume"]["template_name"] = "Synthetic-Template.txt"
try: execute(request, lambda: "synthetic-test", provider(referenced))
except PersonalUnderstandingError as error: assert error.code == "DELIVERABLE_OUTPUT_INVALID"
else: raise AssertionError("unavailable reference accepted")
raw = b"Single-column reference: name, contact, education, experience."
attached = copy.deepcopy(request)
attached["attachments"] = {"contract_id": "ariadne-conversation-attachments-v1", "request_id": request["request_id"],
    "consent": {"confirmed": True, "provider": request["runtime_snapshot"]["provider"], "model": request["runtime_snapshot"]["model"], "purpose": "CURRENT_CONVERSATION_TURN"},
    "files": [{"name": referenced["resume"]["template_name"], "mime_type": "text/plain", "size": len(raw),
               "content_hash": "sha256:" + hashlib.sha256(raw).hexdigest(), "data_url": "data:text/plain;base64," + base64.b64encode(raw).decode()}]}
assert execute(attached, lambda: "synthetic-test", provider(referenced))["deliverable"] == referenced

# All four domain adapters accept the resume without new write authority.
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
        function["arguments"] = json.dumps({**json.loads(function["arguments"]), "deliverable": RESUME})
    else:
        choice["message"]["content"] = json.dumps({**json.loads(choice["message"]["content"]), "deliverable": RESUME})
    with contextlib.redirect_stdout(io.StringIO()): result = fixture[execute_name](req, lambda: "synthetic-test", lambda *_: (200, response))
    assert result["deliverable"] == RESUME and result["persistence"] == "not_written", filename
print("resume delivery: bounded typed schema, private refs, four domains, current-template availability, one call and no new writes PASS")
