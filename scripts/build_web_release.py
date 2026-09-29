"""Export a deployment directory from public tracked source, never the worktree wholesale."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path
from check_public_release import FORBIDDEN_DIRS, PRIVATE_DATA_DIRS, SECRET_NAMES, SECRET_PATTERN

ROOT = Path(__file__).resolve().parents[1]


def release_files():
    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    explicit = {"app.py", "web_app.py", "src/web_execution.py", "src/web_source_read.py", "Dockerfile", ".dockerignore", "LICENSE", "deploy/requirements.txt",
                "deploy/gunicorn.conf.py", "deploy/compose.yaml", "deploy/Caddyfile", "deploy/downloads/.gitkeep",
                "deploy/install-docker-ubuntu.sh", "src/byok_providers.py", "public/provider-visual-check.pdf"}
    selected = set(explicit)
    selected.update({'public/product-shell.js', 'public/skill-guide.js', 'public/product-config.js', 'public/product-transport.js', 'src/product_application.py'})
    selected.update({'src/local_attachment_delivery.py', 'src/runtime_cancellation.py'})
    for name in filter(None, names):
        if name.startswith(("public/", "src/")) and not name.startswith("public/downloads/"):
            selected.add(name)
        elif name.startswith("data/") and name.endswith(".json"):
            # Only versioned contracts; runtime directories are never permitted.
            if any(part in {"runtime", "workspaces", "raw", "uploads", "private_fixtures"} for part in Path(name).parts):
                continue
            if not Path(name).name.startswith("jd-"):
                selected.add(name)
    return sorted(selected)


def build(output, include_local_package=False):
    output.mkdir(parents=True, exist_ok=False)
    records = []
    for name in release_files():
        source = ROOT / name
        parts = Path(name).parts
        if (source.is_symlink() or not source.is_file() or set(parts) & FORBIDDEN_DIRS
            or source.name in SECRET_NAMES or (parts[0] == "data" and set(parts) & PRIVATE_DATA_DIRS)):
            raise ValueError("invalid_release_source: " + name)
        if SECRET_PATTERN.search(source.read_bytes()):
            raise ValueError("credential_shaped_release_source: " + name)
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        records.append({"file": name, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
    shutil.copyfile(ROOT / "docs/current/WEB_DEPLOYMENT.md", output / "README-DEPLOY.md")
    shutil.copyfile(ROOT / "docs/current/WEB_FIRST_DEPLOY.md", output / "WEB_FIRST_DEPLOY.md")
    download = None
    if include_local_package:
        metadata = json.loads((ROOT / "public/downloads/latest.json").read_text())
        if not re.fullmatch(r"/downloads/Ariadne-Local-macOS-arm64-[0-9-]+\.zip", metadata["url"]):
            raise ValueError("invalid_local_package_url")
        archive = ROOT / "public" / metadata["url"].lstrip("/")
        if archive.stat().st_size != metadata["bytes"] or hashlib.sha256(archive.read_bytes()).hexdigest() != metadata["sha256"]:
            raise ValueError("local_package_integrity_mismatch")
        destination = output / "deploy/downloads"
        shutil.copyfile(archive, destination / archive.name)
        (destination / "latest.json").write_text(json.dumps(metadata))
        download = metadata
    manifest = {"created_at": datetime.now(timezone.utc).isoformat(), "origin": "https://ariadne.kai-nex.com",
                "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                "includes_working_changes": bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT)),
                "files": records, "local_download": download}
    (output / "release.json").write_text(json.dumps(manifest, indent=2))
    archive = output.with_suffix(".tar.gz")
    if archive.exists():
        raise FileExistsError(archive)
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(output, arcname=output.name, recursive=True)
    return {"directory": str(output), "archive": str(archive), "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--include-local-package", action="store_true")
    args = parser.parse_args()
    output = args.output or ROOT / ".cache/web-distribution" / datetime.now().strftime("%Y%m%d-%H%M%S")
    print(json.dumps(build(output.resolve(), args.include_local_package)))
