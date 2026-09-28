"""Execution settings metadata, not model capability qualification authority."""
import json
from pathlib import Path

CATALOG = json.loads((Path(__file__).resolve().parents[1] / "public/model-settings-catalog.json").read_text())


def local_catalog():
    from src.codex_models import settings_entries
    result = json.loads(json.dumps(CATALOG))
    entries = settings_entries()
    result['models'] = [x for x in result['models'] if x['provider'] != 'codex'] + entries
    return result


def descriptor(provider, model):
    return next((item for item in local_catalog()["models"] + CATALOG.get("retired_models", []) if (item["provider"], item["model"]) == (provider, model)), None)


def envelope(provider, model, settings=None, revision="default", scope=None):
    item = descriptor(provider, model)
    if not item:
        return None
    return {"contract_version": CATALOG["version"], "connection_id": item["connection_id"],
            "descriptor_revision": item["descriptor_revision"], "settings_schema_version": item["settings_schema_version"],
            "effective_settings": settings if settings is not None else {key: value["default"] for key, value in item["parameters"].items()},
            "selection_revision": revision, "scope": scope}


def validate(value, provider, model):
    item = descriptor(provider, model)
    if not item or not isinstance(value, dict) or set(value) != set(envelope(provider, model)):
        raise ValueError("runtime_execution_settings_invalid")
    expected = envelope(provider, model)
    for key in ("contract_version", "connection_id", "descriptor_revision", "settings_schema_version"):
        if value[key] != expected[key]:
            raise ValueError("runtime_execution_settings_identity_mismatch")
    settings = value["effective_settings"]
    if not isinstance(settings, dict) or set(settings) != set(item["parameters"]):
        raise ValueError("runtime_execution_settings_invalid")
    for key, spec in item["parameters"].items():
        if settings[key] not in [option["value"] for option in spec["options"]]:
            raise ValueError("runtime_execution_settings_unsupported")
    if not isinstance(value["selection_revision"], str) or not 0 < len(value["selection_revision"]) <= 200:
        raise ValueError("runtime_selection_revision_invalid")
    if value["scope"] is not None and (not isinstance(value["scope"], str) or not 0 < len(value["scope"]) <= 300):
        raise ValueError("runtime_selection_scope_invalid")
    return json.loads(json.dumps(value))


def apply_execution_settings(payload, snapshot):
    raw = snapshot.to_dict() if hasattr(snapshot, "to_dict") else snapshot
    value = validate(raw.get("execution_settings"), raw["provider"], raw["model"])
    result = dict(payload)
    # DeepSeek's qualified adapter has no tunable reasoning parameter.
    if raw["provider"] == "codex":
        result["reasoning_effort"] = value["effective_settings"]["reasoning_effort"]
    return result


def fingerprint_settings(snapshot):
    value = snapshot.get("execution_settings")
    if value is None:
        return None
    return {key: value[key] for key in ("contract_version", "connection_id", "descriptor_revision", "settings_schema_version", "effective_settings")}
