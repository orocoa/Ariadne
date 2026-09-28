"""Portable Skill entry point; only explicit login launches account setup."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import uuid

SKILL = Path(__file__).resolve().parents[1]
WORKSPACE_BINDING_CONTRACT = "ariadne-desktop-workspace-binding-v1"


def runtime_root():
    packaged = SKILL / "runtime"
    if packaged.is_dir():
        manifest = json.loads((SKILL / "runtime-files.json").read_text())
        for name, digest in manifest.items():
            path = packaged / name
            if (path.is_symlink() or not path.resolve().is_relative_to(packaged.resolve())
                    or hashlib.sha256(path.read_bytes()).hexdigest() != digest):
                raise ValueError("SKILL_RUNTIME_INTEGRITY_FAILED")
        return packaged
    repository = SKILL.parent.parent
    if (repository / "app.py").is_file() and (repository / "src/local_connector.py").is_file():
        return repository
    raise ValueError("SKILL_RUNTIME_MISSING: install the complete Ariadne Skill ZIP")


def executable(name, override=None):
    if override:
        return shutil.which(override)
    found = shutil.which(name)
    if not found and name == "codex" and sys.platform == "darwin":
        # Known desktop installations; account/config files are never inspected.
        for app in ("Codex", "ChatGPT"):
            candidate = Path(f"/Applications/{app}.app/Contents/Resources/codex")
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return str(candidate)
    return found


def clean_environment():
    return {key: value for key, value in os.environ.items()
            if not key.startswith(("CODEX_", "OPENAI_", "MCP_")) or key == "CODEX_HOME"}


def workspace_inventory(directory):
    result = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError("WORKSPACE_IMPORT_SYMLINK_REFUSED")
        if path.is_file() and path.name != ".lock":
            result[str(path.relative_to(directory))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def import_workspace(runtime, source_root, state, workspace, port=8766):
    """Copy one verified workspace and explicitly bind the native Skill profile."""
    sys.path.insert(0, str(runtime))
    from src.workspace_storage import WorkspaceStorage, CONTRACT

    state = state.expanduser()
    source_root = source_root.expanduser()
    if state.is_symlink() or source_root.is_symlink():
        raise ValueError("WORKSPACE_IMPORT_SYMLINK_REFUSED")
    state = state.resolve()
    source_root = source_root.resolve()
    source = WorkspaceStorage(source_root)
    source_directory = source.directory(workspace)
    if not (source_directory / "HEAD.json").is_file():
        raise ValueError("WORKSPACE_IMPORT_SOURCE_UNINITIALIZED")
    target_root = state / "workspaces"
    target = WorkspaceStorage(target_root).directory(workspace)
    mapping = state / "desktop-workspace.json"
    expected_mapping = {
        "contract_id": WORKSPACE_BINDING_CONTRACT,
        "workspace": workspace,
        "origin": f"http://127.0.0.1:{port}",
        "binding": "explicit",
    }

    with source._locked(workspace):
        head = source._head(source_directory)
        if not head["databases"]:
            raise ValueError("WORKSPACE_IMPORT_SOURCE_EMPTY")
        for database, stores in head["databases"].items():
            for store, records in stores.items():
                for key, entry in records.items():
                    source._load_record(source_directory, entry, CONTRACT["databases"][database][store], key)
        before = workspace_inventory(source_directory)
        if target.exists() or mapping.exists():
            try:
                current_mapping = json.loads(mapping.read_text())
            except (OSError, ValueError):
                current_mapping = None
            if target.is_dir() and current_mapping == expected_mapping and workspace_inventory(target) == before:
                return {
                    "status": "already_imported", "workspace": workspace, "files": len(before),
                    "original_files": sum(name.startswith("originals/") for name in before),
                    "verified_sha256": True,
                }
            raise FileExistsError("Destination workspace or binding already exists; nothing overwritten")

        target_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = target_root / (".import-" + uuid.uuid4().hex)
        shutil.copytree(source_directory, temporary, ignore=shutil.ignore_patterns(".lock"))
        if workspace_inventory(temporary) != before or workspace_inventory(source_directory) != before:
            raise ValueError("WORKSPACE_IMPORT_COPY_VERIFICATION_FAILED")
        if target.exists():
            raise FileExistsError("Destination workspace appeared during import")
        os.rename(temporary, target)
        state.mkdir(parents=True, exist_ok=True, mode=0o700)
        with mapping.open("x") as output:
            json.dump(expected_mapping, output)
            output.write("\n")
        mapping.chmod(0o600)
    return {
        "status": "imported", "workspace": workspace, "files": len(before),
        "original_files": sum(name.startswith("originals/") for name in before),
        "records": {database: {store: len(rows) for store, rows in stores.items()}
                    for database, stores in head["databases"].items()},
        "verified_sha256": True,
    }


def probe(command, env=None):
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=15,
                              env=clean_environment() if env is None else env)
    except (OSError, subprocess.SubprocessError):
        return None


def doctor():
    checks = []
    account_environment = None
    def record(name, ok, action):
        checks.append({"check": name, "ok": bool(ok), "action": "" if ok else action})
    record("python", sys.version_info >= (3, 9), "Use Python 3.9 or newer.")
    record("platform", os.name == "posix", "Native Windows is not qualified; use the web API-key path.")
    try:
        runtime = runtime_root()
        sys.path.insert(0, str(runtime))
        import app  # noqa: F401 - prove the distributed runtime imports intact
        from src.codex_account import environment
        account_environment = environment()
        record("runtime", True, "")
    except (OSError, ValueError, ImportError, SyntaxError):
        record("runtime", False, "Install the complete Skill ZIP, including runtime and its manifest.")
    codex = executable("codex", os.environ.get("ARIADNE_CODEX_BINARY"))
    record("codex", codex, "Install a compatible Codex CLI for this computer, or make it available on PATH.")
    if codex:
        help_result = probe([codex, "app-server", "--help"])
        flags = ("--stdio", "generate-json-schema")
        record("codex_protocol", help_result is not None and help_result.returncode == 0
               and all(flag in help_result.stdout for flag in flags),
               "This Codex CLI lacks the isolated multimodal protocol required by Ariadne; use a compatible version.")
        login = probe([codex, "login", "status"], env=account_environment) if account_environment is not None else None
        record("codex_login", login is not None and login.returncode == 0,
               "Run python3 scripts/ariadne.py login for Ariadne's separate Codex account directory. Complete the official login yourself; do not share credentials.")
    for tool in ("pdftoppm", "pdfinfo"):
        binary = executable(tool)
        result = probe([binary, "-v"]) if binary else None
        record(tool, result is not None and result.returncode == 0,
               "Install Poppler for your OS/CPU and expose pdftoppm and pdfinfo on PATH.")
    return {"ready": all(check["ok"] for check in checks), "checks": checks,
            "model_call_made": False, "model_capability_certified": False}


def connect(origin):
    result = doctor()
    if not result["ready"]:
        print(json.dumps(result, ensure_ascii=False), flush=True)
        return 1
    from src.local_connector import Pairing, connector_handler
    from app import JobRadarHandler
    pairing = Pairing(origin)
    # Explicit process-local opt-in. No persisted runtime or Agent settings change.
    os.environ["ARIADNE_CODEX_ENABLED"] = "1"
    os.environ["ARIADNE_CODEX_BINARY"] = executable("codex", os.environ.get("ARIADNE_CODEX_BINARY"))
    try:
        from src.loopback_server import LoopbackHTTPServer
        server = LoopbackHTTPServer(("127.0.0.1", 8765), connector_handler(JobRadarHandler))
    except OSError:
        print(json.dumps({"error": "CONNECTOR_PORT_UNAVAILABLE", "port": 8765,
                          "action": "Stop your existing connector yourself; no process was replaced."}))
        return 1
    server.pairing = pairing
    def stop(_signum, _frame):
        raise KeyboardInterrupt
    previous = {sig: signal.signal(sig, stop) for sig in (signal.SIGINT, signal.SIGTERM)}
    print(json.dumps({"status": "awaiting_pairing", "url": origin + "/codex-connect.html",
                      "pairing_code": pairing.code, "pairing_expires_in": 300,
                      "connector": "http://127.0.0.1:8765", "model_call_made": False}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        pairing.revoke()
        server.server_close()
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        print(json.dumps({"status": "stopped", "pairing_revoked": True}), flush=True)
    return 0


def open_local(port=8766, data_dir=None):
    """Serve the complete existing UI and keep user data outside the Skill install."""
    result = doctor()
    required = {"python", "platform", "runtime"}
    if any(not check["ok"] for check in result["checks"] if check["check"] in required):
        print(json.dumps(result, ensure_ascii=False), flush=True)
        return 1
    import app
    state = Path(data_dir) if data_dir else Path.home() / (
        "Library/Application Support/Ariadne Skill" if sys.platform == "darwin" else ".local/share/ariadne-skill")
    if state.is_symlink():
        raise ValueError("SKILL_DATA_SYMLINK_REFUSED")

    from src.product_application import skill_handler
    class Handler(skill_handler(app.JobRadarHandler)):
        def log_message(self, *args):
            pass

    try:
        from src.loopback_server import LoopbackHTTPServer
        server = LoopbackHTTPServer(("127.0.0.1", port), Handler)
    except OSError:
        print(json.dumps({"error": "SKILL_PORT_UNAVAILABLE", "port": port,
                          "action": "Use your already-running Skill terminal or stop it yourself; no process was replaced."}))
        return 1
    try:
        state.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.environ["ARIADNE_WORKSPACE_ROOT"] = str(state.resolve() / "workspaces")
        os.environ["ARIADNE_CODEX_ENABLED"] = "1" if result["ready"] else "0"
        codex = executable("codex", os.environ.get("ARIADNE_CODEX_BINARY"))
        if codex:
            os.environ["ARIADNE_CODEX_BINARY"] = codex
        app.DATABASE_PATH = state / "legacy.db"
        app.OCR_UPLOAD_PATH = state / "local_ocr_uploads"
        app.RAW_CAPTURE_PATH = state / "raw"
        app.initialize_database(seed=False)
        def stop(_signum, _frame):
            raise KeyboardInterrupt
        previous = {sig: signal.signal(sig, stop) for sig in (signal.SIGINT, signal.SIGTERM)}
        print(json.dumps({"status": "ready", "mode": "local-ui",
            "url": f"http://127.0.0.1:{server.server_port}/",
            "origin": f"http://127.0.0.1:{server.server_port}", "pairing_required": False,
            "codex_ready": result["ready"], "checks": result["checks"],
            "data_directory": str(state), "model_call_made": False}), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)
    finally:
        server.server_close()
    print(json.dumps({"status": "stopped", "data_retained": True}), flush=True)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("doctor", "login", "open", "window", "desktop", "connect", "import-workspace"))
    parser.add_argument("--origin", default="https://ariadne.kai-nex.com")
    parser.add_argument("--port", type=int, default=8766, help="Local UI port; changing it creates a different browser origin.")
    parser.add_argument("--data-dir", type=Path, help="Explicit local UI data directory; defaults outside the Skill install.")
    parser.add_argument("--source-root", type=Path, help="Workspace root to import from; requires import-workspace.")
    parser.add_argument("--workspace", help="Exact 32-character workspace identity to import.")
    args = parser.parse_args()
    if args.action == "doctor":
        result = doctor()
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result["ready"] else 1
    try:
        if args.action == "login":
            sys.path.insert(0, str(runtime_root()))
            from src.codex_account import login
            codex = executable("codex", os.environ.get("ARIADNE_CODEX_BINARY"))
            if not codex: raise ValueError("CODEX_BINARY_MISSING")
            return login(codex)
        if args.action == "import-workspace":
            if not args.source_root or not args.workspace or not 1024 <= args.port <= 65535:
                raise ValueError("WORKSPACE_IMPORT_ARGUMENTS_INVALID")
            state = args.data_dir or Path.home() / "Library/Application Support/Ariadne Skill"
            print(json.dumps(import_workspace(runtime_root(), args.source_root, state, args.workspace, args.port), ensure_ascii=False))
            return 0
        if args.action in {"window", "desktop"}:
            from skill_window import open_window, supervise
            if not 1024 <= args.port <= 65535:
                raise ValueError("SKILL_PORT_INVALID")
            state = args.data_dir or Path.home() / "Library/Application Support/Ariadne Skill"
            if args.action == "window":
                return open_window(runtime_root(), args.port, state)
            return supervise(runtime_root(), args.port, state)
        if args.action == "open":
            if not 0 <= args.port <= 65535:
                raise ValueError("SKILL_PORT_INVALID")
            return open_local(args.port, args.data_dir)
        print(json.dumps({"error": "WEB_PAIRING_RETIRED", "action": "Use window for local Codex, or use your API key on the website."}))
        return 1
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        if args.action in {"window", "desktop"}:
            print(json.dumps({"error": "NATIVE_WINDOW_SETUP_FAILED", "action": str(error)}))
        elif args.action == "import-workspace":
            print(json.dumps({"error": "WORKSPACE_IMPORT_FAILED", "action": str(error)}))
        else:
            print(json.dumps({"error": "CONNECTOR_SETUP_FAILED", "action": "Check the exact HTTPS origin and Skill installation."}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
