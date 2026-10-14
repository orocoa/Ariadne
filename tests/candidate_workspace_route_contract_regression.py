"""Cross-language Slice A route contract regression; provider transport is synthetic."""

from __future__ import annotations

import http.client
import json
import os
import shutil
import subprocess
import sys
import threading
from copy import deepcopy
from http import HTTPStatus
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app  # noqa: E402
from src.candidate_conversation_runtime import (  # noqa: E402
    ACTION_SCHEMA_VERSION, CONTRACT_MANIFEST, MODEL_ID, RUNTIME_RESULT_CONTRACT_VERSION,
    build_candidate_conversation_payload, validate_candidate_conversation_request,
)


NODE = os.environ.get("ARIADNE_NODE_BINARY") or shutil.which("node") or str(Path(sys.executable).resolve().parents[2] / "node" / "bin" / "node")
assert Path(NODE).is_file(), "node_required_for_frontend_request_serializer"
serializer = subprocess.run(
    [NODE, str(ROOT / "tests" / "candidate_workspace_conversation_request_fixture.mjs")],
    cwd=ROOT,
    check=True,
    capture_output=True,
    text=True,
)
payload = json.loads(serializer.stdout)
original_scoped_message = build_candidate_conversation_payload(validate_candidate_conversation_request(payload))["messages"][1]
expected_routing = {"prior_task_available": False, "prior_template_name": "", "template_reuse_confirmed": False, "full_context_available": False}
private_resume_marker = "SYNTHETIC_FULL_RESUME_PACKET_MUST_NOT_REACH_ORDINARY_PROVIDER"

provider_calls = []
provider_fixture = {"mode": "valid"}


def fake_deepseek_transport(_credential: str, provider_payload: dict, *, response_limit: int) -> tuple[int, dict]:
    """Accept the production provider payload without contacting any provider."""
    provider_calls.append({"model": provider_payload.get("model"), "message_count": len(provider_payload.get("messages") or [])})
    assert "ariadne-semantic-candidate-action-v5" in provider_payload["messages"][0]["content"]
    assert "final USER message is the current turn intent" in provider_payload["messages"][0]["content"]
    compiled_context = provider_payload["messages"][1]["content"]
    assert provider_payload["messages"][1] == original_scoped_message
    assert compiled_context.startswith("# Ariadne scoped context\n")
    assert '- title: "Royal College of Art RCA"' in compiled_context
    assert '- card_ref: "card-1"' in compiled_context
    assert "item_id" not in compiled_context
    expected_human_message = "Royal College of Art RCA → Royal College of Art"
    assert "current_user_message" not in compiled_context
    assert "bounded_history" not in compiled_context
    assert provider_payload["messages"][-1] == {"role": "user", "content": expected_human_message}
    assert len(provider_payload["messages"]) == 4
    assert [message["role"] for message in provider_payload["messages"]] == ["system", "user", "user", "user"]
    routing_message = provider_payload["messages"][2]["content"]
    routing_prefix = "Resume routing availability (metadata only): "
    assert routing_message.startswith(routing_prefix)
    assert json.loads(routing_message[len(routing_prefix):]) == expected_routing
    provider_messages = json.dumps(provider_payload["messages"], ensure_ascii=False)
    assert private_resume_marker not in provider_messages
    for private_identity in [payload["working_model"]["working_model_id"], payload["working_model"]["source_document_id"],
                             payload["working_model"]["processing_run_id"], payload["working_model"]["proposal_ids"][0],
                             payload["working_model"]["payload"]["items"][0]["item_id"], payload["working_model"]["fingerprint"],
                             payload["conversation"]["conversation_id"], payload["turn"]["execution_id"]]:
        assert private_identity not in provider_messages
    assert all(message.get("content") != expected_human_message for message in provider_payload["messages"][:-1])
    action = {
        "action": "PATCH_ITEM",
        "patches": [{
            "card_ref": "card-1",
            "changes": [{"intent": "SET", "concept": "school_name", "value": "Royal College of Art"}],
        }],
    }
    if provider_fixture["mode"] == "unknown_concept":
        action["patches"][0]["changes"][0]["concept"] = "unknown_private_like_concept"
        action["patches"][0]["changes"][0]["value"] = "Synthetic value that diagnostics must not retain"
    return HTTPStatus.OK, {
        "id": "synthetic-route-provider-response",
        "model": MODEL_ID,
        "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(action)}}],
        "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
    }


def post(port: int, body: dict, path: str = "/api/candidate-conversation-turn") -> tuple[int, dict, str]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
    connection.request("POST", path, encoded, {"Content-Type": "application/json"})
    response = connection.getresponse()
    payload_body = json.loads(response.read().decode("utf-8"))
    content_type = response.getheader("Content-Type") or ""
    connection.close()
    return response.status, payload_body, content_type


original_credential_reader = app.read_deepseek_key
original_provider_transport = app.call_deepseek_chat_completions
server = None
thread = None
try:
    app.read_deepseek_key = lambda: "synthetic-route-credential"
    app.call_deepseek_chat_completions = fake_deepseek_transport
    server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.JobRadarHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]

    status, result, content_type = post(port, payload)
    assert status == HTTPStatus.OK
    assert content_type.startswith("application/json")
    assert result["contract_id"] == RUNTIME_RESULT_CONTRACT_VERSION
    assert result["model"] == "deepseek-flash"
    assert result["operation"] == "CANDIDATE_CONVERSATION_TURN"
    assert result["action"]["action"] == "PATCH_ITEM"
    assert result["action"]["contract_id"] == ACTION_SCHEMA_VERSION
    assert result["action"]["observed_working_model"]["working_model_id"] == payload["working_model"]["working_model_id"]
    assert result["action"]["patches"] == [{
        "target_item_id": "item-edu-001",
        "operations": [{"operation": "SET_ITEM_FIELD", "field": "title", "value": "Royal College of Art"}],
        "reason": "Resolved from a bounded semantic candidate action.",
        "origin": "MODEL_PROPOSAL",
        "evidence_refs": [],
    }]
    assert len(provider_calls) == 1

    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", "/candidate-conversation-contract-manifest.js")
    manifest_response = connection.getresponse()
    manifest_script = manifest_response.read().decode("utf-8")
    connection.close()
    assert manifest_response.status == HTTPStatus.OK
    assert CONTRACT_MANIFEST["manifest_version"] in manifest_script
    assert "AriadneCandidateConversationContractManifest" in manifest_script

    provider_fixture["mode"] = "unknown_concept"
    status, rejected, _ = post(port, payload)
    assert status == HTTPStatus.OK
    assert rejected["action"]["action"] == "ASK_CLARIFICATION"
    assert rejected["action"]["patches"] == []
    provider_fixture["mode"] = "valid"

    # Even when the transport has prepared a resume packet, an ordinary domain
    # action receives only availability metadata, never full records/old drafts.
    ordinary_with_resume_packet = deepcopy(payload)
    ordinary_with_resume_packet["resume_context"] = {
        "prior_task": {"private_material": private_resume_marker},
        "prior_version": {"deliverable": private_resume_marker},
        "evidence": [{"content": {"text": private_resume_marker}}],
        "template": {"name": "synthetic-reference.pdf"},
        "consent": {"template_reuse_confirmed": True},
    }
    expected_routing = {"prior_task_available": True, "prior_template_name": "synthetic-reference.pdf", "template_reuse_confirmed": True, "full_context_available": True}
    status, ordinary, _ = post(port, ordinary_with_resume_packet)
    assert status == HTTPStatus.OK
    assert ordinary["action"]["action"] == "PATCH_ITEM"
    assert ordinary["persistence"] == "not_written"
    assert "resume_task" not in ordinary
    assert len(provider_calls) == 3
    expected_routing = {"prior_task_available": False, "prior_template_name": "", "template_reuse_confirmed": False, "full_context_available": False}

    unknown = deepcopy(payload)
    unknown["unexpected"] = "synthetic"
    status, rejected, _ = post(port, unknown)
    assert status == HTTPStatus.UNPROCESSABLE_ENTITY
    assert rejected["error"] == "EXACT_SCHEMA_FAILURE"
    assert rejected["failure_layer"] == "contract_validation"
    assert rejected["network_call_made"] is False
    assert len(provider_calls) == 3

    missing = deepcopy(payload)
    missing.pop("turn")
    status, rejected, _ = post(port, missing)
    assert status == HTTPStatus.UNPROCESSABLE_ENTITY
    assert rejected["error"] == "EXACT_SCHEMA_FAILURE"
    assert rejected["network_call_made"] is False
    assert len(provider_calls) == 3
finally:
    if server is not None:
        server.shutdown()
        server.server_close()
    if thread is not None:
        thread.join(timeout=2)
    app.read_deepseek_key = original_credential_reader
    app.call_deepseek_chat_completions = original_provider_transport

print("candidate_workspace_route_contract=pass")
