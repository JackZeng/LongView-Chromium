from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import sys
from pathlib import Path

from .config import ChromiumPin, Paths, browser_binary, built_target, depot_tool, host_platform
from .overlay import install_blink_observability, install_overlay, remove_blink_observability, remove_overlay
from .packaging import package_developer_bundle, package_macos_app
from .process import run


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def common_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="longview", description="Build, measure, and probe LongView Chromium")
    parser.add_argument("--workspace", help="Chromium/depot_tools workspace")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor")
    fetch_parser = sub.add_parser("fetch"); fetch_parser.add_argument("--full-history", action="store_true"); fetch_parser.add_argument("--skip-hooks", action="store_true")
    sync = sub.add_parser("sync"); sync.add_argument("--skip-hooks", action="store_true")
    build_parser = sub.add_parser("build"); build_parser.add_argument("--profile", choices=["baseline", "longview-dev", "longview-release"], default="longview-dev"); build_parser.add_argument("--output", default="LongView"); build_parser.add_argument("--target", default="chrome")
    launch = sub.add_parser("run"); launch.add_argument("--output", default="LongView"); launch.add_argument("--profile-name", default="default"); launch.add_argument("--baseline", action="store_true"); launch.add_argument("url", nargs="?", default="about:blank"); launch.add_argument("browser_args", nargs=argparse.REMAINDER)
    package = sub.add_parser("package"); package.add_argument("--output", default="LongView"); package.add_argument("--destination", default="dist"); package.add_argument("--mac-app", action="store_true")
    benchmark = sub.add_parser("benchmark"); benchmark.add_argument("--output", default="LongView"); benchmark.add_argument("--turns", type=int, default=500); benchmark.add_argument("--runs", type=int, default=3); benchmark.add_argument("--duration", type=int, default=9000); benchmark.add_argument("--stream", action="store_true"); benchmark.add_argument("--stress", action="store_true"); benchmark.add_argument("--trace", action="store_true"); benchmark.add_argument("--headless", action="store_true"); benchmark.add_argument("--baseline", action="store_true"); benchmark.add_argument("--result")
    evidence = sub.add_parser("evidence"); evidence.add_argument("--output", default="LongView"); evidence.add_argument("--turns", default="100,500,1000,2000"); evidence.add_argument("--runs", type=int, default=5); evidence.add_argument("--duration", type=int, default=9000); evidence.add_argument("--stream", action="store_true"); evidence.add_argument("--stress", action="store_true"); evidence.add_argument("--trace", action="store_true"); evidence.add_argument("--trace-all", action="store_true"); evidence.add_argument("--output-dir", default="benchmark-results/evidence")
    overlay = sub.add_parser("install-overlay"); overlay.add_argument("--force", action="store_true")
    sub.add_parser("remove-overlay"); sub.add_parser("install-blink-observability"); sub.add_parser("remove-blink-observability")
    probe = sub.add_parser("native-probe"); probe.add_argument("--profile", choices=["baseline", "longview-dev", "longview-release"], default="longview-dev"); probe.add_argument("--output", default="LongViewNativeProbe"); probe.add_argument("--force", action="store_true")
    return parser


def command_env(paths: Paths) -> dict[str, str]:
    env = {"PATH": f"{paths.depot_tools}{os.pathsep}{os.environ.get('PATH', '')}"}
    if host_platform() == "win": env["DEPOT_TOOLS_WIN_TOOLCHAIN"] = os.environ.get("DEPOT_TOOLS_WIN_TOOLCHAIN", "0")
    return env


def doctor(paths: Paths, pin: ChromiumPin) -> int:
    base = paths.workspace.parent if paths.workspace.parent.exists() else paths.repo
    free_gb = shutil.disk_usage(base).free / 1024**3
    checks = {"platform": platform.platform(), "python": sys.version.split()[0], "git": shutil.which("git"), "node": shutil.which("node"), "cmake": shutil.which("cmake"), "depotTools": str(paths.depot_tools) if paths.depot_tools.exists() else None, "workspace": str(paths.workspace), "freeDiskGiB": round(free_gb, 1), "chromiumVersion": pin.version, "chromiumCommit": pin.commit, "overlayInstalled": paths.overlay_destination.is_dir()}
    print(json.dumps(checks, indent=2))
    missing = [name for name in ("git", "node", "cmake") if not checks[name]]
    if missing: print(f"Missing required tools: {', '.join(missing)}", file=sys.stderr); return 2
    if free_gb < 120: print("Warning: 120+ GiB free disk is recommended for Chromium development.", file=sys.stderr)
    return 0


def ensure_depot_tools(paths: Paths) -> None:
    if paths.depot_tools.exists(): return
    paths.workspace.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "https://chromium.googlesource.com/chromium/tools/depot_tools.git", paths.depot_tools])


def sync_checkout(paths: Paths, pin: ChromiumPin, skip_hooks: bool) -> None:
    if not paths.chromium_src.exists(): raise FileNotFoundError(f"Chromium source is missing: {paths.chromium_src}. Run fetch first.")
    env = command_env(paths)
    run(["git", "fetch", "origin", pin.tag], cwd=paths.chromium_src, env=env)
    run(["git", "checkout", "--detach", pin.commit], cwd=paths.chromium_src, env=env)
    run([depot_tool(paths, "gclient"), "sync", "-D", "--with_branch_heads", "--with_tags", "--revision", f"src@{pin.commit}"], cwd=paths.workspace, env=env)
    if not skip_hooks: run([depot_tool(paths, "gclient"), "runhooks"], cwd=paths.workspace, env=env)


def fetch(paths: Paths, pin: ChromiumPin, full_history: bool, skip_hooks: bool) -> None:
    ensure_depot_tools(paths); env = command_env(paths)
    if not paths.chromium_src.exists():
        command: list[str | Path] = [depot_tool(paths, "fetch"), "--nohooks"]
        if not full_history: command.append("--no-history")
        command.append("chromium"); run(command, cwd=paths.workspace, env=env)
    sync_checkout(paths, pin, skip_hooks)


def build(paths: Paths, profile: str, output: str, target: str) -> None:
    if not paths.chromium_src.exists(): raise FileNotFoundError("Chromium checkout not found; run fetch first")
    args_source = paths.repo / "configs" / "gn" / f"{profile}.gn"
    if not args_source.exists(): raise FileNotFoundError(args_source)
    build_dir = paths.chromium_src / "out" / output; build_dir.mkdir(parents=True, exist_ok=True); shutil.copy2(args_source, build_dir / "args.gn")
    env = command_env(paths); run([depot_tool(paths, "gn"), "gen", f"out/{output}"], cwd=paths.chromium_src, env=env)
    ninja_target = target[2:] if target.startswith("//") else target
    run([depot_tool(paths, "autoninja"), "-C", f"out/{output}", ninja_target], cwd=paths.chromium_src, env=env)


def launch(paths: Paths, output: str, profile_name: str, baseline: bool, url: str, browser_args: list[str]) -> None:
    binary = browser_binary(paths.chromium_src, output)
    if not binary.exists(): raise FileNotFoundError(f"Browser binary not found: {binary}. Run build first.")
    profile = paths.profiles / profile_name; profile.mkdir(parents=True, exist_ok=True)
    command: list[str | Path] = [binary, f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check"]
    if not baseline: command.extend([f"--disable-extensions-except={paths.extension}", f"--load-extension={paths.extension}"])
    command.extend(item for item in browser_args if item != "--"); command.append(url); run(command, check=False)


def run_benchmark(paths: Paths, args: argparse.Namespace) -> None:
    binary = browser_binary(paths.chromium_src, args.output)
    if not binary.exists(): raise FileNotFoundError(f"Browser binary not found: {binary}. Run build first.")
    command: list[str | Path] = ["node", paths.repo / "benchmarks/runner/runner.mjs", "--executable", binary, "--turns", str(args.turns), "--runs", str(args.runs), "--duration", str(args.duration)]
    if not args.baseline: command.append("--longview")
    for flag in ("stream", "stress", "trace", "headless"):
        if getattr(args, flag): command.append(f"--{flag}")
    if args.result: command.extend(["--output", args.result])
    run(command, cwd=paths.repo)


def run_evidence(paths: Paths, args: argparse.Namespace) -> None:
    binary = browser_binary(paths.chromium_src, args.output)
    if not binary.exists(): raise FileNotFoundError(f"Browser binary not found: {binary}. Run build first.")
    command: list[str | Path] = ["node", paths.repo / "benchmarks/runner/campaign.mjs", "--executable", binary, "--turns", args.turns, "--runs", str(args.runs), "--duration", str(args.duration), "--outputDir", args.output_dir]
    for name, flag in (("stream", "--stream"), ("stress", "--stress"), ("trace", "--trace"), ("trace_all", "--trace-all")):
        if getattr(args, name): command.append(flag)
    run(command, cwd=paths.repo)


def native_probe(paths: Paths, version: str, profile: str, output: str, force: bool) -> None:
    install_overlay(paths, version, force=force); install_blink_observability(paths)
    for target in ("//longview:segment_policy_test", "//longview:engine_contract_test", "//longview:blink_bridge_test", "//longview:blink_feature_probe"): build(paths, profile, output, target)
    for executable in ("segment_policy_test", "engine_contract_test", "blink_bridge_test", "blink_feature_probe"): run([built_target(paths.chromium_src, output, executable)], cwd=paths.chromium_src)
    result = {"version": version, "chromiumSource": str(paths.chromium_src), "output": output, "targets": ["segment_policy_test", "engine_contract_test", "blink_bridge_test", "blink_feature_probe"], "status": "passed"}
    paths.overlay_destination.mkdir(parents=True, exist_ok=True)
    (paths.overlay_destination / "NATIVE_PROBE_RESULT.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


def main(argv: list[str] | None = None) -> int:
    args = common_parser().parse_args(argv); repo = repo_root(); paths = Paths.discover(repo, args.workspace); pin = ChromiumPin.load(repo / "chromium.version"); version = (repo / "VERSION").read_text(encoding="utf-8").strip()
    try:
        if args.command == "doctor": return doctor(paths, pin)
        if args.command == "fetch": fetch(paths, pin, args.full_history, args.skip_hooks)
        elif args.command == "sync": sync_checkout(paths, pin, args.skip_hooks)
        elif args.command == "build": build(paths, args.profile, args.output, args.target)
        elif args.command == "run": launch(paths, args.output, args.profile_name, args.baseline, args.url, args.browser_args)
        elif args.command == "package":
            destination = (repo / args.destination).resolve(); destination.mkdir(parents=True, exist_ok=True)
            print(package_macos_app(paths, args.output, version, destination) if args.mac_app else package_developer_bundle(paths, args.output, version, destination))
        elif args.command == "benchmark": run_benchmark(paths, args)
        elif args.command == "evidence": run_evidence(paths, args)
        elif args.command == "install-overlay": print(install_overlay(paths, version, force=args.force))
        elif args.command == "remove-overlay": print("removed" if remove_overlay(paths) else "not installed")
        elif args.command == "install-blink-observability": print("installed" if install_blink_observability(paths) else "already installed")
        elif args.command == "remove-blink-observability": print("removed" if remove_blink_observability(paths) else "not installed")
        elif args.command == "native-probe": native_probe(paths, version, args.profile, args.output, args.force)
        return 0
    except (FileExistsError, FileNotFoundError, RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr); return 2


if __name__ == "__main__": raise SystemExit(main())
