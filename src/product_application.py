"""Composition boundary: shared domains, separate Web and Skill products."""
import io
import json
from urllib.parse import urlparse

from src.runtime_binding import CODEX_MODEL, codex_enabled
from src.codex_models import qualified

WEB_CONFIG = {"kind": "web", "storage": "browser", "providers": ["deepseek", "gemini", "qwen"]}
MODEL_PATHS = frozenset({
    "/api/candidate-model-structure", "/api/job-model-structure",
    "/api/candidate-conversation-turn", "/api/job-conversation-turn",
    "/api/personal-understanding-turn", "/api/job-overview-turn", "/api/local-source-read",
})


def config_script(config):
    return ("globalThis.AriadneProductConfig = Object.freeze(" + json.dumps(config) + ");\n").encode()


def skill_handler(base):
    class SkillHandler(base):
        def read_local_source_for_model(self):
            from src.web_source_read import read_portable_source
            return read_portable_source(self)

        def do_GET(self):
            if not self.local_request_allowed():
                return
            path = urlparse(self.path).path
            if path == "/model-settings-catalog-data.js":
                from src.model_settings import local_catalog
                from src.codex_models import discover
                try:
                    if codex_enabled():
                        from src.codex_verification import service
                        service().refresh(discover())
                except (ValueError, OSError, TimeoutError, KeyError, TypeError): pass
                body = ("globalThis.AriadneModelSettingsCatalog = " + json.dumps(local_catalog()) + ";").encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers(); self.wfile.write(body)
                return
            if path == "/product-config.js":
                body = config_script({"kind": "skill", "storage": "filesystem", "providers": ["codex"],
                    "runtime": {"mode": "model", "provider": "codex", "model": CODEX_MODEL},
                    "agent_ready": codex_enabled()})
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path in {"/", "/index.html", "/codex-connect.html", "/gemini-connect.html"}:
                self.send_response(302)
                self.send_header("Location", "/workspace.html")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if path == "/api/skill-runtime":
                self.send_json(200, {"product": "ariadne-skill", "mode": "local-ui"})
                return
            if path == "/api/model-updates":
                self.send_json(200, {"ok": True, "models": [], "network_call_made": False})
                return
            super().do_GET()

        def runtime_options(self):
            from src.codex_models import discover, available_settings
            from src.provider_runtime import deepseek_model_descriptors
            try:
                if not codex_enabled(): raise ValueError("CODEX_UNAVAILABLE")
                rows = discover()
                from src.codex_verification import service
                try:
                    verification = service().refresh(rows)
                except (ValueError, OSError, KeyError, TypeError):
                    verification = {'available': False, 'active': False, 'models': {},
                        'message': '无法读取验证记录；已有模型仍可使用，请检查本机存储。'}
                models, settings, unavailable = [], [], []
                for row in rows:
                    item = available_settings(row)
                    if not item:
                        state = verification['models'].get(row['model'], {})
                        unavailable.append({"model": row["model"], "display_name": row["display_name"],
                            "reason": state.get('reason', '尚未完成 Ariadne 图片与 PDF 验证'),
                            "status": state.get('status', 'PENDING'), "can_retry": state.get('can_retry', False)})
                        continue
                    descriptor = deepseek_model_descriptors(["deepseek-flash"])[0].to_public_dict()
                    descriptor.update(provider_id="codex", model_id=row["model"], display_name=row["display_name"],
                        protocol="CODEX_APP_SERVER", discovery_source="codex_model_list_and_visual_qualification",
                        adapter_version="codex-candidate-multimodal-v2", runtime_default=row["model"] == CODEX_MODEL)
                    models.append(descriptor); settings.append(item)
                self.send_json(200, {"provider": "codex", "models": models, "settings_catalog": settings,
                    "unavailable_models": unavailable, "local_preference": None,
                    "verification": verification,
                    "network_call_made": True, "career_data_sent": False,
                    "effort_note": "Ultra 包含自动委派，当前资料对话不启用该档位。" if any("ultra" in row["unsupported_efforts"] for row in rows) else ""})
            except (ValueError, OSError, TimeoutError, KeyError):
                self.send_json(503, {"error": "CODEX_MODEL_DISCOVERY_UNAVAILABLE", "models": [], "career_data_sent": False})

        def do_POST(self):
            if not self.local_request_allowed():
                return
            path = urlparse(self.path).path
            if path == '/api/codex-verification':
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length <= 1000: raise ValueError('VERIFICATION_REQUEST_INVALID')
                    body = json.loads(self.rfile.read(length))
                    if not isinstance(body, dict): raise ValueError('VERIFICATION_REQUEST_INVALID')
                    if not codex_enabled(): raise ValueError('CODEX_UNAVAILABLE')
                    from src.codex_models import discover
                    from src.codex_verification import service
                    state = service().configure(body, discover(force=True))
                    self.send_json(200, {'ok': True, 'verification': state, 'career_data_sent': False})
                except (ValueError, OSError, TimeoutError, KeyError, TypeError) as error:
                    code = str(error)
                    allowed = {'VERIFICATION_ACCOUNT_REQUIRED',
                        'VERIFICATION_MODEL_INVALID', 'VERIFICATION_RETRY_INVALID', 'VERIFICATION_REQUEST_INVALID',
                        'CODEX_UNAVAILABLE', 'VERIFICATION_STATE_INVALID'}
                    self.send_json(400, {'error': code if code in allowed else 'VERIFICATION_UNAVAILABLE', 'career_data_sent': False})
                return
            if path.startswith("/api/runtime-") or path in {"/api/model-updates/verify", "/api/local-vision-config", "/api/ai-career-ingestion-config"}:
                self.send_json(403, {"error": "SKILL_AGENT_ONLY", "network_call_made": False})
                return
            original_input = None
            if path in MODEL_PATHS:
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 < length <= 41_000_000:
                        raise ValueError()
                    body = self.rfile.read(length)
                    payload = json.loads(body)
                    snapshot = payload.get("runtime_snapshot", {})
                    if snapshot.get("provider") != "codex" or not qualified(snapshot.get("model")):
                        self.send_json(422, {"error": "SKILL_AGENT_ONLY", "network_call_made": False})
                        return
                    if not codex_enabled():
                        self.send_json(503, {"error": "SKILL_AGENT_UNAVAILABLE", "network_call_made": False})
                        return
                    original_input = self.rfile
                    self.rfile = io.BytesIO(body)
                except (ValueError, TypeError, AttributeError):
                    self.send_json(400, {"error": "SKILL_REQUEST_INVALID", "network_call_made": False})
                    return
            from src.runtime_cancellation import CANCEL, ExecutionCancelled, socket_cancellation
            cancellation = CANCEL.get() or socket_cancellation(getattr(self, "connection", None))
            token = CANCEL.set(cancellation) if path in MODEL_PATHS else None
            try:
                super().do_POST()
            except (ExecutionCancelled, BrokenPipeError, ConnectionResetError):
                cancellation.cancel()
            finally:
                if token is not None: CANCEL.reset(token)
                if original_input is not None:
                    self.rfile = original_input
    return SkillHandler
