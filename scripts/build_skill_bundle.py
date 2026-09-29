"""Build an architecture-independent, self-contained Ariadne Skill ZIP."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from check_public_release import FORBIDDEN_DIRS, PRIVATE_DATA_DIRS, SECRET_NAMES, SECRET_PATTERN


def runtime_files(root=ROOT):
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
    selected = {name for name in tracked if name == "app.py"
                  or name.startswith("src/") and name.endswith((".py", ".swift"))
                  or name.startswith("data/") and name.endswith((".json", ".sql")) and not name.startswith("data/evaluation/")
                  or name.startswith("public/") and not name.startswith("public/downloads/")}
    selected.update({'public/product-shell.js', 'public/skill-guide.js', 'public/product-config.js', 'public/product-transport.js', 'src/product_application.py'})
    selected.update({'src/local_attachment_delivery.py', 'src/runtime_cancellation.py'})
    selected.update({"public/skill-download.js", "public/skill-install.js", "public/install.html", "scripts/desktop_macos.swift", "scripts/local_package.py",
                     "assets/desktop-icon/compiled/Ariadne.icns", "assets/desktop-icon/compiled/Assets.car"})
    return sorted(selected)


def safe_copy(source, destination, relative):
    parts = Path(relative).parts
    if (Path(relative).is_absolute() or ".." in parts or source.is_symlink() or not source.is_file()
            or set(parts) & (FORBIDDEN_DIRS | PRIVATE_DATA_DIRS)
            or source.name in SECRET_NAMES or Path(relative).name in SECRET_NAMES
            or parts[0] == "data" and Path(relative).name.startswith("jd-")
            or SECRET_PATTERN.search(source.read_bytes())):
        raise ValueError("Unsafe Skill source: " + relative)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def build(output):
    output.mkdir(parents=True, exist_ok=False)
    skill = output / "ariadne"
    for name in ("SKILL.md", "agents/openai.yaml", "scripts/ariadne.py", "scripts/skill_window.py"):
        safe_copy(ROOT / "skills/ariadne" / name, skill / name, name)
    hashes = {}
    for name in runtime_files():
        destination = skill / "runtime" / name
        safe_copy(ROOT / name, destination, name)
        hashes[name] = hashlib.sha256(destination.read_bytes()).hexdigest()
    shutil.copyfile(ROOT / "LICENSE", skill / "LICENSE")
    (skill / "runtime-files.json").write_text(json.dumps(hashes, indent=2) + "\n")
    (skill / "build.json").write_text(json.dumps({"source_commit": subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "includes_working_changes": bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT)),
        "created_at": datetime.now(timezone.utc).isoformat(), "contains_credentials": False,
        "contains_user_data": False, "bundled_binaries": False}, indent=2) + "\n")
    archive = output / "Ariadne-Skill.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(skill.rglob("*")):
            if path.is_file():
                bundle.write(path, str(path.relative_to(output)))
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / "Ariadne-Skill.zip.sha256").write_text(digest + "  Ariadne-Skill.zip\n")
    return {"archive": str(archive), "skill": str(skill), "sha256": digest,
            "bytes": archive.stat().st_size, "runtime_files": len(hashes)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or ROOT / ".cache/skill-distribution" / datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    print(json.dumps(build(output.resolve())))
