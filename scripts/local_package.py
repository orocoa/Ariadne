"""Relocatable local distribution installer/launcher; never bundles user state."""
from __future__ import annotations

import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import socket
import signal
import subprocess
import sys
import threading
import urllib.request


def install(bundle, home):
    manifest = json.loads((bundle / "release.json").read_text())
    release = manifest["release"]
    if not release or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._" for c in release):
        raise ValueError("Invalid release identity")
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (home / "install.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        target = home / "releases" / release
        if not (target / ".installed").exists():
            if target.exists():
                raise RuntimeError("上次安装未完成，原文件已保留。请使用新下载的安装包重试。")
            shutil.copytree(bundle, target, symlinks=True)
            state = home / "data"
            state.mkdir(exist_ok=True, mode=0o700)
            for name in ("workspaces", "runtime", "raw", "local_ocr_uploads"):
                (state / name).mkdir(exist_ok=True, mode=0o700)
                (target / "app/data" / name).symlink_to(state / name, target_is_directory=True)
            (target / "app/data/job_radar.db").symlink_to(state / "job_radar.db")
            (target / ".installed").write_text(release)
        return target


def environment(target):
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("CODEX_", "OPENAI_", "MCP_", "PYTHON", "ARIADNE_"))}
    # Existing Codex login stays in its normal home. Nothing reads/copies tokens.
    env.update(PATH=f"{target / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin",
               PYTHONDONTWRITEBYTECODE="1", PYTHONNOUSERSITE="1",
               ARIADNE_CODEX_BINARY=str(target / "bin/codex"), ARIADNE_CODEX_ENABLED="1",
               # Installer owns this link. Give storage its real data root;
               # WorkspaceStorage still rejects symlink roots/entries normally.
               ARIADNE_WORKSPACE_ROOT=str((target / "app/data/workspaces").resolve()))
    if os.environ.get("CODEX_HOME"):
        env["CODEX_HOME"] = os.environ["CODEX_HOME"]
    return env


def serve(target, port, open_browser, exclusive=False):
    release = json.loads((target / "release.json").read_text())["release"]
    origin = f"http://127.0.0.1:{port}"
    try:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", port))
    except OSError:
        if exclusive:
            raise RuntimeError(f"端口 {port} 已被占用。请先退出原 Ariadne 或停止原服务，再打开 App；不会接管或停止已有服务。")
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(origin + "/api/local-package", timeout=2) as response:
                state = json.load(response)
            if state != {"product": "ariadne-local", "release": release}:
                raise ValueError("different service")
        except Exception as exc:
            raise RuntimeError(f"端口 {port} 已被其他服务或另一版本占用。请先停止原服务，再启动此版本。不会自动停止进程或更换资料地址。") from exc
        if open_browser:
            subprocess.run(["/usr/bin/open", origin], check=True)
        print("Ariadne 已经运行，已复用原服务。", flush=True)
        return

    sys.path.insert(0, str(target / "app"))
    import app
    from src.loopback_server import LoopbackHTTPServer as ThreadingHTTPServer

    class Handler(app.JobRadarHandler):
        def do_GET(self):
            if self.path == "/api/local-package":
                if self.local_request_allowed():
                    self.send_json(200, {"product": "ariadne-local", "release": release})
                return
            super().do_GET()

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    app.initialize_database()
    if exclusive:
        print(json.dumps({"status": "ready", "origin": origin}), flush=True)
    else:
        print(f"Ariadne 已启动：{origin}\n先选择自己的 Codex、API 模型或本地运行，点击继续进入工作空间。\n关闭此终端或按 Ctrl+C 停止服务；资料保留。", flush=True)
    if open_browser:
        subprocess.Popen(["/usr/bin/open", origin])
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def stop_owned_server(child):
    """Freeze our child tree before stopping it, including detached Codex jobs.

    No lookup by name or port: the root is the Popen handle created by this
    supervisor. Other Ariadne instances and the user's Codex are not targets.
    """
    if child.poll() is not None:
        return
    owned = {child.pid}
    try:
        os.kill(child.pid, signal.SIGSTOP)
        while True:
            rows = subprocess.check_output(["/bin/ps", "-axo", "pid=,ppid="], text=True)
            additions = {int(pid) for line in rows.splitlines()
                         for pid, parent in [line.split()] if int(parent) in owned} - owned
            if not additions:
                break
            for pid in additions:
                try:
                    os.kill(pid, signal.SIGSTOP)
                except ProcessLookupError:
                    pass
            owned.update(additions)
        for pid in owned:
            try:
                os.kill(pid, signal.SIGTERM)
                os.kill(pid, signal.SIGCONT)
            except ProcessLookupError:
                pass
        try:
            child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass
    finally:
        # All captured descendants were paused before termination. Kill any
        # survivors (for example a helper ignoring SIGTERM), then reap our child.
        for pid in owned:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        child.wait(timeout=3)


def desktop(bundle, home, port):
    """App holds stdin open. EOF also stops the server if the App crashes."""
    stopped = threading.Event()
    def watch_parent():
        while os.read(sys.stdin.fileno(), 1):
            pass
        stopped.set()
    threading.Thread(target=watch_parent, daemon=True).start()
    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, lambda *_: stopped.set())
    target = install(bundle, home)
    if stopped.is_set():
        return
    child = subprocess.Popen(
        [str(target / "python/bin/python3"), "-I", "-B", str(target / "local_package.py"),
         "serve", "--port", str(port), "--no-open", "--exclusive"],
        cwd=target / "app", env=environment(target), stdin=subprocess.DEVNULL,
        start_new_session=True,
    )
    try:
        while not stopped.wait(0.1):
            if child.poll() is not None:
                raise RuntimeError("本地服务未能运行。请检查端口占用和本地日志。")
    finally:
        stop_owned_server(child)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("start", "login", "connector", "serve", "desktop"))
    parser.add_argument("--home", type=Path, default=Path.home() / "Library/Application Support/Ariadne Local")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--exclusive", action="store_true", help="只运行当前 App 自己的服务，不复用端口")
    args = parser.parse_args()
    os.umask(0o077)
    bundle = Path(__file__).resolve().parent
    if args.mode == "desktop":
        desktop(bundle, args.home.expanduser().resolve(), args.port)
        return
    if args.mode == "serve":
        serve(bundle, args.port, not args.no_open, args.exclusive)
        return
    target = install(bundle, args.home.expanduser().resolve())
    env = environment(target)
    if args.mode == "login":
        print("即将打开 Codex 官方 ChatGPT 登录。已有登录不会被打包或上传给 Ariadne。", flush=True)
        os.execve(target / "bin/codex", [str(target / "bin/codex"), "login"], env)
    python = target / "python/bin/python3"
    if args.mode == "connector":
        print("仅在使用公开网页版时需要配对。本地运行不需要此步骤。")
        origin = input("输入网页来源（回车使用 https://ariadne.kai-nex.com）：").strip() or "https://ariadne.kai-nex.com"
        command = [str(python), "-B", str(target / "app/scripts/run_codex_connector.py"), "--origin", origin]
    else:
        command = [str(python), "-B", str(target / "local_package.py"), "serve", "--port", str(args.port)]
        if args.no_open:
            command.append("--no-open")
    os.chdir(target / "app")
    os.execve(python, command, env)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Ariadne 启动失败：{error}", file=sys.stderr)
        sys.exit(1)
