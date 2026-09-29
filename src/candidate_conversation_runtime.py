"""Qualified DeepSeek Candidate Conversation turn boundary.

The adapter accepts only an immutable Candidate Working Model observation and
returns one locally validated, non-authoritative action.  It does not read a
PDF, create a ProcessingRun, persist messages, or apply a Working Model patch.
"""

from __future__ import annotations

from src.model_settings import apply_execution_settings
from src.conversation_delivery import conversation_delivery

from src.markdown_context import render_context, INSTRUCTION as MARKDOWN_CONTEXT_INSTRUCTION

import json
import hashlib
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, Callable, Mapping
from urllib.parse import quote

from src.runtime_binding import valid_binding, resolve_runtime_credential
from src.conversation_semantics import HUMAN_CONVERSATION_PRINCIPLES
from src.conversation_attachments import validate_attachments, augment_payload

from src.execution_contract import ExecutionContractError, validate_runtime_snapshot
from src.provider_runtime import OPENAI_CHAT_COMPLETIONS, ProviderRuntimeError
from src.truth_persistence import TruthPersistenceError, validate_candidate_working_model


PROVIDER_ID = "deepseek"
MODEL_ID = "deepseek-flash"
PROTOCOL = OPENAI_CHAT_COMPLETIONS
CAPABILITY_BASIS = "adapter_verified"
CREDENTIAL_REF = "keychain://AI-Learning-OS.JobRadar.DeepSeek/local-vision"
OPERATION = "CANDIDATE_CONVERSATION_TURN"
CONTRACT_ID = "ariadne-candidate-conversation-v1"
SUBJECT_TYPE = "CANDIDATE"

CONTRACT_MANIFEST_PATH = Path(__file__).resolve().parents[1] / "data" / "candidate_conversation_contract_v1.json"
CONTRACT_MANIFEST = json.loads(CONTRACT_MANIFEST_PATH.read_text(encoding="utf-8"))
MANIFEST_VERSION = CONTRACT_MANIFEST["manifest_version"]
RUNTIME_CONTRACTS = CONTRACT_MANIFEST["runtime_contracts"]
RUNTIME_REQUEST_CONTRACT_VERSION = RUNTIME_CONTRACTS["request_contract_version"]
RUNTIME_RESULT_CONTRACT_VERSION = RUNTIME_CONTRACTS["result_contract_version"]
ADAPTER_VERSION = RUNTIME_CONTRACTS["adapter_version"]
PROMPT_VERSION = RUNTIME_CONTRACTS["prompt_version"]
REQUEST_CONFIG_VERSION = RUNTIME_CONTRACTS["request_config_version"]
ACTION_SCHEMA_VERSION = CONTRACT_MANIFEST["canonical_action_version"]
SEMANTIC_ACTION_SCHEMA_VERSION = CONTRACT_MANIFEST["semantic_action_version"]
ACTIONS = set(CONTRACT_MANIFEST["actions"])
UNSUPPORTED_ACTIONS = set(CONTRACT_MANIFEST["unsupported_actions"])
OPERATIONS = set(CONTRACT_MANIFEST["canonical_operations"])
ITEM_FIELDS = set(CONTRACT_MANIFEST["canonical_item_fields"])
CLEARABLE_ITEM_FIELDS = set(CONTRACT_MANIFEST["canonical_clearable_item_fields"])
UNCERTAINTY_STATUSES = set(CONTRACT_MANIFEST["uncertainty_statuses"])
TOP_LEVEL_KEYS = set(CONTRACT_MANIFEST["canonical_keys"]["top_level"])
OBSERVED_KEYS = set(CONTRACT_MANIFEST["canonical_keys"]["observed_working_model"])
PATCH_KEYS = set(CONTRACT_MANIFEST["canonical_keys"]["patch"])
OPERATION_KEYS = {name: set(keys) for name, keys in CONTRACT_MANIFEST["canonical_keys"]["operations"].items()}
LIMITS = CONTRACT_MANIFEST["limits"]
SEMANTIC_CONTRACT = CONTRACT_MANIFEST["semantic_contract"]
SEMANTIC_ACTIONS = set(CONTRACT_MANIFEST["semantic_actions"])
SEMANTIC_INTENTS = set(SEMANTIC_CONTRACT["intents"])
SEMANTIC_CONCEPTS = set(SEMANTIC_CONTRACT["concepts"])
FIELD_IDENTITY = CONTRACT_MANIFEST["field_identity_contract"]
FIELD_DISPLAY_LABELS = FIELD_IDENTITY["canonical_display_labels"]
ITEM_FIELD_SEMANTIC_KEYS = FIELD_IDENTITY["item_field_semantic_keys"]
FACT_LABEL_SEMANTIC_KEYS = FIELD_IDENTITY["fact_label_semantic_keys"]
DIAGNOSTIC_STAGES = {
    "PROVIDER_ENVELOPE", "MODEL_IDENTITY", "FINISH_REASON", "JSON_PARSE", "SEMANTIC_SCHEMA",
    "RESOLUTION", "CANONICAL_SCHEMA", "SEMANTIC_GUARD", "STALE", "AUTHORITY", "PERSISTENCE",
}
MULTI_INTENT_PATTERNS = (
    re.compile(r"(?:所有|全部|每一个|每个|统一这些|这些都|两项|这两|多个|跨(?:卡片|项目))"),
    re.compile(r"\b(?:all|every|both|multiple|across\s+(?:items|cards))\b", re.IGNORECASE),
)


class CandidateConversationRuntimeError(ValueError):
    """A safe fail-closed error code for this bounded adapter."""

    def __init__(self, code: str, failure_layer: str, network_call_made: bool = False, diagnostics: dict[str, Any] | None = None):
        super().__init__(code)
        self.code = code
        self.failure_layer = failure_layer
        self.network_call_made = network_call_made
        self.diagnostics = diagnostics or {}


def _diagnostic(stage: str, code: str, field_category: str | None = None, action_type: Any = None) -> dict[str, Any]:
    if stage not in DIAGNOSTIC_STAGES:
        raise ValueError("unsupported_candidate_conversation_diagnostic_stage")
    result: dict[str, Any] = {"stage": stage, "error_code": code}
    if field_category is not None:
        result["field_category"] = field_category
    if action_type in ACTIONS or action_type in UNSUPPORTED_ACTIONS:
        result["action_type"] = action_type
    return result


def _failure(code: str, layer: str, stage: str, field_category: str | None = None, action_type: Any = None) -> CandidateConversationRuntimeError:
    return CandidateConversationRuntimeError(code, layer, diagnostics=_diagnostic(stage, code, field_category, action_type))


def candidate_conversation_runtime_signature() -> dict[str, str]:
    """Public, allowlisted runtime identity used to prevent browser/server skew."""
    return {
        "manifest_version": MANIFEST_VERSION,
        "semantic_action_schema_version": SEMANTIC_ACTION_SCHEMA_VERSION,
        "canonical_action_schema_version": ACTION_SCHEMA_VERSION,
        "runtime_request_contract_version": RUNTIME_REQUEST_CONTRACT_VERSION,
        "runtime_result_contract_version": RUNTIME_RESULT_CONTRACT_VERSION,
        "adapter_version": ADAPTER_VERSION,
        "prompt_version": PROMPT_VERSION,
        "request_config_version": REQUEST_CONFIG_VERSION,
    }


@dataclass(frozen=True)
class CandidateConversationRequest:
    conversation: dict[str, Any]
    human_message: str
    observation: dict[str, Any]
    working_model: dict[str, Any]
    compiled_context: dict[str, Any] | None
    runtime_snapshot: dict[str, Any]
    draft: dict[str, Any] | None
    execution_id: str
    generation: str


class CandidateConversationExecutionRegistry:
    """Process-local generation guard; cancellation does not claim Provider abort."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._active: dict[str, str] = {}
        self._cancelled: set[tuple[str, str]] = set()
        self._cancellations = {}

    def begin(self, execution_id: str, generation: str) -> bool:
        with self._lock:
            if execution_id in self._active:
                return False
            self._active[execution_id] = generation
            from src.runtime_cancellation import CANCEL
            self._cancellations[(execution_id, generation)] = CANCEL.get()
            return True

    def cancel(self, execution_id: str, generation: str) -> bool:
        with self._lock:
            active_generation = self._active.get(execution_id)
            if active_generation != generation:
                return False
            self._cancelled.add((execution_id, generation))
            self._active.pop(execution_id, None)
            cancellation = self._cancellations.pop((execution_id, generation), None)
        if cancellation is not None: cancellation.cancel()
        return True

    def accept(self, execution_id: str, generation: str) -> bool:
        with self._lock:
            accepted = self._active.get(execution_id) == generation and (execution_id, generation) not in self._cancelled
            if self._active.get(execution_id) == generation:
                self._active.pop(execution_id, None)
            self._cancelled.discard((execution_id, generation))
            self._cancellations.pop((execution_id, generation), None)
            return accepted

    def fail(self, execution_id: str, generation: str) -> None:
        with self._lock:
            if self._active.get(execution_id) == generation:
                self._active.pop(execution_id, None)
            self._cancelled.discard((execution_id, generation))
            self._cancellations.pop((execution_id, generation), None)


def _mapping(value: Any, code: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise CandidateConversationRuntimeError(code, "contract_validation")
    return value


def _exact(value: Any, keys: set[str], code: str = "EXACT_SCHEMA_FAILURE") -> Mapping[str, Any]:
    result = _mapping(value, code)
    if set(result) != keys:
        raise CandidateConversationRuntimeError(code, "contract_validation")
    return result


def _string(value: Any, code: str = "EXACT_SCHEMA_FAILURE", maximum: int = 8000) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        raise CandidateConversationRuntimeError(code, "contract_validation")
    return value.strip()


def _has_explicit_multi_intent(message: str) -> bool:
    return any(pattern.search(message) for pattern in MULTI_INTENT_PATTERNS)


def _normalized_field_value(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value if value is not None else "")).strip().split())


def _normalized_field_label(value: Any) -> str:
    return _normalized_field_value(value).casefold()


def _semantic_key_for_fact_label(label: Any) -> str:
    return FACT_LABEL_SEMANTIC_KEYS.get(_normalized_field_label(label), FIELD_IDENTITY["unknown_legacy_semantic_key"])


def _readable_legacy_label(label: Any) -> str | None:
    value = _normalized_field_value(label)
    if not value:
        return None
    if re.search(r"[\u3400-\u9fff]", value):
        return value
    if re.fullmatch(r"[A-Za-z][A-Za-z ]{1,48}", value):
        return value
    return None


def _canonical_display_label(semantic_key: str, legacy_label: Any = None) -> str:
    if semantic_key == FIELD_IDENTITY["unknown_legacy_semantic_key"]:
        return _readable_legacy_label(legacy_label) or FIELD_IDENTITY["unknown_legacy_display_label"]
    return FIELD_DISPLAY_LABELS.get(semantic_key, FIELD_IDENTITY["unknown_legacy_display_label"])


def candidate_field_descriptors(item: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Project stable runtime identities from the frozen Working item shape."""
    item_identity = _string(item.get("item_id"), "INVALID_TARGET", LIMITS["identifier"])
    descriptors: list[dict[str, Any]] = []
    for field, semantic_key in ITEM_FIELD_SEMANTIC_KEYS.items():
        descriptors.append({
            "canonical_target_identity": f"item:{item_identity}:field:{field}",
            "item_identity": item_identity,
            "storage_target": {"kind": "ITEM_FIELD", "field": field},
            "semantic_key": semantic_key,
            "canonical_display_label": _canonical_display_label(semantic_key),
            "current_value": item.get(field),
        })
    for fact in item.get("facts") or []:
        if not isinstance(fact, Mapping) or not isinstance(fact.get("fact_id"), str) or not fact["fact_id"].strip():
            continue
        fact_identity = fact["fact_id"].strip()
        semantic_key = _semantic_key_for_fact_label(fact.get("label"))
        descriptors.append({
            "canonical_target_identity": f"item:{item_identity}:fact:{fact_identity}",
            "item_identity": item_identity,
            "storage_target": {"kind": "FACT", "fact_id": fact_identity},
            "semantic_key": semantic_key,
            "canonical_display_label": _canonical_display_label(semantic_key, fact.get("label")),
            "legacy_label": _readable_legacy_label(fact.get("label")),
            "semantic_selector_values": [fact.get("label"), fact.get("value")],
            "current_value": fact.get("value"),
        })
    for entry in item.get("uncertainties") or []:
        if not isinstance(entry, Mapping) or not isinstance(entry.get("uncertainty_id"), str) or not entry["uncertainty_id"].strip():
            continue
        uncertainty_identity = entry["uncertainty_id"].strip()
        descriptors.append({
            "canonical_target_identity": f"item:{item_identity}:uncertainty:{uncertainty_identity}",
            "item_identity": item_identity,
            "storage_target": {"kind": "UNCERTAINTY", "uncertainty_id": uncertainty_identity},
            "semantic_key": "UNCERTAINTY_STATUS",
            "canonical_display_label": _canonical_display_label("UNCERTAINTY_STATUS"),
            "semantic_selector_values": [entry.get("question"), entry.get("affects"), entry.get("status")],
            "current_value": entry.get("status"),
        })
    return descriptors


def _fingerprint(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _validate_snapshot(value: Any) -> dict[str, Any]:
    try:
        snapshot = validate_runtime_snapshot(value)
    except ExecutionContractError as error:
        raise CandidateConversationRuntimeError("RUNTIME_SNAPSHOT_INVALID", "runtime") from error
    capabilities = snapshot.capabilities.to_dict()
    if (
        snapshot.mode != "model"
        or not valid_binding(snapshot, ADAPTER_VERSION)
        or snapshot.prompt_version != PROMPT_VERSION
        or snapshot.operation != OPERATION
        or snapshot.capability_basis != CAPABILITY_BASIS
        or snapshot.action_schema_version != ACTION_SCHEMA_VERSION
        or snapshot.request_config_version != REQUEST_CONFIG_VERSION
        or snapshot.delivery_method != "compiled_context_text"
        or capabilities.get("vision") != "supported"
        or capabilities.get("ai_conversation") != "supported"
        or capabilities.get("semantic_understanding") != "supported"
    ):
        raise CandidateConversationRuntimeError("RUNTIME_NOT_ELIGIBLE", "runtime")
    return snapshot.to_dict()


def _validate_conversation(value: Any) -> dict[str, Any]:
    conversation = _exact(value, {"contract_id", "conversation_id", "subject_type", "subject_id", "created_at"})
    subject_id = _string(conversation.get("subject_id"), "CONVERSATION_IDENTITY_INVALID", 256)
    encoded_subject_id = quote(subject_id, safe="~()*!.'-")
    expected_id = f"candidate-conversation:{encoded_subject_id}"
    if (conversation.get("contract_id") != CONTRACT_ID or conversation.get("subject_type") != SUBJECT_TYPE
            or conversation.get("conversation_id") != expected_id):
        raise CandidateConversationRuntimeError("CONVERSATION_IDENTITY_INVALID", "contract_validation")
    _string(conversation.get("created_at"), "CONVERSATION_IDENTITY_INVALID", 64)
    return dict(conversation)


def _validate_focus(value: Any, item_ids: set[str]) -> dict[str, Any]:
    focus = _mapping(value, "FOCUS_INVALID")
    focus_type = focus.get("type")
    expected = {"type"} if focus_type == "CANDIDATE" else {"type", "item_id"} if focus_type == "ITEM" else {"type", "item_id", "draft_fingerprint"} if focus_type == "ITEM_DRAFT" else set()
    if not expected or set(focus) != expected:
        raise CandidateConversationRuntimeError("FOCUS_INVALID", "contract_validation")
    if focus_type != "CANDIDATE" and focus.get("item_id") not in item_ids:
        raise CandidateConversationRuntimeError("INVALID_TARGET", "contract_validation")
    if focus_type == "ITEM_DRAFT" and not re.fullmatch(r"sha256:[a-f0-9]{64}", str(focus.get("draft_fingerprint") or "")):
        raise CandidateConversationRuntimeError("FOCUS_INVALID", "contract_validation")
    return dict(focus)


def _validate_observation(value: Any, working_model: dict[str, Any], conversation: dict[str, Any]) -> dict[str, Any]:
    observation = _exact(value, {"contract_id", "candidate_context_id", "working_model_id", "version", "fingerprint", "focus"})
    if observation.get("contract_id") != f"{CONTRACT_ID}-observation-v1":
        raise CandidateConversationRuntimeError("EXACT_SCHEMA_FAILURE", "contract_validation")
    if (observation.get("candidate_context_id") != conversation["subject_id"]
            or observation.get("working_model_id") != working_model["working_model_id"]
            or observation.get("version") != working_model["version"]
            or observation.get("fingerprint") != working_model["fingerprint"]):
        raise CandidateConversationRuntimeError("STALE_WORKING_OBSERVATION", "stale")
    normalized = dict(observation)
    normalized["focus"] = _validate_focus(observation.get("focus"), {str(item.get("item_id")) for item in working_model["payload"].get("items") or []})
    return normalized


_CONTEXT_FORBIDDEN_KEY = re.compile(r"(?:api[_-]?key|authorization|credential|access[_-]?token|refresh[_-]?token|raw[_-]?(?:pdf|response|http)|pdf[_-]?bytes|rendered[_-]?page|image[_-]?data)", re.IGNORECASE)
_CONTEXT_FORBIDDEN_VALUE = re.compile(r"(?:\bBearer\s+\S+|\b(?:sk|rk|pk|sess)-[A-Za-z0-9_-]{8,}|^data:(?:application|image)/|%PDF)", re.IGNORECASE)


def _assert_compiled_context_safe(value: Any) -> None:
    if isinstance(value, Mapping):
        for key, nested in value.items():
            if not isinstance(key, str) or _CONTEXT_FORBIDDEN_KEY.search(key):
                raise CandidateConversationRuntimeError("CONTEXT_PRIVATE_MATERIAL_FORBIDDEN", "context")
            _assert_compiled_context_safe(nested)
    elif isinstance(value, list):
        for item in value:
            _assert_compiled_context_safe(item)
    elif isinstance(value, str) and _CONTEXT_FORBIDDEN_VALUE.search(value):
        raise CandidateConversationRuntimeError("CONTEXT_PRIVATE_MATERIAL_FORBIDDEN", "context")


def _validate_compiled_context(value: Any, conversation: dict[str, Any], observation: dict[str, Any], working_model: dict[str, Any], human_message: str) -> dict[str, Any]:
    context = _exact(value, {
        "contract_id", "compiler_version", "conversation_subject", "observed_working_model", "focus",
        "candidate", "open_uncertainties", "bounded_history", "current_user_message", "summary", "diagnostics",
    }, "COMPILED_CONTEXT_INVALID")
    if context.get("contract_id") != "ariadne-candidate-conversation-context-v1" or context.get("compiler_version") != "candidate-conversation-context-compiler-v2":
        raise CandidateConversationRuntimeError("COMPILED_CONTEXT_INVALID", "context")
    subject = _exact(context.get("conversation_subject"), {"conversation_id", "subject_type", "candidate_context_id", "source_document_id"}, "COMPILED_CONTEXT_INVALID")
    observed = _exact(context.get("observed_working_model"), {"working_model_id", "version", "fingerprint"}, "COMPILED_CONTEXT_INVALID")
    current = _exact(context.get("current_user_message"), {"message_id", "turn_id", "text", "created_at"}, "COMPILED_CONTEXT_INVALID")
    diagnostics = _mapping(context.get("diagnostics"), "COMPILED_CONTEXT_INVALID")
    if (subject.get("conversation_id") != conversation["conversation_id"] or subject.get("subject_type") != SUBJECT_TYPE
            or subject.get("candidate_context_id") != conversation["subject_id"] or subject.get("source_document_id") != working_model["source_document_id"]
            or dict(observed) != {key: observation[key] for key in ("working_model_id", "version", "fingerprint")}
            or context.get("focus") != observation["focus"] or current.get("text") != human_message
            or not isinstance(context.get("candidate"), Mapping) or not isinstance(context.get("open_uncertainties"), list)
            or not isinstance(context.get("bounded_history"), list) or context.get("summary") is not None):
        raise CandidateConversationRuntimeError("COMPILED_CONTEXT_INVALID", "context")
    _assert_compiled_context_safe(context)
    serialized_size = len(json.dumps(context, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    if diagnostics.get("serialized_size_bytes") != serialized_size or serialized_size > 64 * 1024:
        raise CandidateConversationRuntimeError("CONTEXT_LIMIT_EXCEEDED", "context")
    if diagnostics.get("history_turn_count") != len(context["bounded_history"]) or diagnostics.get("focus_type") != observation["focus"]["type"]:
        raise CandidateConversationRuntimeError("COMPILED_CONTEXT_INVALID", "context")
    return json.loads(json.dumps(context, ensure_ascii=False))


def validate_candidate_conversation_request(payload: Any) -> CandidateConversationRequest:
    request = _mapping(payload, "EXACT_SCHEMA_FAILURE")
    base_keys = {"contract_id", "conversation", "human_message", "observation", "working_model", "runtime_snapshot", "draft", "turn"}
    if set(request) - {"attachments"} not in (base_keys, base_keys | {"compiled_context"}):
        raise CandidateConversationRuntimeError("EXACT_SCHEMA_FAILURE", "contract_validation")
    if request.get("contract_id") != RUNTIME_REQUEST_CONTRACT_VERSION:
        raise CandidateConversationRuntimeError("EXACT_SCHEMA_FAILURE", "contract_validation")
    conversation = _validate_conversation(request.get("conversation"))
    human_message = _string(request.get("human_message"), "HUMAN_MESSAGE_INVALID", LIMITS["human_message"])
    try:
        working_model = validate_candidate_working_model(request.get("working_model"))
    except TruthPersistenceError as error:
        raise CandidateConversationRuntimeError("WORKING_MODEL_INVALID", "contract_validation") from error
    if working_model["fingerprint"] != _fingerprint(working_model["payload"]):
        raise CandidateConversationRuntimeError("WORKING_MODEL_INVALID", "contract_validation")
    observation = _validate_observation(request.get("observation"), working_model, conversation)
    compiled_context = None
    if "compiled_context" in request:
        compiled_context = _validate_compiled_context(request.get("compiled_context"), conversation, observation, working_model, human_message)
    snapshot = _validate_snapshot(request.get("runtime_snapshot"))
    validate_attachments(request, CandidateConversationRuntimeError)
    draft_value = request.get("draft")
    draft = None
    if observation["focus"]["type"] == "ITEM_DRAFT":
        draft_mapping = _exact(draft_value, {"item_id", "item", "draft_fingerprint"})
        if (draft_mapping.get("item_id") != observation["focus"]["item_id"]
                or draft_mapping.get("draft_fingerprint") != observation["focus"]["draft_fingerprint"]
                or not isinstance(draft_mapping.get("item"), Mapping)
                or draft_mapping["item"].get("item_id") != draft_mapping.get("item_id")
                or draft_mapping.get("draft_fingerprint") != _fingerprint(draft_mapping.get("item"))):
            raise CandidateConversationRuntimeError("STALE_WORKING_OBSERVATION", "stale")
        draft = {"item_id": draft_mapping["item_id"], "item": dict(draft_mapping["item"]), "draft_fingerprint": draft_mapping["draft_fingerprint"]}
    elif draft_value is not None:
        raise CandidateConversationRuntimeError("EXACT_SCHEMA_FAILURE", "contract_validation")
    turn = _exact(request.get("turn"), {"execution_id", "generation"})
    execution_id = _string(turn.get("execution_id"), "TURN_EXECUTION_ID_INVALID", 256)
    generation = _string(turn.get("generation"), "TURN_GENERATION_INVALID", 256)
    return CandidateConversationRequest(conversation, human_message, observation, working_model, compiled_context, snapshot, draft, execution_id, generation)


def _source_ref_ids(item: Mapping[str, Any]) -> set[str]:
    result: set[str] = set()
    for ref in item.get("grounding_refs") or []:
        if isinstance(ref, Mapping):
            for key in ("source_ref_id", "grounding_ref_id"):
                if isinstance(ref.get(key), str) and ref[key].strip():
                    result.add(ref[key].strip())
    return result


def _validate_operation(value: Any, item: Mapping[str, Any]) -> dict[str, Any]:
    operation = _mapping(value, "UNSUPPORTED_OPERATION")
    operation_type = operation.get("operation")
    if operation_type not in OPERATIONS:
        raise CandidateConversationRuntimeError("UNSUPPORTED_OPERATION", "contract_validation")
    if operation_type == "SET_ITEM_FIELD":
        _exact(operation, OPERATION_KEYS[operation_type], "ACTION_OPERATION_SHAPE_INVALID")
        if operation.get("field") not in ITEM_FIELDS:
            raise CandidateConversationRuntimeError("INVALID_OPERATION_TARGET", "contract_validation")
        _string(operation.get("value"), "ACTION_OPERATION_SHAPE_INVALID", LIMITS["message"])
        if operation.get("field") == "category":
            _string(operation.get("value"), "ACTION_OPERATION_SHAPE_INVALID", 120)
    elif operation_type == "CLEAR_ITEM_FIELD":
        _exact(operation, OPERATION_KEYS[operation_type], "ACTION_OPERATION_SHAPE_INVALID")
        if operation.get("field") not in CLEARABLE_ITEM_FIELDS:
            raise CandidateConversationRuntimeError("INVALID_OPERATION_TARGET", "contract_validation")
    elif operation_type == "SET_FACT_VALUE":
        _exact(operation, OPERATION_KEYS[operation_type], "ACTION_OPERATION_SHAPE_INVALID")
        _string(operation.get("value"), "ACTION_OPERATION_SHAPE_INVALID", LIMITS["message"])
        fact_id = _string(operation.get("fact_id"), "INVALID_OPERATION_TARGET", LIMITS["identifier"])
        if fact_id not in {fact.get("fact_id") for fact in item.get("facts") or [] if isinstance(fact, Mapping)}:
            raise CandidateConversationRuntimeError("INVALID_OPERATION_TARGET", "contract_validation")
    else:
        _exact(operation, OPERATION_KEYS[operation_type], "ACTION_OPERATION_SHAPE_INVALID")
        if operation.get("status") not in UNCERTAINTY_STATUSES:
            raise CandidateConversationRuntimeError("ACTION_OPERATION_SHAPE_INVALID", "contract_validation")
        uncertainty_id = _string(operation.get("uncertainty_id"), "INVALID_OPERATION_TARGET", LIMITS["identifier"])
        if uncertainty_id not in {entry.get("uncertainty_id") for entry in item.get("uncertainties") or [] if isinstance(entry, Mapping)}:
            raise CandidateConversationRuntimeError("INVALID_OPERATION_TARGET", "contract_validation")
    return dict(operation)


def _validate_patch(value: Any, item_by_id: dict[str, Mapping[str, Any]]) -> dict[str, Any]:
    patch = _exact(value, PATCH_KEYS, "ACTION_PATCH_SHAPE_INVALID")
    target = _string(patch.get("target_item_id"), "INVALID_TARGET", LIMITS["identifier"])
    item = item_by_id.get(target)
    if item is None:
        raise CandidateConversationRuntimeError("INVALID_TARGET", "contract_validation")
    operations = patch.get("operations")
    if not isinstance(operations, list) or not 1 <= len(operations) <= LIMITS["changes_per_patch"]:
        raise CandidateConversationRuntimeError("ACTION_PATCH_SHAPE_INVALID", "contract_validation")
    _string(patch.get("reason"), "ACTION_PATCH_SHAPE_INVALID", LIMITS["reason"])
    if patch.get("origin") != "MODEL_PROPOSAL":
        raise CandidateConversationRuntimeError("ACTION_PATCH_SHAPE_INVALID", "contract_validation")
    evidence_refs = patch.get("evidence_refs")
    if not isinstance(evidence_refs, list) or any(not isinstance(ref, str) or not ref.strip() for ref in evidence_refs):
        raise CandidateConversationRuntimeError("ACTION_PATCH_SHAPE_INVALID", "contract_validation")
    if any(ref not in _source_ref_ids(item) for ref in evidence_refs):
        raise CandidateConversationRuntimeError("INVALID_EVIDENCE_REF", "grounding")
    return {
        "target_item_id": target,
        "operations": [_validate_operation(operation, item) for operation in operations],
        "reason": patch["reason"].strip(),
        "origin": "MODEL_PROPOSAL",
        "evidence_refs": list(evidence_refs),
    }


def validate_candidate_action(raw_action: Any, request: CandidateConversationRequest) -> dict[str, Any]:
    keys = TOP_LEVEL_KEYS | ({"intent_evidence"} if isinstance(raw_action, Mapping) and "intent_evidence" in raw_action else set())
    action = _exact(raw_action, keys, "ACTION_TOP_LEVEL_SHAPE_INVALID")
    if "intent_evidence" in action and action["intent_evidence"] is None:
        raise CandidateConversationRuntimeError("IMPLICIT_MULTI_VIOLATION", "intent")
    multi_authorized = _validated_multi_intent(action.get("intent_evidence"), request)
    if action.get("contract_id") != ACTION_SCHEMA_VERSION:
        raise CandidateConversationRuntimeError("ACTION_TOP_LEVEL_SHAPE_INVALID", "contract_validation", True)
    action_type = action.get("action")
    if action_type in UNSUPPORTED_ACTIONS or action_type not in ACTIONS:
        raise CandidateConversationRuntimeError("UNSUPPORTED_ACTION", "contract_validation", True)
    if not isinstance(action.get("message"), str) or len(action["message"].strip()) > LIMITS["message"]:
        raise CandidateConversationRuntimeError("ACTION_MESSAGE_SHAPE_INVALID", "contract_validation", True)
    if not isinstance(action.get("patches"), list) or len(action["patches"]) > LIMITS["patches"]:
        raise CandidateConversationRuntimeError("ACTION_PATCH_SHAPE_INVALID", "contract_validation", True)
    clarification = action.get("clarification")
    if clarification is not None and (not isinstance(clarification, str) or not clarification.strip() or len(clarification.strip()) > LIMITS["clarification"]):
        raise CandidateConversationRuntimeError("ACTION_CLARIFICATION_SHAPE_INVALID", "contract_validation", True)
    observed = _exact(action.get("observed_working_model"), OBSERVED_KEYS, "ACTION_TOP_LEVEL_SHAPE_INVALID")
    expected_observed = {key: request.observation[key] for key in OBSERVED_KEYS}
    if dict(observed) != expected_observed:
        raise CandidateConversationRuntimeError("STALE_WORKING_OBSERVATION", "stale", True)

    item_by_id = {str(item.get("item_id")): item for item in request.working_model["payload"].get("items") or [] if isinstance(item, Mapping)}
    if request.draft is not None:
        item_by_id[request.draft["item_id"]] = request.draft["item"]
    patches = [_validate_patch(patch, item_by_id) for patch in action["patches"]]
    targets = {patch["target_item_id"] for patch in patches}
    if action_type in {"NO_CHANGE", "ASK_CLARIFICATION", "EXPLAIN"} and patches:
        raise CandidateConversationRuntimeError("ACTION_CARDINALITY_INVALID", "contract_validation", True)
    if action_type == "PATCH_ITEM" and (len(targets) != 1 or not patches):
        raise CandidateConversationRuntimeError("ACTION_CARDINALITY_INVALID", "contract_validation", True)
    if action_type == "PATCH_MULTIPLE_ITEMS" and (len(targets) < 2 or len(patches) < 2):
        raise CandidateConversationRuntimeError("ACTION_CARDINALITY_INVALID", "contract_validation", True)
    if action_type == "PATCH_MULTIPLE_ITEMS" and not multi_authorized:
        raise CandidateConversationRuntimeError("IMPLICIT_MULTI_VIOLATION", "intent", True)
    if action_type == "ASK_CLARIFICATION" and clarification is None:
        raise CandidateConversationRuntimeError("ACTION_CLARIFICATION_SHAPE_INVALID", "contract_validation", True)
    if action_type != "ASK_CLARIFICATION" and clarification is not None:
        raise CandidateConversationRuntimeError("ACTION_CLARIFICATION_SHAPE_INVALID", "contract_validation", True)
    if action_type != "ASK_CLARIFICATION" and not action["message"].strip():
        raise CandidateConversationRuntimeError("ACTION_MESSAGE_SHAPE_INVALID", "contract_validation", True)

    focus = request.observation["focus"]
    if focus["type"] == "ITEM_DRAFT" and any(target != focus["item_id"] for target in targets):
        raise CandidateConversationRuntimeError("FOCUS_VIOLATION", "focus", True)
    if focus["type"] == "ITEM" and any(target != focus["item_id"] for target in targets):
        if action_type != "PATCH_MULTIPLE_ITEMS" or not multi_authorized or focus["item_id"] not in targets:
            raise CandidateConversationRuntimeError("FOCUS_VIOLATION", "focus", True)
    normalized = dict(action)
    normalized["patches"] = patches
    return normalized


def _validated_multi_intent(evidence: Any, request: CandidateConversationRequest) -> bool:
    # Semantics belong to the model; code verifies cited user instructions are
    # actually in this turn's bounded, source-scoped context. Legacy actions
    # without citations retain their original explicit-current-turn gate.
    if evidence is None:
        return _has_explicit_multi_intent(request.human_message)
    evidence = _exact(evidence, {"current_quote", "history_ref", "history_quote"}, "IMPLICIT_MULTI_VIOLATION")
    quote = _string(evidence["current_quote"], "IMPLICIT_MULTI_VIOLATION", LIMITS["human_message"])
    if quote not in request.human_message:
        raise CandidateConversationRuntimeError("IMPLICIT_MULTI_VIOLATION", "intent")
    ref, prior_quote = evidence["history_ref"], evidence["history_quote"]
    if ref is None and prior_quote is None:
        return True
    history = (request.compiled_context or {}).get("bounded_history", [])
    matches = [turn for index, turn in enumerate(history, 1) if ref == f"history-{index}"]
    if len(matches) != 1 or not isinstance(prior_quote, str) or not prior_quote.strip() or prior_quote not in matches[0]["user"]["text"]:
        raise CandidateConversationRuntimeError("IMPLICIT_MULTI_VIOLATION", "intent")
    return True


def _semantic_object(
    value: Any,
    required: set[str],
    optional: set[str],
    aliases: Mapping[str, str],
    category: str,
    action_type: Any = None,
) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise _failure("SEMANTIC_SCHEMA_INVALID", "contract_validation", "SEMANTIC_SCHEMA", category, action_type)
    normalized: dict[str, Any] = {}
    for raw_key, raw_value in value.items():
        key = aliases.get(raw_key, raw_key)
        if key not in required | optional or key in normalized:
            raise _failure("SEMANTIC_SCHEMA_INVALID", "contract_validation", "SEMANTIC_SCHEMA", category, action_type)
        normalized[key] = raw_value
    if not required.issubset(normalized):
        raise _failure("SEMANTIC_SCHEMA_INVALID", "contract_validation", "SEMANTIC_SCHEMA", category, action_type)
    return normalized


def validate_semantic_candidate_action(raw_action: Any) -> dict[str, Any]:
    """Validate the deliberately small model-facing semantic representation."""
    top_required = set(SEMANTIC_CONTRACT["top_level_required"])
    top_optional = set(SEMANTIC_CONTRACT["top_level_optional"])
    top_aliases = SEMANTIC_CONTRACT["key_aliases"]["top_level"]
    action_hint = raw_action.get("action") if isinstance(raw_action, Mapping) else None
    action = _semantic_object(raw_action, top_required, top_optional, top_aliases, "semantic_action.top_level", action_hint)
    action_type = action.get("action")
    if action_type in UNSUPPORTED_ACTIONS or action_type not in SEMANTIC_ACTIONS:
        raise _failure("UNSUPPORTED_ACTION", "contract_validation", "SEMANTIC_GUARD", "semantic_action.action", action_type)
    action_shape = SEMANTIC_CONTRACT["action_shapes"][action_type]

    message = action.get("message", "")
    clarification = action.get("clarification", SEMANTIC_CONTRACT["defaults"]["clarification"])
    patches_value = action.get("patches", SEMANTIC_CONTRACT["defaults"]["patches"])
    if not isinstance(message, str) or len(message.strip()) > LIMITS["message"]:
        raise _failure("ACTION_MESSAGE_SHAPE_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.message", action_type)
    if action_shape["message"] == "REQUIRED_NONEMPTY_STRING" and not message.strip():
        raise _failure("ACTION_MESSAGE_SHAPE_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.message", action_type)
    if action_shape["message"] == "OMITTED" and "message" in action:
        raise _failure("ACTION_MESSAGE_SHAPE_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.message", action_type)
    if clarification is not None and (not isinstance(clarification, str) or not clarification.strip() or len(clarification.strip()) > LIMITS["clarification"]):
        raise _failure("ACTION_CLARIFICATION_SHAPE_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.clarification", action_type)
    if not isinstance(patches_value, list) or len(patches_value) > LIMITS["patches"]:
        raise _failure("ACTION_PATCH_SHAPE_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.patches", action_type)

    patch_required = set(SEMANTIC_CONTRACT["patch_required"])
    patch_optional = set(SEMANTIC_CONTRACT["patch_optional"])
    patch_aliases = SEMANTIC_CONTRACT["key_aliases"]["patch"]
    change_required = set(SEMANTIC_CONTRACT["change_required"])
    change_optional = set(SEMANTIC_CONTRACT["change_optional"])
    change_aliases = SEMANTIC_CONTRACT["key_aliases"]["change"]
    patches: list[dict[str, Any]] = []
    for patch_value in patches_value:
        semantic_patch = _semantic_object(patch_value, patch_required, patch_optional, patch_aliases, "semantic_action.patch", action_type)
        card_ref = semantic_patch.get("card_ref")
        if card_ref is not None:
            semantic_patch["card_ref"] = _string(card_ref, "INVALID_TARGET", LIMITS["identifier"])
        changes_value = semantic_patch.get("changes")
        if not isinstance(changes_value, list) or not 1 <= len(changes_value) <= LIMITS["changes_per_patch"]:
            raise _failure("ACTION_PATCH_SHAPE_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.patch.changes", action_type)
        changes: list[dict[str, Any]] = []
        for change_value in changes_value:
            change = _semantic_object(change_value, change_required, change_optional, change_aliases, "semantic_action.change", action_type)
            intent = change.get("intent")
            concept_value = change.get("concept")
            if intent not in SEMANTIC_INTENTS:
                raise _failure("UNSUPPORTED_MUTATION", "contract_validation", "SEMANTIC_GUARD", "semantic_action.change.intent", action_type)
            if not isinstance(concept_value, str) or not concept_value.strip():
                raise _failure("SEMANTIC_SCHEMA_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.change.concept", action_type)
            concept = SEMANTIC_CONTRACT["concept_aliases"].get(concept_value.strip(), concept_value.strip())
            normalized_change: dict[str, Any] = {"intent": intent, "concept": concept}
            if intent == "SET":
                normalized_change["value"] = _string(change.get("value"), "SEMANTIC_SCHEMA_INVALID", LIMITS["message"])
            elif intent == "CLEAR":
                if "value" in change:
                    raise _failure("SEMANTIC_SCHEMA_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.change.clear", action_type)
            else:
                normalized_change["value"] = _string(change.get("value"), "SEMANTIC_SCHEMA_INVALID", 64)
            if "selector" in change:
                normalized_change["selector"] = _string(change.get("selector"), "SEMANTIC_SCHEMA_INVALID", 1000)
            if "field_ref" in change:
                normalized_change["field_ref"] = _string(change["field_ref"], "INVALID_OPERATION_TARGET", LIMITS["identifier"])
            if intent == "SET_STATUS" and "selector" not in normalized_change and "field_ref" not in normalized_change:
                raise _failure("SEMANTIC_SCHEMA_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.change.selector", action_type)
            changes.append(normalized_change)
        semantic_patch["changes"] = changes
        patches.append(semantic_patch)

    patch_shape = action_shape["patches"]
    if not patch_shape["minimum"] <= len(patches) <= patch_shape["maximum"]:
        raise _failure("ACTION_CARDINALITY_INVALID", "contract_validation", "SEMANTIC_GUARD", "semantic_action.cardinality", action_type)
    if action_type == "ASK_CLARIFICATION" and clarification is None:
        raise _failure("ACTION_CLARIFICATION_SHAPE_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.clarification", action_type)
    if action_type != "ASK_CLARIFICATION" and clarification is not None:
        raise _failure("ACTION_CLARIFICATION_SHAPE_INVALID", "contract_validation", "SEMANTIC_SCHEMA", "semantic_action.clarification", action_type)
    return {
        "action": action_type,
        "message": message.strip(),
        "patches": patches,
        "clarification": clarification.strip() if isinstance(clarification, str) else None,
        **({"intent_evidence": action["intent_evidence"]} if "intent_evidence" in action else {}),
    }


_AUTHORITY_ESCALATION = re.compile(
    r"(?:已保存到个人资料|已确认|已写入正式资料|confirmed\s+profile|saved\s+to\s+(?:the\s+)?profile)",
    re.IGNORECASE,
)
_HUMAN_COPY_CARD_REFERENCE = re.compile(
    r"(?:\s*[（(]card-[0-9]+[）)])|(?:\bcard-[0-9]+\b)",
    re.IGNORECASE,
)


def _human_copy(value: str) -> str:
    sanitized = _HUMAN_COPY_CARD_REFERENCE.sub("", value)
    sanitized = re.sub(r"[ \t]{2,}", " ", sanitized)
    sanitized = re.sub(r"\s+([，。；：！？,.!?:;])", r"\1", sanitized).strip()
    return sanitized


def _canonical_clarification(request: CandidateConversationRequest, copy: str) -> dict[str, Any]:
    return validate_candidate_action({
        "contract_id": ACTION_SCHEMA_VERSION,
        "action": "ASK_CLARIFICATION",
        "message": "",
        "observed_working_model": {key: request.observation[key] for key in OBSERVED_KEYS},
        "patches": [],
        "clarification": copy,
    }, request)


def _matching_concept_mappings(item: Mapping[str, Any], concept: str) -> list[Mapping[str, Any]]:
    item_type = str(item.get("item_type") or "")
    item_subtype = str(item.get("item_subtype") or "")
    matches = []
    for mapping in CONTRACT_MANIFEST["concept_mappings"]:
        if mapping.get("concept") != concept:
            continue
        item_types = mapping.get("item_types") or []
        item_subtypes = mapping.get("item_subtypes") or []
        if "*" not in item_types and item_type not in item_types:
            continue
        if item_subtypes and item_subtype not in item_subtypes:
            continue
        matches.append(mapping)
    return matches


def _operation_for_descriptor(descriptor: Mapping[str, Any], change: Mapping[str, Any], action_type: str) -> dict[str, Any]:
    intent = change["intent"]
    storage_target = descriptor["storage_target"]
    if storage_target["kind"] == "ITEM_FIELD":
        field = storage_target["field"]
        if intent == "SET":
            return {"operation": "SET_ITEM_FIELD", "field": field, "value": change["value"]}
        if intent == "CLEAR" and field in CLEARABLE_ITEM_FIELDS:
            return {"operation": "CLEAR_ITEM_FIELD", "field": field}
    elif storage_target["kind"] == "FACT" and intent == "SET":
        return {"operation": "SET_FACT_VALUE", "fact_id": storage_target["fact_id"], "value": change["value"]}
    elif storage_target["kind"] == "UNCERTAINTY" and intent == "SET_STATUS":
        return {"operation": "SET_UNCERTAINTY_STATUS", "uncertainty_id": storage_target["uncertainty_id"], "status": change["value"]}
    raise _failure("UNSUPPORTED_MUTATION", "contract_validation", "SEMANTIC_GUARD", "semantic_action.change.intent", action_type)


def _resolution_verification(descriptor: Mapping[str, Any], operation: Mapping[str, Any], change: Mapping[str, Any]) -> dict[str, Any]:
    desired_after = operation.get("value", operation.get("status"))
    if operation["operation"] == "CLEAR_ITEM_FIELD":
        desired_after = None
    return {
        "active_item_identity": descriptor["item_identity"],
        "resolved_field_identity": descriptor["canonical_target_identity"],
        "semantic_key": descriptor["semantic_key"],
        "canonical_display_label": descriptor["canonical_display_label"],
        "expected_before_value": descriptor["current_value"],
        "desired_after_value": desired_after,
        "canonical_operation": dict(operation),
        "storage_target": dict(descriptor["storage_target"]),
    }


def _descriptor_candidates_for_mapping(item: Mapping[str, Any], mapping: Mapping[str, Any]) -> list[dict[str, Any]]:
    descriptors = candidate_field_descriptors(item)
    destination = mapping["destination"]
    if destination["kind"] == "ITEM_FIELD":
        return [descriptor for descriptor in descriptors
                if descriptor["storage_target"].get("kind") == "ITEM_FIELD"
                and descriptor["storage_target"].get("field") == destination["field"]]
    if destination["kind"] == "FACT_BY_LABEL":
        semantic_keys = {_semantic_key_for_fact_label(label) for label in destination["labels"]}
        return [descriptor for descriptor in descriptors
                if descriptor["storage_target"].get("kind") == "FACT" and descriptor["semantic_key"] in semantic_keys]
    if destination["kind"] == "FIELD_BY_SEMANTIC_KEY":
        return [descriptor for descriptor in descriptors if descriptor["semantic_key"] == destination["semantic_key"]]
    if destination["kind"] == "DESCRIPTOR_BY_VALUE":
        return [descriptor for descriptor in descriptors if descriptor["storage_target"].get("kind") == "FACT"]
    return []


def _resolve_semantic_change(
    change: Mapping[str, Any], item: Mapping[str, Any], action_type: str
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    if "field_ref" in change:
        descriptors = candidate_field_descriptors(item)
        matches = [entry for index, entry in enumerate(descriptors, 1) if change["field_ref"] == f"field-{index}"]
        if len(matches) != 1:
            raise _failure("INVALID_OPERATION_TARGET", "contract_validation", "RESOLUTION", "semantic_action.change.field_ref", action_type)
        descriptor = matches[0]
        operation = _operation_for_descriptor(descriptor, change, action_type)
        # field_ref already identifies the model-selected current descriptor.
        # A natural-language selector (e.g. 就读时间 vs 日期) is not an
        # expected-before assertion; the immutable observation guards staleness.
        return operation, _resolution_verification(descriptor, operation, change)
    mappings = _matching_concept_mappings(item, str(change["concept"]))
    if not mappings:
        # A recognized semantic concept can be absent from this Card shape.  That is
        # ambiguity for the Human, not a reason to guess another storage target.
        return None
    if len(mappings) != 1:
        return None
    mapping = mappings[0]
    intent = change["intent"]
    if intent not in mapping["allowed_intents"]:
        raise _failure("UNSUPPORTED_MUTATION", "contract_validation", "SEMANTIC_GUARD", "semantic_action.change.intent", action_type)
    destination = mapping["destination"]
    if destination["kind"] == "UNCERTAINTY_BY_ID":
        if change.get("value") not in UNCERTAINTY_STATUSES:
            raise _failure("INVALID_UNCERTAINTY_STATUS", "contract_validation", "SEMANTIC_GUARD", "semantic_action.change.value", action_type)
        candidates = [descriptor for descriptor in candidate_field_descriptors(item)
                      if descriptor["storage_target"].get("kind") == "UNCERTAINTY"]
    else:
        candidates = _descriptor_candidates_for_mapping(item, mapping)

    selector = _normalized_field_value(change.get("selector"))
    if selector and (len(candidates) != 1 or destination["kind"] not in {"ITEM_FIELD", "FIELD_BY_SEMANTIC_KEY"}):
        candidates = [descriptor for descriptor in candidates if selector in {
            _normalized_field_value(descriptor.get("current_value")),
            _normalized_field_value(descriptor.get("canonical_display_label")),
            _normalized_field_value(descriptor.get("legacy_label")),
            *(_normalized_field_value(value) for value in descriptor.get("semantic_selector_values") or []),
        }]
    elif destination["kind"] in {"DESCRIPTOR_BY_VALUE", "UNCERTAINTY_BY_ID"}:
        return None

    if not candidates:
        return None
    if len(candidates) != 1:
        return None
    operation = _operation_for_descriptor(candidates[0], change, action_type)
    return operation, _resolution_verification(candidates[0], operation, change)


def _field_clarification(item: Mapping[str, Any], selector: Any = None) -> str:
    fact_descriptors = [descriptor for descriptor in candidate_field_descriptors(item)
                        if descriptor["storage_target"].get("kind") == "FACT"]
    if selector is not None:
        expected = _normalized_field_value(selector)
        matches = [descriptor for descriptor in fact_descriptors if expected in {
            _normalized_field_value(descriptor.get("current_value")),
            _normalized_field_value(descriptor.get("canonical_display_label")),
            _normalized_field_value(descriptor.get("legacy_label")),
        }]
        if not matches:
            return f"尚未修改「{item.get('title') or '这张卡片'}」。我还不能把「{expected}」对应到当前内容；你希望调整哪一段文字？如果是新增信息，也可以打开卡片的“编辑”补充。"
        fact_descriptors = matches
    visible = [descriptor for descriptor in fact_descriptors if _normalized_field_value(descriptor.get("current_value"))]
    labels = [str(descriptor["canonical_display_label"]) for descriptor in visible]
    duplicate_labels = {label for label in labels if labels.count(label) > 1}
    if visible:
        choices = [
            (f"「{descriptor['canonical_display_label']}」（当前值：「{_normalized_field_value(descriptor.get('current_value'))}」）"
             if descriptor["canonical_display_label"] in duplicate_labels else f"「{descriptor['canonical_display_label']}」")
            for descriptor in visible[:6]
        ]
        return f"你想添加到{'、'.join(choices[:-1]) + '还是' if len(choices) > 1 else ''}{choices[-1]}？"
    return "请说明你想修改这张卡片的哪个字段，例如标题、副标题、时间或摘要。"


def _card_reference_map(request: CandidateConversationRequest) -> dict[str, str]:
    item_ids = [str(item.get("item_id")) for item in request.working_model["payload"].get("items") or [] if isinstance(item, Mapping)]
    if request.draft is not None and request.draft["item_id"] not in item_ids:
        item_ids.append(request.draft["item_id"])
    return {f"card-{index}": item_id for index, item_id in enumerate(item_ids, 1)}


def _same_semantic_value(left: Any, right: Any) -> bool:
    return _normalized_field_value(left) == _normalized_field_value(right)


def _no_change_copy(verifications: list[Mapping[str, Any]]) -> str:
    if not verifications:
        return "当前内容已经符合你的要求，无需修改。"
    details = "；".join(
        f"「{verification['canonical_display_label']}」已经是「{_normalized_field_value(verification['expected_before_value'])}」"
        for verification in verifications[:4]
    )
    return f"{details}，无需修改。"


def resolve_semantic_candidate_action_with_verifications(raw_action: Any, request: CandidateConversationRequest) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    semantic = validate_semantic_candidate_action(raw_action)
    action_type = semantic["action"]
    item_by_id = {str(item.get("item_id")): item for item in request.working_model["payload"].get("items") or [] if isinstance(item, Mapping)}
    if request.draft is not None:
        item_by_id[request.draft["item_id"]] = request.draft["item"]
    focus = request.observation["focus"]
    if semantic["message"]:
        semantic["message"] = _human_copy(semantic["message"])
    if semantic["clarification"]:
        semantic["clarification"] = _human_copy(semantic["clarification"])
    user_copy = semantic["clarification"] if action_type == "ASK_CLARIFICATION" else semantic["message"]
    if _AUTHORITY_ESCALATION.search(user_copy or ""):
        raise _failure("AUTHORITY_COPY_INVALID", "authority", "AUTHORITY", "semantic_action.user_copy", action_type)
    if action_type == "ASK_CLARIFICATION":
        # Preserve useful model questions, but never expose storage identities.
        internal_ids = [str(entry.get(key)) for entry in item_by_id.values() for key in ("item_id",) if entry.get(key)]
        internal_ids += [str(field[key]) for entry in item_by_id.values() for collection, key in (("facts", "fact_id"), ("uncertainties", "uncertainty_id")) for field in entry.get(collection, []) if field.get(key)]
        if any(identity in semantic["clarification"] for identity in internal_ids):
            item = item_by_id.get(focus.get("item_id"))
            return _canonical_clarification(request, _field_clarification(item) if item else "请用卡片的标题说明要调整的范围。"), []
        return _canonical_clarification(request, semantic["clarification"]), []
    if action_type == "PATCH_MULTIPLE_ITEMS" and not _validated_multi_intent(semantic.get("intent_evidence"), request):
        raise _failure("IMPLICIT_MULTI_VIOLATION", "intent", "SEMANTIC_GUARD", "semantic_action.cardinality", action_type)

    card_references = _card_reference_map(request)
    canonical_patches: list[dict[str, Any]] = []
    resolution_verifications: list[dict[str, Any]] = []
    no_change_verifications: list[dict[str, Any]] = []
    for semantic_patch in semantic["patches"]:
        card_ref = semantic_patch.get("card_ref")
        if action_type == "PATCH_ITEM" and focus["type"] in {"ITEM", "ITEM_DRAFT"}:
            if card_ref is not None:
                referenced_target = card_references.get(card_ref)
                if referenced_target != focus["item_id"]:
                    raise _failure("FOCUS_VIOLATION", "focus", "SEMANTIC_GUARD", "semantic_action.patch.card_ref", action_type)
            target = focus["item_id"]
        else:
            if card_ref is None:
                if action_type == "PATCH_ITEM" and focus["type"] == "CANDIDATE" and len(item_by_id) == 1:
                    target = next(iter(item_by_id))
                else:
                    return _canonical_clarification(request, "请用卡片标题、机构或时间说明要修改哪张卡片。"), []
            else:
                target = card_references.get(card_ref)
                if target is None:
                    raise _failure("INVALID_TARGET", "contract_validation", "SEMANTIC_GUARD", "semantic_action.patch.card_ref", action_type)
        item = item_by_id.get(target)
        if item is None:
            raise _failure("INVALID_TARGET", "contract_validation", "SEMANTIC_GUARD", "semantic_action.patch.target", action_type)
        operations: list[dict[str, Any]] = []
        for change in semantic_patch["changes"]:
            if change["concept"] not in SEMANTIC_CONCEPTS and "field_ref" not in change:
                return _canonical_clarification(request, f"尚未修改「{item.get('title') or '这张卡片'}」。当前支持修改标题、分类标签、组织、副标题、日期、摘要、负责内容及已有事实；你希望调整其中哪一项？"), []
            resolved = _resolve_semantic_change(change, item, action_type)
            if resolved is None:
                return _canonical_clarification(request, _field_clarification(item, change.get("selector"))), []
            operation, verification = resolved
            if _same_semantic_value(verification["expected_before_value"], verification["desired_after_value"]):
                no_change_verifications.append(verification)
            else:
                operations.append(operation)
                resolution_verifications.append(verification)
        if operations:
            canonical_patches.append({
                "target_item_id": target,
                "operations": operations,
                "reason": "Resolved from a bounded semantic candidate action.",
                "origin": "MODEL_PROPOSAL",
                "evidence_refs": [],
            })

    if not canonical_patches and semantic["patches"]:
        action_type = "NO_CHANGE"
    elif action_type in {"PATCH_ITEM", "PATCH_MULTIPLE_ITEMS"}:
        action_type = "PATCH_MULTIPLE_ITEMS" if len({patch["target_item_id"] for patch in canonical_patches}) > 1 else "PATCH_ITEM"

    canonical = {
        "contract_id": ACTION_SCHEMA_VERSION,
        "action": action_type,
        "message": (_no_change_copy(no_change_verifications) if action_type == "NO_CHANGE"
                    else semantic["message"] if action_type == "EXPLAIN"
                    else "候选人信息变更已解析，等待本地验证。"),
        "observed_working_model": {key: request.observation[key] for key in OBSERVED_KEYS},
        "patches": canonical_patches,
        "clarification": semantic["clarification"] if action_type == "ASK_CLARIFICATION" else None,
        **({"intent_evidence": semantic["intent_evidence"]} if "intent_evidence" in semantic else {}),
    }
    return validate_candidate_action(canonical, request), resolution_verifications


def resolve_semantic_candidate_action(raw_action: Any, request: CandidateConversationRequest) -> dict[str, Any]:
    action, _verifications = resolve_semantic_candidate_action_with_verifications(raw_action, request)
    return action


def semantic_prompt_schema_fragment() -> str:
    fragment = {
        "schema_version": SEMANTIC_ACTION_SCHEMA_VERSION,
        "actions": CONTRACT_MANIFEST["semantic_actions"],
        "unsupported_actions": CONTRACT_MANIFEST["unsupported_actions"],
        "shape": CONTRACT_MANIFEST["semantic_contract"],
        "concepts": CONTRACT_MANIFEST["semantic_contract"]["concepts"],
        "concept_aliases": CONTRACT_MANIFEST["semantic_contract"]["concept_aliases"],
    }
    return json.dumps(fragment, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def candidate_conversation_prompt() -> str:
    """Semantic model-facing contract; storage bindings remain local."""
    return f"""You are Ariadne's Candidate conversation semantic action planner.
{HUMAN_CONVERSATION_PRINCIPLES}
Return exactly one JSON object and no Markdown or reasoning.
Follow this versioned semantic schema exactly: {semantic_prompt_schema_fragment()}
When focus is ITEM or ITEM_DRAFT, natural references such as this card, here, this project, or this experience mean the active focused item. For an ordinary PATCH_ITEM, prefer omitting card_ref because the system always binds it to the active focused item. If you include a turn-local card_ref anyway, it must identify that same active item; the system verifies it and rejects focus escape.
For Candidate focus, choose a Card only with the turn-local card_ref shown in the current input. A Candidate PATCH_ITEM must include that card_ref unless there is exactly one Card. Never output or infer a persistent item ID. If the Human target is not unique, return ASK_CLARIFICATION.
PATCH_MULTIPLE_ITEMS requires one turn-local card_ref per patch and is allowed only for explicit multi-Card Human intent. In ITEM focus it must include the active Card as one target; the lower canonical focus guard remains authoritative.
Express changes only as semantic intent + concept + desired value. Do not output storage fields, fact IDs, contract IDs, Working observation echoes, origin, authority, provenance, or evidence_refs.
Each current card supplies editable_fields with turn-local field_ref, a human label, current value and allowed_intents. Prefer selecting the appropriate field_ref from that card and concept referenced_field: infer human concepts (responsibility, contribution, education, time, classification, wording) from the actual field labels and content, not literal keyword matching. A field_ref is scoped to its card and this current observation; never reuse it from history. For a precise field_ref omit selector unless needed to disambiguate. Use a complete desired value, preserve unrelated facts, and never inflate contribution or turn missing evidence into missing ability.
When the Human identifies an existing field by its visible label, value, or uncertainty question, put that Human-visible phrase in selector. The selector is only a semantic disambiguator; the system reads and verifies the actual current state. Never output fact IDs, uncertainty IDs, expected-before values, or proof objects.
Understand the complete conversation, not a keyword list. A mutation request may name several items, exclude one from a group, or authorize a previously discussed change with “就这样改 / 直接帮我修改好”. Resolve the scope and desired values from relevant user turns and the CURRENT cards. Never treat a question about feasibility/status, a refusal, or a suggestion by the assistant alone as authorization. Latest corrections/exclusions override earlier scope. If scope is genuinely unclear, ask only for the missing choice, naming the plausible cards.
For PATCH_MULTIPLE_ITEMS provide intent_evidence with current_quote (an exact quote from the latest user message authorizing this edit), history_ref and history_quote (both null for a self-contained request; otherwise cite history-N and an exact earlier USER quote establishing the intended scope/change). Do not cite assistant text or source material as user authorization. Do not invent a prior instruction. The model interprets intent; code checks quotation linkage, current targets, focus, versions and persistence. Evidence does not mean external fact verification.
The category concept is an editable classification label, e.g. 建筑项目, 软件项目. It is separate from immutable item_type/item_subtype (项目经历/工作经历/教育经历). Use SET category to add or replace it, CLEAR category to remove it, even if no category exists yet. Do not search for a field whose current value is 项目标签, do not rewrite the title/summary to simulate a label, and do not ask the user for internal field names. Each card has one classification label; ask a precise question if the user needs multiple independent labels.
For unsupported operations explain the actual capability limit and that nothing changed; do not ask the user to rephrase an already clear instruction. For supported, unambiguous edits, execute a reviewable Working patch without asking “是否需要帮忙操作”. Clarifications must address the actual ambiguity, not generic card-location instructions.
The final USER message is the current turn intent and overrides history. History only supplies context; it never proves that the current request was already applied.
For every mutation request, return PATCH_ITEM or PATCH_MULTIPLE_ITEMS even when the desired value may already be present. The system alone determines NO_CHANGE from current state after semantic resolution.
For an ITEM request of the form “把 X 改成 Y” or an equivalent explicit replacement, if one visible field or fact contains X, select that existing value, use intent SET, and return the complete desired value with X replaced by Y. REPLACE is not a valid intent. Another field already containing Y does not create ambiguity. Do not ask whether to add Y and do not ask for confirmation: the reviewable Working state plus Human Save is the confirmation boundary.
Never create, remove, merge, or delete items. Never invent references. Explain-only requests return EXPLAIN.
Never place item IDs, fact IDs, uncertainty IDs, Working IDs, fingerprints, source/session/turn/action IDs, or other internal identities in Human-facing message or clarification copy.
Turn-local card_ref values are control-plane aliases only. Never print values such as card-1 in Human-facing message or clarification; name the Candidate Material by its visible title instead.
System-owned fields and canonical typed mutations are bound and validated locally."""


def candidate_conversation_tool() -> dict[str, Any]:
    """Force one Candidate-specific semantic action without exposing storage IDs."""
    nullable_string = {"anyOf": [{"type": "string"}, {"type": "null"}]}
    return {
        "type": "function",
        "function": {
            "name": "deliver_candidate_action",
            "description": "Deliver exactly one non-authoritative Candidate semantic action for local validation.",
            "strict": False,
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "required": ["action"],
                "properties": {
                    "intent_evidence": {
                        "type": "object", "additionalProperties": False,
                        "required": ["current_quote", "history_ref", "history_quote"],
                        "properties": {"current_quote": {"type": "string"}, "history_ref": nullable_string, "history_quote": nullable_string},
                    },
                    "action": {"type": "string", "enum": list(CONTRACT_MANIFEST["semantic_actions"])},
                    "message": {"type": "string", "description": "Human answer for EXPLAIN only; omit for mutations."},
                    "patches": {"type": "array", "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["changes"],
                        "properties": {
                            "card_ref": {"type": "string"},
                            "changes": {"type": "array", "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["intent", "concept"],
                                "properties": {
                                    "intent": {"type": "string", "enum": list(CONTRACT_MANIFEST["semantic_contract"]["intents"])},
                                    "concept": {"type": "string", "enum": list(CONTRACT_MANIFEST["semantic_contract"]["concepts"])},
                                    "value": {"type": "string"},
                                    "selector": {"type": "string"},
                                    "field_ref": {"type": "string"},
                                },
                            }},
                        },
                    }},
                    "clarification": nullable_string,
                },
            },
        },
    }


def _provider_item(item: Mapping[str, Any], card_ref: str, *, directory: bool = False) -> dict[str, Any]:
    result = {
        "card_ref": card_ref,
        "category": item.get("category"),
        "item_type": item.get("item_type"),
        "item_subtype": item.get("item_subtype"),
        "title": item.get("title"),
        "subtitle": item.get("subtitle"),
        "time": item.get("time"),
        "summary": item.get("summary"),
    }
    if directory:
        return result
    result.update({
        "editable_fields": [
            {"field_ref": f"field-{index}", "label": entry["canonical_display_label"],
             "current_value": entry["current_value"],
             "allowed_intents": (["SET_STATUS"] if entry["storage_target"]["kind"] == "UNCERTAINTY"
                                 else ["SET", "CLEAR"] if entry["storage_target"].get("field") in CLEARABLE_ITEM_FIELDS else ["SET"])}
            for index, entry in enumerate(candidate_field_descriptors(item), 1)
        ],
        "ownership": item.get("ownership"),
        "facts": [{"label": fact.get("label"), "value": fact.get("value")}
                  for fact in item.get("facts") or [] if isinstance(fact, Mapping)],
        "open_uncertainties": [{"question": entry.get("question"), "affects": entry.get("affects"), "status": entry.get("status")}
                               for entry in item.get("uncertainties") or [] if isinstance(entry, Mapping) and entry.get("status") == "OPEN"],
    })
    return result


def _provider_candidate_context(request: CandidateConversationRequest) -> dict[str, Any]:
    reference_map = _card_reference_map(request)
    reference_by_id = {item_id: card_ref for card_ref, item_id in reference_map.items()}
    item_by_id = {str(item.get("item_id")): item for item in request.working_model["payload"].get("items") or [] if isinstance(item, Mapping)}
    if request.draft is not None:
        item_by_id[request.draft["item_id"]] = request.draft["item"]
    focus = request.observation["focus"]
    if focus["type"] == "CANDIDATE":
        candidate = {
            "target_mode": "CANDIDATE",
            "candidate_items": [_provider_item(item_by_id[item_id], card_ref) for card_ref, item_id in reference_map.items()],
            "current_item": None,
            "other_item_directory": [],
        }
        provider_focus = {"type": "CANDIDATE"}
    else:
        active_id = focus["item_id"]
        active_ref = reference_by_id[active_id]
        candidate = {
            "target_mode": focus["type"],
            "candidate_items": [],
            "current_item": _provider_item(item_by_id[active_id], active_ref),
            "other_item_directory": [],
        }
        provider_focus = {"type": focus["type"], "active_card_ref": active_ref}
    return {"focus": provider_focus, "candidate": candidate, "capabilities": {
        "editable_scope": "current source Working cards only; ITEM_DRAFT cannot escape its focused card",
        "mutation_result": "reviewable Working, never automatically saved to confirmed personal information",
        "can_edit": "the supplied editable_fields; multiple current cards with user-authorized scope and exclusions",
        "cannot_edit": "create/delete/merge cards, add fact rows, source documents, identities, system item types, or another source/domain",
        "history_policy": "history is context, not proof of application; read current values and latest user intent",
    }}


def _model_input(request: CandidateConversationRequest) -> dict[str, Any]:
    context = _provider_candidate_context(request)
    return {
        "conversation": {"subject_type": SUBJECT_TYPE},
        **context,
        "human_message": request.human_message,
    }


def build_candidate_conversation_payload(request: CandidateConversationRequest) -> dict[str, Any]:
    if request.compiled_context is None:
        messages = [
            {"role": "system", "content": candidate_conversation_prompt() + MARKDOWN_CONTEXT_INSTRUCTION},
            {"role": "user", "content": render_context(_model_input(request))},
        ]
    else:
        context_only = {
            **_provider_candidate_context(request),
            "conversation_subject": {"subject_type": SUBJECT_TYPE},
            "summary": request.compiled_context.get("summary"),
        }
        messages = [
            {"role": "system", "content": candidate_conversation_prompt() + MARKDOWN_CONTEXT_INSTRUCTION},
            {"role": "user", "content": render_context({"message_type": "COMPILED_CANDIDATE_CONTEXT", "context": context_only})},
        ]
        for index, turn in enumerate(request.compiled_context["bounded_history"], 1):
            messages.append({"role": "user", "content": json.dumps({"history_ref": f"history-{index}", "text": str(turn["user"]["text"])}, ensure_ascii=False)})
            outcome = turn.get("action_result")
            if outcome:
                titles = {item["item_id"]: item.get("title") for item in request.working_model["payload"].get("items", [])}
                result = {"status": outcome["status"], "action": outcome["action"], "card_titles": [titles.get(identity, "不在当前卡片范围") for identity in outcome["target_item_ids"]]}
                messages.append({"role": "assistant", "content": json.dumps({"text": str(turn["assistant"]["text"]), "actual_operation_result": result}, ensure_ascii=False)})
            else:
                messages.append({"role": "assistant", "content": str(turn["assistant"]["text"])})
        messages.append({"role": "user", "content": request.human_message})
    return {
        "model": request.runtime_snapshot["model"],
        "messages": messages,
        "tools": [candidate_conversation_tool()],
        "tool_choice": {"type": "function", "function": {"name": "deliver_candidate_action"}},
        "thinking": {"type": "disabled"},
        "temperature": 0,
        "max_tokens": min(8000, max(1400, 600 + len(request.working_model["payload"].get("items", [])) * 240)),
    }


def response_diagnostics(provider_response: Any, http_status: int | None = None) -> dict[str, Any]:
    """Return only allowlisted Provider envelope metadata; never response text."""
    diagnostics: dict[str, Any] = {
        "provider_http_status": http_status,
        "response_type": type(provider_response).__name__,
        "exact_returned_model_match": False,
        "finish_reason": None,
        "content_type": "missing",
        "content_length": None,
        "prompt_tokens": None,
        "completion_tokens": None,
        "total_tokens": None,
        "reasoning_content_present": False,
        "reasoning_content_length": None,
        "refusal_present": False,
        "tool_calls_present": False,
        "message_key_names": [],
    }
    if not isinstance(provider_response, Mapping):
        return diagnostics
    diagnostics["returned_model"] = provider_response.get("model") if isinstance(provider_response.get("model"), str) else None
    diagnostics["exact_returned_model_match"] = diagnostics["returned_model"] == MODEL_ID
    choices = provider_response.get("choices")
    diagnostics["choices_count"] = len(choices) if isinstance(choices, list) else None
    if isinstance(choices, list) and choices and isinstance(choices[0], Mapping):
        diagnostics["finish_reason"] = choices[0].get("finish_reason")
        message = choices[0].get("message")
        if isinstance(message, Mapping):
            diagnostics["message_key_names"] = sorted(str(key) for key in message.keys())
            content = message.get("content")
            diagnostics["content_type"] = "string" if isinstance(content, str) else "null" if content is None else type(content).__name__
            diagnostics["content_length"] = len(content) if isinstance(content, str) else None
            reasoning = message.get("reasoning_content")
            diagnostics["reasoning_content_present"] = reasoning is not None
            diagnostics["reasoning_content_length"] = len(reasoning) if isinstance(reasoning, str) else None
            diagnostics["refusal_present"] = message.get("refusal") is not None
            tool_calls = message.get("tool_calls")
            diagnostics["tool_calls_present"] = bool(tool_calls) if isinstance(tool_calls, list) else tool_calls is not None
    usage = provider_response.get("usage")
    if isinstance(usage, Mapping):
        for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
            if isinstance(usage.get(key), int):
                diagnostics[key] = usage[key]
    return diagnostics


def _normalize_candidate_conversation_response_with_verifications(
    provider_response: Any, request: CandidateConversationRequest, http_status: int = 200
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    diagnostics = response_diagnostics(provider_response, http_status)
    diagnostics["exact_returned_model_match"] = diagnostics.get("returned_model") == request.runtime_snapshot["model"]
    if http_status != 200:
        raise CandidateConversationRuntimeError("PROVIDER_HTTP_ERROR", "provider", True, {**diagnostics, **_diagnostic("PROVIDER_ENVELOPE", "PROVIDER_HTTP_ERROR")})
    if not isinstance(provider_response, Mapping):
        raise CandidateConversationRuntimeError("MALFORMED_RESPONSE", "parsing", True, {**diagnostics, **_diagnostic("PROVIDER_ENVELOPE", "MALFORMED_RESPONSE")})
    if provider_response.get("model") != request.runtime_snapshot["model"]:
        raise CandidateConversationRuntimeError("WRONG_RETURNED_MODEL", "model", True, {**diagnostics, **_diagnostic("MODEL_IDENTITY", "WRONG_RETURNED_MODEL")})
    choices = provider_response.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], Mapping):
        raise CandidateConversationRuntimeError("MALFORMED_RESPONSE", "parsing", True, {**diagnostics, **_diagnostic("PROVIDER_ENVELOPE", "MALFORMED_RESPONSE")})
    if choices[0].get("finish_reason") == "length":
        raise CandidateConversationRuntimeError("TRUNCATED_OUTPUT", "model_output", True, {**diagnostics, **_diagnostic("FINISH_REASON", "TRUNCATED_OUTPUT")})
    message = choices[0].get("message")
    finish_reason = choices[0].get("finish_reason")
    if finish_reason == "tool_calls" and isinstance(message, Mapping):
        tool_calls = message.get("tool_calls")
        if not isinstance(tool_calls, list) or len(tool_calls) != 1 or not isinstance(tool_calls[0], Mapping):
            raise CandidateConversationRuntimeError("MALFORMED_RESPONSE", "model_output", True, {**diagnostics, **_diagnostic("PROVIDER_ENVELOPE", "MALFORMED_RESPONSE")})
        function = tool_calls[0].get("function")
        if not isinstance(function, Mapping) or function.get("name") != "deliver_candidate_action" or not isinstance(function.get("arguments"), str):
            raise CandidateConversationRuntimeError("MALFORMED_RESPONSE", "model_output", True, {**diagnostics, **_diagnostic("PROVIDER_ENVELOPE", "MALFORMED_RESPONSE")})
        content = function["arguments"]
    elif finish_reason == "stop":
        content = message.get("content") if isinstance(message, Mapping) else None
    else:
        raise CandidateConversationRuntimeError("MALFORMED_RESPONSE", "model_output", True, {**diagnostics, **_diagnostic("FINISH_REASON", "MALFORMED_RESPONSE")})
    if not isinstance(content, str) or not content.strip():
        if not isinstance(content, str):
            classification = "EMPTY_RESPONSE_UNEXPECTED_MESSAGE_SHAPE"
        elif diagnostics["reasoning_content_present"] and (diagnostics["reasoning_content_length"] or 0) > 0:
            classification = "EMPTY_RESPONSE_REASONING_ONLY"
        elif diagnostics["completion_tokens"] == 0:
            classification = "EMPTY_RESPONSE_ZERO_COMPLETION"
        elif isinstance(diagnostics["completion_tokens"], int) and diagnostics["completion_tokens"] > 0:
            classification = "EMPTY_RESPONSE_NONZERO_COMPLETION"
        else:
            classification = "EMPTY_RESPONSE_UNCLASSIFIED"
        raise CandidateConversationRuntimeError("EMPTY_RESPONSE", "parsing", True, {
            **diagnostics,
            **_diagnostic("JSON_PARSE", "EMPTY_RESPONSE"),
            "empty_response_classification": classification,
        })
    try:
        raw_action = json.loads(content)
    except json.JSONDecodeError as error:
        raise CandidateConversationRuntimeError("MALFORMED_RESPONSE", "parsing", True, {**diagnostics, **_diagnostic("JSON_PARSE", "MALFORMED_RESPONSE")}) from error
    try:
        action, resolution_verifications = resolve_semantic_candidate_action_with_verifications(raw_action, request)
    except CandidateConversationRuntimeError as error:
        error_diagnostics = error.diagnostics
        if not error_diagnostics:
            stage = "STALE" if error.code == "STALE_WORKING_OBSERVATION" else "CANONICAL_SCHEMA" if error.code.startswith("ACTION_") else "SEMANTIC_GUARD"
            error_diagnostics = _diagnostic(stage, error.code)
        raise CandidateConversationRuntimeError(error.code, error.failure_layer, True, {**diagnostics, **error_diagnostics}) from error
    usage = provider_response.get("usage") if isinstance(provider_response.get("usage"), Mapping) else {}
    return action, resolution_verifications, dict(usage)


def normalize_candidate_conversation_response(provider_response: Any, request: CandidateConversationRequest, http_status: int = 200) -> tuple[dict[str, Any], dict[str, Any]]:
    action, _resolution_verifications, usage = _normalize_candidate_conversation_response_with_verifications(provider_response, request, http_status)
    return action, usage


@conversation_delivery(CandidateConversationRuntimeError)
def execute_candidate_conversation_request(
    payload: Any,
    credential_reader: Callable[[], str | None],
    provider_call: Callable[[str, dict[str, Any]], tuple[int, dict[str, Any]]],
) -> dict[str, Any]:
    request = validate_candidate_conversation_request(payload)
    try:
        credential = resolve_runtime_credential(
            request.runtime_snapshot["credential_ref"], CREDENTIAL_REF, credential_reader,
            invalid_code="CREDENTIAL_REFERENCE_INVALID", missing_code="deepseek_key_not_configured",
        )
    except ProviderRuntimeError as error:
        raise CandidateConversationRuntimeError(error.code, error.failure_layer) from error
    provider_payload = augment_payload(build_candidate_conversation_payload(request), payload, CandidateConversationRuntimeError)
    http_status, provider_response = provider_call(credential, apply_execution_settings(provider_payload, request.runtime_snapshot))
    action, _resolution_verifications, usage = _normalize_candidate_conversation_response_with_verifications(provider_response, request, http_status)
    print(
        "candidate_conversation_acceptance submit_event=fired domain=candidate "
        f"operation={OPERATION} provider_called=true provider={request.runtime_snapshot['provider']} model={request.runtime_snapshot['model']} "
        f"result_type={action['action']} working_proposal_created={'yes' if action['patches'] else 'no'} "
        "confirmed_mutation_before_save=no",
        flush=True,
    )
    return {
        "contract_id": RUNTIME_RESULT_CONTRACT_VERSION,
        "execution_id": request.execution_id,
        "generation": request.generation,
        "conversation_id": request.conversation["conversation_id"],
        "operation": OPERATION,
        "provider": request.runtime_snapshot["provider"],
        "model": request.runtime_snapshot["model"],
        "protocol": request.runtime_snapshot["protocol"],
        "runtime_snapshot_id": request.runtime_snapshot["snapshot_id"],
        "finish_reason": "stop",
        "usage": usage,
        "action": action,
        "authority": "NON_AUTHORITATIVE_WORKING_ACTION",
        "network_call_made": True,
        "persistence": "not_written",
    }
