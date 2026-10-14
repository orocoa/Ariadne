"""Bounded resume-only reuse of an explicitly selected archived template.

The existing current-turn attachment resolver remains strict. Historical reuse
requires a persisted task binding, exact workspace/domain/conversation and fresh
recipient consent; filenames or old chat excerpts never grant file access.
"""
import base64
import hashlib
from copy import deepcopy
from contextvars import ContextVar
from src.conversation_attachments import validate_attachments
from src.material_delivery import material_parts, check_parts
from src.pdf_delivery import pdf_preparation

TEMPLATE_RESOLVER = ContextVar("ariadne_resume_template_resolver", default=None)


def resolver(domain, library=None):
    if library is None:
        from src.workspace_storage import WorkspaceStorage
        library = WorkspaceStorage()

    def resolve(context):
        template, scope = context["template"], context["scope"]
        archive = template["archive"]
        if (scope["domain"] != domain or any(archive[key] != scope[key] for key in ("workspace", "domain", "conversation_id"))
                or not context["consent"]["template_reuse_confirmed"]):
            raise ValueError("RESUME_TEMPLATE_CONSENT_REQUIRED")
        head = library.read_record(scope["workspace"], "job-radar-local-first-v1", "resume_tasks", context["task_id"])["record"]
        if (not head or head.get("scope") != scope or head.get("template") != template
                or head.get("revision") != context["expected_task_revision"]):
            raise ValueError("RESUME_TEMPLATE_TASK_CHANGED")
        turn = library.read_record(scope["workspace"], "ariadne-conversation-attachments-v1", "turns", archive["request_id"])["record"]
        if (not turn or turn.get("domain") != domain or turn.get("conversation_id") != scope["conversation_id"]
                or turn.get("authority") != "SOURCE_INPUT_ONLY" or not 0 <= archive["index"] < len(turn.get("files", []))):
            raise ValueError("RESUME_TEMPLATE_UNAVAILABLE")
        entry = turn["files"][archive["index"]]
        if any(entry.get(key) != template[key] for key in ("name", "mime_type", "size", "content_hash")):
            raise ValueError("RESUME_TEMPLATE_INVALID")
        blob = library.blob(scope["workspace"], entry["file"])
        return base64.b64decode(blob["data"], validate=True)
    return resolve


def prepare_task(payload, intent):
    from src.resume_task_runtime import validate_context, context_fingerprint
    context = validate_context(payload["resume_context"])
    human = payload.get("human_message") or payload.get("turn", {}).get("human_message")
    if context["current_human"] != human or intent["instruction"] != human:
        raise ValueError("RESUME_HUMAN_MISMATCH")
    snapshot = payload["runtime_snapshot"]
    domains = {"CANDIDATE_CONVERSATION_TURN": "CANDIDATE", "JOB_CONVERSATION_TURN": "JOB",
               "PERSONAL_UNDERSTANDING_TURN": "PERSONAL", "JOB_OVERVIEW_TURN": "JOB_OVERVIEW"}
    domain = domains.get(snapshot.get("operation"))
    conversation = payload.get("conversation", {}).get("conversation_id") or domain
    if context["scope"]["domain"] != domain or context["scope"]["conversation_id"] != conversation:
        raise ValueError("RESUME_TASK_SCOPE_MISMATCH")
    for item in payload.get("attachments", {}).get("files", []):
        if item.get("local_reference", {}).get("workspace", context["scope"]["workspace"]) != context["scope"]["workspace"]:
            raise ValueError("RESUME_TEMPLATE_SCOPE_MISMATCH")
    if context["consent"]["provider"] != snapshot["provider"] or context["consent"]["model"] != snapshot["model"]:
        raise ValueError("RESUME_CONSENT_REQUIRED")
    name = intent["template_name"]
    if intent["continue"] and (context.get("prior_task") or {}).get("template") and not name:
        raise ValueError("RESUME_TEMPLATE_CONTINUITY_REQUIRED")
    files = payload.get("attachments", {}).get("files", [])
    matches = [(index, item) for index, item in enumerate(files) if item["name"] == name]
    raw = None
    if name and matches:
        if len(matches) != 1: raise ValueError("RESUME_TEMPLATE_AMBIGUOUS")
        index, item = matches[0]
        class AttachmentError(ValueError):
            def __init__(self, code, layer=None): super().__init__(code)
        decoded = validate_attachments(payload, AttachmentError)
        raw = decoded[index][2]
        context = deepcopy(context)
        context["template"] = {key: item[key] for key in ("name", "mime_type", "size", "content_hash")}
        context["template"]["archive"] = {**context["scope"], "request_id": payload["attachments"]["request_id"], "index": index}
        context["consent"]["template_reuse_confirmed"] = False
    elif name:
        template = context["template"]
        if not template or template["name"] != name or not context["consent"]["template_reuse_confirmed"]:
            raise ValueError("RESUME_TEMPLATE_CONSENT_REQUIRED")
        resolve = TEMPLATE_RESOLVER.get()
        if resolve:
            raw = resolve(context)
        else:
            prefix = f'data:{template["mime_type"]};base64,'
            inline = payload.get("resume_template_data")
            if not isinstance(inline, str) or not inline.startswith(prefix) or len(inline) > 40001000:
                raise ValueError("RESUME_TEMPLATE_UNAVAILABLE")
            raw = base64.b64decode(inline[len(prefix):], validate=True)
    else:
        context = deepcopy(context); context["template"] = None
        context["consent"]["template_reuse_confirmed"] = False
    context["context_fingerprint"] = context_fingerprint(context)
    context = validate_context(context)
    if raw is None: return context, []
    template = context["template"]
    if (len(raw) != template["size"] or "sha256:" + hashlib.sha256(raw).hexdigest() != template["content_hash"]):
        raise ValueError("RESUME_TEMPLATE_INTEGRITY_INVALID")
    mime = template["mime_type"]
    if mime not in ("application/pdf", "image/png", "image/jpeg"):
        raise ValueError("RESUME_TEMPLATE_VISUAL_REQUIRED")
    if mime == "application/pdf":
        with pdf_preparation([raw]): parts = material_parts(mime, raw)
    else: parts = material_parts(mime, raw)
    check_parts(parts)
    return context, parts
