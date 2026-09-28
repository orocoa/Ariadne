"""Provider identities for the shared Ariadne domain adapters.

Capabilities are an application authority, never inferred from browser flags.
Codex is opt-in on the machine running the backend and has its own transport.
"""
import os
import json
from pathlib import Path
from src.byok_providers import PROVIDERS, BROWSER_REFERENCES

CODEX_MODEL = "gpt-5.6-sol"
CODEX_PROTOCOL = "CODEX_APP_SERVER"
CODEX_CREDENTIAL = "local-codex://authenticated-session"
DEEPSEEK_CREDENTIAL = "keychain://AI-Learning-OS.JobRadar.DeepSeek/local-vision"
BROWSER_CREDENTIAL = "browser-key://deepseek/request"


def codex_enabled():
    if "ARIADNE_CODEX_ENABLED" in os.environ:
        return os.environ["ARIADNE_CODEX_ENABLED"] == "1"
    try:
        config = json.loads((Path(__file__).resolve().parents[1] / "data/runtime/codex-local.json").read_text())
        return (isinstance(config, dict) and set(config) <= {"enabled", "model", "qualification", "prefer_codex"}
                and config.get("enabled") is True and config.get("model") == CODEX_MODEL
                and config.get("qualification") == "ariadne-codex-v1")
    except (OSError, ValueError):
        return False


def local_runtime_preference():
    """A local operator's explicit choice; discovery alone never sets a model."""
    try:
        config = json.loads((Path(__file__).resolve().parents[1] / "data/runtime/codex-local.json").read_text())
        if isinstance(config, dict) and codex_enabled() and config.get("prefer_codex") is True:
            return {"id": "local-codex-v1", "provider": "codex", "model": CODEX_MODEL}
    except (OSError, ValueError):
        pass
    return None


def adapter_for(provider, domain_adapter):
    return domain_adapter.replace("deepseek-", provider + "-", 1) if provider in {"codex", *PROVIDERS} else domain_adapter


def valid_binding(snapshot, domain_adapter):
    if snapshot.provider == "deepseek":
        if snapshot.credential_ref not in {DEEPSEEK_CREDENTIAL, BROWSER_CREDENTIAL}:
            return False
        identity = ("deepseek-flash", "OPENAI_CHAT_COMPLETIONS", snapshot.credential_ref)
    elif snapshot.provider == "codex" and codex_enabled():
        from src.codex_models import qualified
        if not qualified(snapshot.model): return False
        identity = (snapshot.model, CODEX_PROTOCOL, CODEX_CREDENTIAL)
    elif snapshot.provider in PROVIDERS:
        identity = (PROVIDERS[snapshot.provider]["model"], "OPENAI_CHAT_COMPLETIONS", f"browser-key://{snapshot.provider}/request")
    else:
        return False
    from src.model_settings import validate
    try:
        validate(snapshot.execution_settings, snapshot.provider, snapshot.model)
    except ValueError:
        return False
    return (snapshot.model, snapshot.protocol, snapshot.credential_ref) == identity and snapshot.adapter_version == adapter_for(snapshot.provider, domain_adapter)


def resolve_runtime_credential(reference, expected, reader, **errors):
    from src.provider_runtime import resolve_credential_reference, ProviderRuntimeError
    if reference in BROWSER_REFERENCES and expected == DEEPSEEK_CREDENTIAL:
        credential = reader(reference)
        if not credential:
            raise ProviderRuntimeError(errors.get("missing_code", "credential_not_configured"), "credential")
        return credential
    if reference == CODEX_CREDENTIAL:
        if not codex_enabled():
            raise ProviderRuntimeError("CODEX_NOT_ENABLED", "credential")
        # This is a transport selector, not a credential. Authentication remains
        # inside the local Codex CLI; no token is read by Ariadne.
        return CODEX_CREDENTIAL
    return resolve_credential_reference(reference, expected, reader, **errors)
