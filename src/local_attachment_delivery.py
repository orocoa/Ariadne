"""Resolve a Skill turn's already saved originals without retransmitting them.

References name a persisted turn and its ordinal, never an arbitrary file path.
This adapter is enabled only by the local HTTP handler; Web stays self-contained.
"""
import base64
from contextvars import ContextVar
from functools import wraps

LOCAL_ATTACHMENT_RESOLVER = ContextVar("ariadne_local_attachment_resolver", default=None)
DATABASE = "ariadne-conversation-attachments-v1"


def local_attachment_scope(domain):
    def decorate(function):
        @wraps(function)
        def execute(handler, *args, **kwargs):
            token = LOCAL_ATTACHMENT_RESOLVER.set(None if getattr(handler, "web_request", False) else resolver(domain))
            try:
                return function(handler, *args, **kwargs)
            finally:
                LOCAL_ATTACHMENT_RESOLVER.reset(token)
        return execute
    return decorate


def resolver(domain, library=None):
    if library is None:
        # Python Workers cannot import fcntl. Web imports the contract/scope but
        # must never import or initialize the local filesystem implementation.
        from src.workspace_storage import WorkspaceStorage
        library = WorkspaceStorage()
    # Validation and payload building both inspect attachments. Keep only the
    # current request's verified bytes, then release them with this closure.
    verified = {}

    def resolve(request, item):
        reference = item.get("local_reference")
        turn_id = request.get("turn", {}).get("execution_id") or request.get("request_id")
        if (not isinstance(reference, dict) or set(reference) != {"workspace", "request_id", "index"}
                or reference["request_id"] != turn_id or type(reference["index"]) is not int
                or not 0 <= reference["index"] < 4):
            raise ValueError("attachment_reference_invalid")
        identity = (reference["workspace"], turn_id, reference["index"])
        if identity not in verified:
            record = library.read_record(reference["workspace"], DATABASE, "turns", turn_id)["record"]
            conversation = request.get("conversation", {}).get("conversation_id") or domain
            if (not record or record.get("domain") != domain or record.get("conversation_id") != conversation
                    or record.get("authority") != "SOURCE_INPUT_ONLY"):
                raise ValueError("attachment_reference_invalid")
            files = record.get("files", [])
            if reference["index"] >= len(files):
                raise ValueError("attachment_reference_invalid")
            original = files[reference["index"]]
            if any(original.get(key) != item.get(key) for key in ("name", "mime_type", "size", "content_hash")):
                raise ValueError("attachment_reference_invalid")
            blob = library.blob(reference["workspace"], original["file"])
            verified[identity] = (base64.b64decode(blob["data"], validate=True),
                                  tuple(item[key] for key in ("name", "mime_type", "size", "content_hash")))
        raw, metadata = verified[identity]
        if metadata != tuple(item.get(key) for key in ("name", "mime_type", "size", "content_hash")):
            raise ValueError("attachment_reference_invalid")
        return raw

    return resolve
