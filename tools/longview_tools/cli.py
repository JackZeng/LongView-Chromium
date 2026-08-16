from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import sys
from pathlib import Path

from .config import ChromiumPin, Paths, browser_binary, depot_tool, host_platform
from .packaging import package_developer_bundle, package_macos_app
from .process import run


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def common_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="longview", description="Build and run LongView Chromium")
    parser.add_argument("--workspace", help="Chromium/depot_tools workspace (default: .longview or LONGVIEW_WORKSPACE)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="Check local prerequisites and workspace capacity")

    fetch = sub.add_parser("fetch", help="Fetch depot_tools and the pinned Chromium checkout")
    fetch.add_argument("--full-history", action="store_true", help="Keep full Chromium git history")
    fetch.add_argument("--skip-hooks", action="store_true")

    sync = sub.add_parser("sync", help="Reset Chromium to the pinned revision and sync dependencies")
    sync.add_argument("--skip-hooks", action="store_true")

    build = sub.add_parser("build", help="Generate GN files and build Chromium")
    build.add_argument("--profile", choices=["baseline", "longview-dev", "longview-release"], default="longview-dev")
    build.add_argument("--output", default="LongView")
    build.add_argument("--target", default="chrome")

    launch = sub.add_parser("run", help="Run built Chromium with the LongView extension")
    launch.add_argument("--output", default="LongView")
    launch.add_argument("--profile-name", default="default")
    launch.add_argument("--baseline", action="store_true", help="Run without the LongView extension")
    launch.add_argument("url", nargs="?", default="about:blank")
    launch.add_argument("browser_args", nargs=argparse.REMAINDER)

    package = sub.add_parser("package", help="Create a developer bundle or macOS app")
    package.add_argument("--output", default="LongView")
    package.add_argument("--destination", default="dist")
    package.add_argument("--mac-app", action="store_true")

    benchmark = sub.add_parser("benchmark", help="Run the deterministic conversation benchmark")
    benchmark.add_argument("--output", default="LongView")
    benchmark.add_argument("--turns", type=int, default=500)
    benchmark.add_argument("--runs", type=int, default=3)
    benchmark.add_argument("--duration", type=int, default=9000)
    benchmark.add_argument("--stream", action="store_true")
    benchmark.add_argument("--stress", action="store_true")
    benchmark.add_argument("--baseline", action="store_true")
    benchmark.add_argument("--result")
    return parser


def command_env(paths: Paths) -> dict[str, str]:
    current = os.environ.get("PATH", "")
    environment = {"PATH": f"{paths.depot_tools}{os.pathsep}{current}"}
    if host_platform() == "win":
        environment["DEPOT_TOOLS_WIN_TOOLCHAIN"] = os.environ.get(
            "DEPOT_TOOLS_WIN_TOOLCHAIN", "0"
        )
    return environment


def doctor(paths: Paths, pin: ChromiumPin) -> int:
    free_gb = shutil.disk_usage(paths.workspace.parent if paths.workspace.parent.exists() else paths.repo).free / 1024**3
    checks = {
        "platform": platform.platform(),
        "python": sys.version.split()[0],
        "git": shutil.which("git"),
        "node": shutil.which("node"),
        "cmake": shutil.which("cmake"),
        "depot_tools": str(paths.depot_tools) if paths.depot_tools.exists() else None,
        "workspace": str(paths.workspace),
        "freeDiskGiB": round(free_gb, 1),
        "chromiumVersion": pin.version,
        "chromiumCommit": pin.commit,
    }
    print(json.dumps(checks, indent=2))
    missing = [name for name in ("git", "node", "cmake") if not checks[name]]
    if missing:
        print(f"Missing required tools: {', '.join(missing)}", file=sys.stderr)
        return 2
    if free_gb < 120:
        print("Warning: Chromium development normally needs at least ~100 GiB; 120+ GiB is recommended.", file=sys.stderr)
    return 0


def ensure_depot_tools(paths: Paths) -> None:
    if paths.depot_tools.exists():
        return
    paths.workspace.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "https://chromium.googlesource.com/chromium/tools/depot_tools.git", paths.depot_tools])


def sync_checkout(paths: Paths, pin: ChromiumPin, skip_hooks: bool) -> None:
    if not paths.chromium_src.exists():
        raise FileNotFoundError(f"Chromium source is missing: {paths.chromium_src}. Run fetch first.")
    env = command_env(paths)
    run(["git", "fetch", "origin", pin.tag], cwd=paths.chromium_src, env=env)
    run(["git", "checkout", "--detach", pin.commit], cwd=paths.chromium_src, env=env)
    run([depot_tool(paths, "gclient"), "sync", "-D", "--with_branch_heads", "--with_tags", "--revision", f"src@{pin.commit}"], cwd=paths.workspace, env=env)
    if not skip_hooks:
        run([depot_tool(paths, "gclient"), "runhooks"], cwd=paths.workspace, env=env)


def fetch(paths: Paths, pin: ChromiumPin, full_history: bool, skip_hooks: bool) -> None:
    ensure_depot_tools(paths)
    env = command_env(paths)
    if not paths.chromium_src.exists():
        command: list[str | Path] = [depot_tool(paths, "fetch"), "--nohooks"]
        if not full_history:
            command.append("--no-history")
        command.append("chromium")
        run(command, cwd=paths.workspace, env=env)
    sync_checkout(paths, pin, skip_hooks)


def build(paths: Paths, profile: str, output: str, target: str) -> None:
    if not paths.chromium_src.exists():
        raise FileNotFoundError("Chromium checkout not found; run fetch first")
    args_source = paths.repo / "configs" / "gn" / f"{profile}.gn"
    if not args_source.exists():
        raise FileNotFoundError(args_source)
    build_dir = paths.chromium_src / "out" / output
    build_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args_source, build_dir / "args.gn")
    env = command_env(paths)
    run([depot_tool(paths, "gn"), "gen", f"out/{output}"], cwd=paths.chromium_src, env=env)
    run([depot_tool(paths, "autoninja"), "-C", f"out/{output}", target], cwd=paths.chromium_src, env=env)


def launch(paths: Paths, output: str, profile_name: str, baseline: bool, url: str, browser_args: list[str]) -> None:
    binary = browser_binary(paths.chromium_src, output)
    if not binary.exists():
        raise FileNotFoundError(f"Browser binary not found: {binary}. Run build first.")
    profile = paths.profiles / profile_name
    profile.mkdir(parents=True, exist_ok=True)
    command: list[str | Path] = [binary, f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check"]
    if not baseline:
        command.extend([
            f"--disable-extensions-except={paths.extension}",
            f"--load-extension={paths.extension}",
        ])
    command.extend(argument for argument in browser_args if argument != "--")
    command.append(url)
    run(command, check=False)


def run_benchmark(paths: Paths, args: argparse.Namespace) -> None:
    binary = browser_binary(paths.chromium_src, args.output)
    if not binary.exists():
        raise FileNotFoundError(f"Browser binary not found: {binary}. Run build first.")
    runner_dependency = paths.repo / "benchmarks" / "runner" / "node_modules" / "playwright-core"
    if not runner_dependency.exists():
        raise FileNotFoundError(
            "Benchmark dependency missing. Run `npm install` in benchmarks/runner first."
        )
    command: list[str | Path] = [
        "node", paths.repo / "benchmarks" / "runner" / "runner.mjs",
        "--executable", binary, "--turns", str(args.turns), "--runs", str(args.runs),
        "--duration", str(args.duration),
    ]
    if not args.baseline:
        command.append("--longview")
    if args.stream:
        command.append("--stream")
    if args.stress:
        command.append("--stress")
    if args.result:
        command.extend(["--output", args.result])
    run(command, cwd=paths.repo)


def main(argv: list[str] | None = None) -> int:
    parser = common_parser()
    args = parser.parse_args(argv)
    repo = repo_root()
    paths = Paths.discover(repo, args.workspace)
    pin = ChromiumPin.load(repo / "chromium.version")

    try:
        if args.command == "doctor":
            return doctor(paths, pin)
        if args.command == "fetch":
            fetch(paths, pin, args.full_history, args.skip_hooks)
        elif args.command == "sync":
            sync_checkout(paths, pin, args.skip_hooks)
        elif args.command == "build":
            build(paths, args.profile, args.output, args.target)
        elif args.command == "run":
            launch(paths, args.output, args.profile_name, args.baseline, args.url, args.browser_args)
        elif args.command == "package":
            version = (repo / "VERSION").read_text(encoding="utf-8").strip()
            destination = (repo / args.destination).resolve()
            destination.mkdir(parents=True, exist_ok=True)
            artifact = (
                package_macos_app(paths, args.output, version, destination)
                if args.mac_app
                else package_developer_bundle(paths, args.output, version, destination)
            )
            print(artifact)
        elif args.command == "benchmark":
            run_benchmark(paths, args)
        return 0
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
