"""Qualified Job Model Import boundary over provider-safe prepared text blocks.

The adapter receives mechanically prepared source evidence. It never invokes
Local Job semantic structuring and performs no persistence.
"""

from __future__ import annotations

from src.model_settings import apply_execution_settings

import base64
import binascii
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

from src.runtime_binding import valid_binding, resolve_runtime_credential
from src.pdf_delivery import render_complete_pdf_pages

from src.candidate_model_runtime import runtime_fingerprint
from src.execution_contract import ExecutionContractError, validate_runtime_snapshot
from src.provider_runtime import OPENAI_CHAT_COMPLETIONS, ProviderRuntimeError
from src.upload_limits import MAX_FILE_BYTES


MANIFEST_PATH = Path(__file__).resolve().parents[1] / "data" / "job_intelligence_contract_v1.json"
MANIFEST = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
RUNTIME = MANIFEST["job_model_import_runtime_contracts"]
PROVIDER_ID = "deepseek"
MODEL_ID = "deepseek-flash"
PROTOCOL = OPENAI_CHAT_COMPLETIONS
OPERATION = "JOB_TEXT_IMPORT"
OPERATIONS = {"JOB_IMAGE_IMPORT", "JOB_TEXT_IMPORT"}
CREDENTIAL_REF = "keychain://AI-Learning-OS.JobRadar.DeepSeek/local-vision"
REQUEST_CONTRACT = RUNTIME["request_contract_version"]
RESULT_CONTRACT = RUNTIME["result_contract_version"]
PROPOSAL_CONTRACT = MANIFEST["job_model_import_proposal_version"]
PREPARATION_CONTRACT = MANIFEST["job_model_import_source_preparation_version"]
SOURCE_REF = re.compile(r"^job-source-(?:(?:[1-9][0-9]{0,2})-)?block-[1-9][0-9]{0,2}$")
SOURCE_BUNDLE_CONTRACT = "ariadne-source-bundle-v1"
FORBIDDEN_PROVIDER_VALUES = re.compile(
    r"(?:source-job-[a-f0-9]{16,}|sha256:[a-f0-9]{32,}|indexeddb://|/(?:Users|home)/)", re.IGNORECASE,
)


class JobModelRuntimeError(ValueError):
    def __init__(self, code: str, failure_layer: str, network_call_made: bool = False):
        super().__init__(code)
        self.code = code
        self.failure_layer = failure_layer
        self.network_call_made = network_call_made


@dataclass(frozen=True)
class JobModelRequest:
    source_bundle: dict[str, Any]
    source_documents: list[dict[str, Any]]
    source_preparations: list[dict[str, Any]]
    source_inputs: list[dict[str, Any]]
    runtime_snapshot: dict[str, Any]
    processing_run_id: str
    operation_id: str

    @property
    def source_document(self) -> dict[str, Any]:
        return self.source_documents[0]

    @property
    def source_preparation(self) -> dict[str, Any]:
        return {
            "blocks": [block for preparation in self.source_preparations for block in preparation["blocks"]],
        }


def _mapping(value: Any, code: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise JobModelRuntimeError(code, "contract_validation")
    return value


def _text(value: Any, code: str, maximum: int = 12000) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        raise JobModelRuntimeError(code, "contract_validation")
    return value.strip()


def _optional_text(value: Any, code: str, maximum: int = 12000) -> str | None:
    return None if value is None else _text(value, code, maximum)


def job_model_import_runtime_signature() -> dict[str, str]:
    return {
        "manifest_version": MANIFEST["manifest_version"],
        "runtime_request_contract_version": REQUEST_CONTRACT,
        "runtime_result_contract_version": RESULT_CONTRACT,
        "adapter_version": RUNTIME["adapter_version"],
        "prompt_version": RUNTIME["prompt_version"],
        "request_config_version": RUNTIME["request_config_version"],
        "proposal_version": PROPOSAL_CONTRACT,
        "source_preparation_version": PREPARATION_CONTRACT,
    }


def _validate_snapshot(value: Any) -> dict[str, Any]:
    try:
        snapshot = validate_runtime_snapshot(value)
    except ExecutionContractError as error:
        raise JobModelRuntimeError("job_model_runtime_snapshot_invalid", "runtime") from error
    if (
        snapshot.mode != "model"
        or not valid_binding(snapshot, RUNTIME["adapter_version"])
        or snapshot.prompt_version != RUNTIME["prompt_version"] or snapshot.schema_version != PROPOSAL_CONTRACT
        or snapshot.operation not in OPERATIONS or snapshot.action_schema_version != PROPOSAL_CONTRACT
        or snapshot.request_config_version != RUNTIME["request_config_version"]
        or snapshot.delivery_method != RUNTIME["delivery_method"]

        or snapshot.capabilities.semantic_understanding != "supported"
        or snapshot.capabilities.job_model_structuring != "supported"
        or snapshot.capabilities.vision != "supported"
    ):
        raise JobModelRuntimeError("job_model_runtime_not_eligible", "runtime")
    return snapshot.to_dict()


def _validate_source(value: Any) -> dict[str, Any]:
    source = dict(_mapping(value, "job_model_source_invalid"))
    source_id = _text(source.get("source_document_id"), "job_model_source_invalid", 180)
    filename = _text(source.get("filename"), "job_model_source_invalid", 240)
    content_hash = _text(source.get("content_hash"), "job_model_source_hash_invalid", 96)
    if (
        source.get("contract_id") != "ariadne-source-document-v1" or source.get("material_type") != "JOB"
        or source.get("authority") != "SOURCE_INPUT_ONLY" or Path(filename).name != filename
        or not source_id.startswith("source-job-") or not content_hash.startswith("sha256:") or len(content_hash) != 71
        or source_id != f"source-job-{content_hash.removeprefix('sha256:')}"
    ):
        raise JobModelRuntimeError("job_model_source_invalid", "source")
    _text(source.get("local_reference"), "job_model_source_reference_required", 512)
    return source


def _validate_preparation(value: Any, source: Mapping[str, Any]) -> dict[str, Any]:
    preparation = dict(_mapping(value, "job_model_source_preparation_invalid"))
    if (
        preparation.get("contract_id") != PREPARATION_CONTRACT
        or preparation.get("source_document_id") != source["source_document_id"]
        or preparation.get("content_hash") != source["content_hash"]
        or preparation.get("source_type") != source.get("source_type")
        or preparation.get("mime_type") != source.get("mime_type")
        or preparation.get("read_only") is not True or preparation.get("writeback") is not False
        or preparation.get("semantic_structuring") is not False
    ):
        raise JobModelRuntimeError("job_model_source_preparation_invalid", "source_preparation")
    blocks = preparation.get("blocks")
    if not isinstance(blocks, list) or not 1 <= len(blocks) <= 48:
        raise JobModelRuntimeError("job_model_source_preparation_invalid", "source_preparation")
    refs: set[str] = set()
    validated_blocks = []
    total = 0
    for raw in blocks:
        block = _mapping(raw, "job_model_source_preparation_invalid")
        if set(block) != {"source_ref", "location", "text"}:
            raise JobModelRuntimeError("job_model_source_preparation_invalid", "source_preparation")
        source_ref = _text(block.get("source_ref"), "job_model_source_preparation_invalid", 64)
        if not SOURCE_REF.fullmatch(source_ref) or source_ref in refs:
            raise JobModelRuntimeError("job_model_source_preparation_invalid", "source_preparation")
        refs.add(source_ref)
        text = _text(block.get("text"), "job_model_source_preparation_invalid", 1200)
        total += len(text)
        validated_blocks.append({"source_ref": source_ref, "location": _text(block.get("location"), "job_model_source_preparation_invalid", 128), "text": text})
    if total > 48_000 or preparation.get("character_count") != total:
        raise JobModelRuntimeError("job_model_source_preparation_invalid", "source_preparation")
    return {**preparation, "blocks": validated_blocks}


def _validate_consent(value: Any, source_identity: str, snapshot: Mapping[str, Any]) -> str:
    consent = _mapping(value, "job_model_consent_required")
    if consent.get("explicitly_confirmed") is not True:
        raise JobModelRuntimeError("job_model_consent_required", "consent")
    if (
        consent.get("source_document_id") != source_identity
        or consent.get("provider") != snapshot["provider"] or consent.get("model") != snapshot["model"]
        or consent.get("delivery_method") != snapshot["delivery_method"]
    ):
        raise JobModelRuntimeError("job_model_consent_mismatch", "consent")
    _text(consent.get("confirmed_at"), "job_model_consent_invalid", 64)
    return _text(consent.get("consent_id"), "job_model_consent_invalid", 180)


def job_model_operation_id(source_id: str, fingerprint: str, consent_id: str) -> str:
    value = f"{source_id}|JOB_MODEL_SEMANTIC_STRUCTURING|{fingerprint}|{consent_id}".encode("utf-8")
    return "job-model-import-op-" + hashlib.sha256(value).hexdigest()


def _validate_bundle(value: Any, sources: list[dict[str, Any]]) -> dict[str, Any]:
    bundle = dict(_mapping(value, "job_model_source_bundle_invalid"))
    source_ids = [source["source_document_id"] for source in sources]
    if (
        set(bundle) != {"contract_id", "source_bundle_id", "source_document_ids", "source_count", "ordering"}
        or bundle.get("contract_id") != SOURCE_BUNDLE_CONTRACT
        or bundle.get("source_document_ids") != source_ids
        or bundle.get("source_count") != len(sources)
        or bundle.get("ordering") != "USER_SUPPLIED"
        or not isinstance(bundle.get("source_bundle_id"), str)
        or not bundle["source_bundle_id"].startswith("job-source-bundle-")
    ):
        raise JobModelRuntimeError("job_model_source_bundle_invalid", "source")
    return bundle


def _validate_source_inputs(value: Any, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    inputs = [] if value is None else value
    if not isinstance(inputs, list):
        raise JobModelRuntimeError("job_model_source_inputs_invalid", "source")
    image_sources = [source for source in sources if source.get("source_type") in {"IMAGE", "PDF"}]
    if len(inputs) != len(image_sources):
        raise JobModelRuntimeError("job_model_source_inputs_invalid", "source")
    validated = []
    for index, raw in enumerate(inputs):
        item = _mapping(raw, "job_model_source_inputs_invalid")
        source = image_sources[index]
        is_pdf = source.get("source_type") == "PDF"
        data_key = "document_data_url" if is_pdf else "image_data_url"
        if is_pdf and source.get("mime_type") != "application/pdf":
            raise JobModelRuntimeError("job_pdf_original_invalid", "source")
        if set(item) != {"source_document_id", data_key} or item.get("source_document_id") != source["source_document_id"]:
            raise JobModelRuntimeError("job_model_source_inputs_invalid", "source")
        prefix = f"data:{source['mime_type']};base64,"
        data_url = item.get(data_key)
        if not isinstance(data_url, str) or not data_url.startswith(prefix):
            raise JobModelRuntimeError("job_model_source_inputs_invalid", "source")
        try:
            body = base64.b64decode(data_url.split(",", 1)[1], validate=True)
        except (binascii.Error, ValueError) as error:
            raise JobModelRuntimeError("job_model_source_inputs_invalid", "source") from error
        valid_signature = source["mime_type"] == "image/png" and body.startswith(b"\x89PNG\r\n\x1a\n")
        valid_signature = valid_signature or source["mime_type"] == "image/jpeg" and body.startswith(b"\xff\xd8\xff")
        valid_signature = valid_signature or is_pdf and body.startswith(b"%PDF-")
        if not body or len(body) > MAX_FILE_BYTES or not valid_signature or "sha256:" + hashlib.sha256(body).hexdigest() != source["content_hash"]:
            raise JobModelRuntimeError("job_model_source_inputs_invalid", "source")
        validated.append({"source_index": sources.index(source) + 1, **({"pdf_bytes": body} if is_pdf else {"image_data_url": data_url})})
    return validated


def validate_job_model_request(payload: Any) -> JobModelRequest:
    value = _mapping(payload, "job_model_request_invalid")
    legacy_keys = {"contract_id", "source_document", "source_preparation", "runtime_snapshot", "processing_run_id", "consent", "operation_identity"}
    bundle_keys = {"contract_id", "source_bundle", "source_documents", "source_preparations", "source_inputs", "runtime_snapshot", "processing_run_id", "consent", "operation_identity"}
    if frozenset(value) not in {frozenset(legacy_keys), frozenset(bundle_keys)} or value.get("contract_id") != REQUEST_CONTRACT:
        raise JobModelRuntimeError("job_model_request_invalid", "request")
    snapshot = _validate_snapshot(value["runtime_snapshot"])
    if "source_bundle" in value:
        raw_sources = value["source_documents"]
        raw_preparations = value["source_preparations"]
        if not isinstance(raw_sources, list) or not isinstance(raw_preparations, list) or not raw_sources or len(raw_sources) != len(raw_preparations):
            raise JobModelRuntimeError("job_model_source_bundle_invalid", "source")
        sources = [_validate_source(source) for source in raw_sources]
        if len({source["source_document_id"] for source in sources}) != len(sources):
            raise JobModelRuntimeError("job_model_source_bundle_invalid", "source")
        preparations = [_validate_preparation(preparation, sources[index]) for index, preparation in enumerate(raw_preparations)]
        bundle = _validate_bundle(value["source_bundle"], sources)
        source_inputs = _validate_source_inputs(value.get("source_inputs"), sources)
    else:
        sources = [_validate_source(value["source_document"])]
        preparations = [_validate_preparation(value["source_preparation"], sources[0])]
        bundle = {
            "contract_id": SOURCE_BUNDLE_CONTRACT,
            "source_bundle_id": sources[0]["source_document_id"],
            "source_document_ids": [sources[0]["source_document_id"]],
            "source_count": 1,
            "ordering": "USER_SUPPLIED",
        }
        source_inputs = _validate_source_inputs(None, sources)
    all_blocks = [block for preparation in preparations for block in preparation["blocks"]]
    if len(all_blocks) > 48 or sum(len(block["text"]) for block in all_blocks) > 48_000 or len({block["source_ref"] for block in all_blocks}) != len(all_blocks):
        raise JobModelRuntimeError("job_model_source_preparation_invalid", "source_preparation")
    expected_operation = "JOB_IMAGE_IMPORT" if any(source.get("source_type") == "IMAGE" for source in sources) else "JOB_TEXT_IMPORT"
    if snapshot["operation"] != expected_operation:
        raise JobModelRuntimeError("job_model_operation_capability_mismatch", "runtime")
    consent_id = _validate_consent(value["consent"], bundle["source_bundle_id"], snapshot)
    operation = _mapping(value["operation_identity"], "job_model_operation_identity_invalid")
    fingerprint = runtime_fingerprint(snapshot)
    expected_operation = job_model_operation_id(bundle["source_bundle_id"], fingerprint, consent_id)
    if (
        operation.get("operation_id") != expected_operation or operation.get("operation_type") != "JOB_MODEL_SEMANTIC_STRUCTURING"
        or operation.get("source_document_id") != bundle["source_bundle_id"] or operation.get("runtime_fingerprint") != fingerprint
        or operation.get("consent_id") != consent_id
    ):
        raise JobModelRuntimeError("job_model_operation_identity_invalid", "request")
    run_id = _text(value["processing_run_id"], "job_model_processing_run_required", 180)
    if run_id != f"run-{expected_operation}":
        raise JobModelRuntimeError("job_model_operation_identity_invalid", "request")
    return JobModelRequest(bundle, sources, preparations, source_inputs, snapshot, run_id, expected_operation)


def _assert_provider_safe(value: Any) -> None:
    serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if FORBIDDEN_PROVIDER_VALUES.search(serialized):
        raise JobModelRuntimeError("job_model_provider_payload_private_reference_forbidden", "privacy")


def job_model_prompt() -> str:
    schema = {
        "contract_id": PROPOSAL_CONTRACT,
        "title": {"value": "string", "source_refs": ["job-source-N-block-M"]},
        "company": {"value": "string|null", "source_refs": ["job-source-N-block-M"]},
        "location": {"value": "string|null", "source_refs": ["job-source-N-block-M"]},
        "summary": {"value": "string|null", "source_refs": ["job-source-N-block-M"]},
        "requirements": [{"label": "string", "detail": "string", "source_refs": ["job-source-N-block-M"]}],
        "uncertainties": [{"field": "title|company|location|summary|requirements", "reason": "string"}],
    }
    return f"""You are Ariadne's Job Import semantic adapter.
Return exactly one JSON object, no Markdown and no chain-of-thought.
Use this exact shape: {json.dumps(schema, ensure_ascii=False, separators=(',', ':'))}
Treat the ordered sources as one job-description bundle and produce exactly one semantic Job understanding.
First identify the actual job-content region across the bundle. Navigation, global header/footer, legal/privacy/copyright text, site services, unrelated company-page chrome, recruiting UI and calls-to-action are page chrome, not Job content.
Do not use page chrome as a title, company, location, summary, responsibility or requirement. Do not invent employer, location, requirements, benefits or responsibilities.
Distinguish job title, hiring company, location, summary, responsibilities and candidate requirements semantically; do not map nearby prose into a field merely because it is present.
Every non-null field and every requirement must cite one or more supplied source_refs. Use no other references.
If the actual title is unavailable, use the literal string "unknown" and explain it in uncertainties; every other unknown field must be null and explained in uncertainties. Keep source wording distinguishable from semantic summarization.
This output becomes a NON_AUTHORITATIVE Working Job. It becomes confirmed truth only after Human Workspace Save. Never emit IDs, hashes, file paths, storage targets, Candidate data or match scores."""


def build_job_model_payload(request: JobModelRequest) -> dict[str, Any]:
    from src.pdf_delivery import pdf_preparation
    documents = [item["pdf_bytes"] for item in request.source_inputs if "pdf_bytes" in item]
    try:
        with pdf_preparation(documents, max_pages=48, other_images=sum("pdf_bytes" not in item for item in request.source_inputs)):
            return _build_job_model_payload(request)
    except (ValueError, OSError) as error:
        if isinstance(error, JobModelRuntimeError): raise
        raise JobModelRuntimeError("job_pdf_complete_render_failed", "delivery") from error


def _build_job_model_payload(request: JobModelRequest) -> dict[str, Any]:
    provider_source = {
        "bundle_order": "USER_SUPPLIED",
        "sources": [
            {
                "source_index": index + 1,
                "source_format": preparation["source_type"],
                "blocks": preparation["blocks"],
            }
            for index, preparation in enumerate(request.source_preparations)
        ],
    }
    _assert_provider_safe(provider_source)
    user_content: list[dict[str, Any]] = [{"type": "text", "text": json.dumps({"job_source": provider_source}, ensure_ascii=False, separators=(",", ":"))}]
    for item in request.source_inputs:
        if "pdf_bytes" in item:
            try:
                pages = render_complete_pdf_pages(item["pdf_bytes"], max_pages=48)
            except (ValueError, OSError) as error:
                raise JobModelRuntimeError("job_pdf_complete_render_failed", "delivery") from error
            blocks = request.source_preparations[item["source_index"] - 1]["blocks"]
            if len(pages) > 48 or [block["location"] for block in blocks] != [f"p. {page}" for page, _ in pages]:
                raise JobModelRuntimeError("job_pdf_complete_page_manifest_mismatch", "delivery")
            for (page, image), block in zip(pages, blocks):
                user_content.append({"type": "text", "text": f"Ordered job source {item['source_index']}, PDF page {page}, source_ref {block['source_ref']}. The page marker is a location reference, not source text; read this complete page visually."})
                user_content.append({"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(image).decode("ascii")}})
            continue
        user_content.append({"type": "text", "text": f"Ordered job source image {item['source_index']}."})
        user_content.append({"type": "image_url", "image_url": {"url": item["image_data_url"]}})
    return {
        "model": request.runtime_snapshot["model"],
        "messages": [
            {"role": "system", "content": job_model_prompt()},
            {"role": "user", "content": user_content},
        ],
        "response_format": {"type": "json_object"},
        "thinking": {"type": "disabled"},
        "temperature": 0,
        "max_tokens": 2400,
    }


def _refs(value: Any, allowed: set[str], *, required: bool) -> list[str]:
    if not isinstance(value, list) or (required and not value) or any(not isinstance(ref, str) or ref not in allowed for ref in value):
        raise JobModelRuntimeError("job_model_grounding_validation_failed", "grounding", True)
    return list(value)


def _field(value: Any, allowed: set[str], code: str, *, required: bool = False, maximum: int = 12000) -> dict[str, Any]:
    field = _mapping(value, code)
    if set(field) != {"value", "source_refs"}:
        raise JobModelRuntimeError(code, "semantic", True)
    field_value = _text(field["value"], code, maximum) if required else _optional_text(field["value"], code, maximum)
    return {"value": field_value, "source_refs": _refs(field["source_refs"], allowed, required=field_value is not None)}


def validate_job_model_proposal(value: Any, preparation: Mapping[str, Any]) -> dict[str, Any]:
    proposal = _mapping(value, "job_model_proposal_contract_failed")
    required = {"contract_id", "title", "company", "location", "summary", "requirements", "uncertainties"}
    if set(proposal) != required or proposal.get("contract_id") != PROPOSAL_CONTRACT:
        raise JobModelRuntimeError("job_model_proposal_contract_failed", "semantic", True)
    allowed = {block["source_ref"] for block in preparation["blocks"]}
    requirements = proposal["requirements"]
    if not isinstance(requirements, list) or len(requirements) > 60:
        raise JobModelRuntimeError("job_model_proposal_contract_failed", "semantic", True)
    validated_requirements = []
    for raw in requirements:
        item = _mapping(raw, "job_model_proposal_contract_failed")
        if set(item) != {"label", "detail", "source_refs"}:
            raise JobModelRuntimeError("job_model_proposal_contract_failed", "semantic", True)
        validated_requirements.append({
            "label": _text(item["label"], "job_model_proposal_contract_failed", 240),
            "detail": _text(item["detail"], "job_model_proposal_contract_failed", 4000),
            "source_refs": _refs(item["source_refs"], allowed, required=True),
        })
    uncertainties = proposal["uncertainties"]
    if not isinstance(uncertainties, list) or len(uncertainties) > 24:
        raise JobModelRuntimeError("job_model_proposal_contract_failed", "semantic", True)
    validated_uncertainties = []
    for raw in uncertainties:
        item = _mapping(raw, "job_model_proposal_contract_failed")
        if set(item) != {"field", "reason"} or item.get("field") not in {"title", "company", "location", "summary", "requirements"}:
            raise JobModelRuntimeError("job_model_proposal_contract_failed", "semantic", True)
        validated_uncertainties.append({"field": item["field"], "reason": _text(item["reason"], "job_model_proposal_contract_failed", 1000)})
    result = {
        "contract_id": PROPOSAL_CONTRACT,
        "title": _field(proposal["title"], allowed, "job_model_proposal_contract_failed", required=True, maximum=500),
        "company": _field(proposal["company"], allowed, "job_model_proposal_contract_failed", maximum=500),
        "location": _field(proposal["location"], allowed, "job_model_proposal_contract_failed", maximum=500),
        "summary": _field(proposal["summary"], allowed, "job_model_proposal_contract_failed", maximum=12000),
        "requirements": validated_requirements,
        "uncertainties": validated_uncertainties,
    }
    _assert_provider_safe(result)
    return result


def normalize_job_model_response(provider_response: Any, request: JobModelRequest, http_status: int = 200) -> tuple[dict[str, Any], dict[str, Any]]:
    if http_status != 200:
        raise JobModelRuntimeError("deepseek_provider_http_error", "provider", True)
    response = _mapping(provider_response, "deepseek_response_malformed")
    if response.get("model") != request.runtime_snapshot["model"]:
        raise JobModelRuntimeError("deepseek_returned_model_mismatch", "model", True)
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], Mapping) or choices[0].get("finish_reason") != "stop":
        raise JobModelRuntimeError("deepseek_response_malformed", "model_output", True)
    message = choices[0].get("message")
    content = message.get("content") if isinstance(message, Mapping) else None
    if not isinstance(content, str) or not content.strip():
        raise JobModelRuntimeError("deepseek_response_malformed", "parsing", True)
    try:
        decoded = json.loads(content)
    except json.JSONDecodeError as error:
        raise JobModelRuntimeError("deepseek_response_malformed", "parsing", True) from error
    return validate_job_model_proposal(decoded, request.source_preparation), dict(response.get("usage") or {})


def execute_job_model_request(payload: Any, credential_reader: Callable[[], str | None], provider_call: Callable[[str, dict[str, Any]], tuple[int, dict[str, Any]]]) -> dict[str, Any]:
    request = validate_job_model_request(payload)
    try:
        credential = resolve_runtime_credential(
            request.runtime_snapshot["credential_ref"], CREDENTIAL_REF, credential_reader,
            invalid_code="job_model_credential_reference_invalid", missing_code="deepseek_key_not_configured",
        )
    except ProviderRuntimeError as error:
        raise JobModelRuntimeError(error.code, error.failure_layer) from error
    provider_payload = build_job_model_payload(request)
    status, response = provider_call(credential, apply_execution_settings(provider_payload, request.runtime_snapshot))
    proposal, usage = normalize_job_model_response(response, request, status)
    return {
        "contract_id": RESULT_CONTRACT,
        "provider": request.runtime_snapshot["provider"],
        "model": request.runtime_snapshot["model"],
        "protocol": request.runtime_snapshot["protocol"],
        "adapter_version": request.runtime_snapshot["adapter_version"],
        "runtime_snapshot_id": request.runtime_snapshot["snapshot_id"],
        "source_document_id": request.source_document["source_document_id"],
        "source_document_ids": request.source_bundle["source_document_ids"],
        "source_bundle_id": request.source_bundle["source_bundle_id"],
        "processing_run_id": request.processing_run_id,
        "operation_id": request.operation_id,
        "usage": usage,
        "job_proposal": proposal,
        "network_call_made": True,
        "persistence": "browser_working_job_save_required",
    }
