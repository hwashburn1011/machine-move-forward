"""Run the native earned-supply actor with a real clock and isolated saves.

No --fixed-fps: that option accelerates headless simulation. The child has a
wall watchdog and progress journal; this wrapper adds an independent hard
timeout, preserves logs and records whether runtime sources stayed unchanged.
"""
from pathlib import Path
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / 'godot'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_fingerprint():
    paths = [PROJECT/'project.godot']
    for folder in ['scripts', 'data', 'scenes', 'shaders']:
        paths.extend(p for p in (PROJECT/folder).rglob('*')
                     if p.is_file() and p.suffix in {'.gd', '.json', '.tscn', '.gdshader'})
    files = sorted(('res://'+p.relative_to(PROJECT).as_posix(), p) for p in paths)
    return hashlib.sha256(''.join(f'{name}\n{sha(path)}\n' for name, path in files).encode()).hexdigest()


def asset_manifest():
    # Imported Godot cache is derived. Fingerprint the authored runtime inputs,
    # including import settings, without hashing the entire repository archive.
    paths = sorted(p for folder in ['art', 'assets']
                   for p in (PROJECT/folder).rglob('*') if p.is_file())
    files = {p.relative_to(PROJECT).as_posix(): sha(p) for p in paths}
    digest = hashlib.sha256(''.join(f'{name}\n{value}\n' for name, value in files.items()).encode()).hexdigest()
    return dict(sha256=digest, files=files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--godot', type=Path, default=ROOT/'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe')
    parser.add_argument('--run-id', default='earned-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    parser.add_argument('--seed', default='mmf-default-seed')
    parser.add_argument('--stop-after', choices=['cargo', 'opening', 'wake', 'campaign'], default='wake')
    parser.add_argument('--max-wall', type=int, default=1200)
    parser.add_argument('--rendered', action='store_true', help='Use a hidden native window rather than headless; not a performance benchmark.')
    parser.add_argument('--review', action='store_true', help='Observation-only timed native screenshots and contextual long-frame log.')
    parser.add_argument('--diagnostic', action='store_true', help='Explicitly identify a debug run; never promote it as acceptance evidence.')
    parser.add_argument('--resume-save', type=Path, help='Diagnostic only: resume a verified save earned by an earlier actor run; never uninterrupted acceptance.')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,72}', args.run_id):
        parser.error('--run-id must be 1–72 letters, digits, underscore or hyphen')
    if not 20 <= args.max_wall <= 7200:
        parser.error('--max-wall must be between20 and7200 seconds')
    if not args.godot.is_file():
        parser.error(f'Godot executable not found: {args.godot}')
    if args.resume_save:
        args.resume_save = args.resume_save.resolve()
        if not args.diagnostic or not args.resume_save.is_file() or not args.resume_save.is_relative_to(ROOT/'test-results/campaign-earned-soak'):
            parser.error('--resume-save requires --diagnostic and an existing earned-run save under test-results/campaign-earned-soak')
    out = ROOT/'test-results/campaign-earned-soak'/args.run_id
    if out.exists():
        parser.error(f'Run directory already exists; preserve its evidence and choose another id: {out}')
    out.mkdir(parents=True)
    command = [str(args.godot), '--path', str(PROJECT), '--max-fps', '60']
    command += ['--position', '-20000,-20000'] if args.rendered else ['--headless']
    command += ['--script', 'res://tests/campaign_earned_soak.gd', '--',
                f'--run-id={args.run_id}', f'--seed={args.seed}',
                f'--stop-after={args.stop_after}', f'--max-wall={args.max_wall}']
    if args.resume_save:
        command += [f'--resume-save={args.resume_save}']
    if args.review:
        command += ['--review']
    initial_hash = source_fingerprint()
    initial_assets = asset_manifest()
    started = time.monotonic()
    timed_out = False
    last_heartbeat = None
    result = None
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    metadata = dict(command=command, diagnostic=args.diagnostic, human_test=False,
                    normal_clock=True, source_hash=initial_hash,
                    actor_sha256=sha(PROJECT/'tests/campaign_earned_soak.gd'),
                    runner_sha256=sha(Path(__file__)),
                    asset_sha256=initial_assets['sha256'],
                    started_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
                    uninterrupted_new_game=not bool(args.resume_save),
                    resumed_save=str(args.resume_save) if args.resume_save else None,
                    resumed_save_sha256=sha(args.resume_save) if args.resume_save else None)
    (out/'assets-start.json').write_text(json.dumps(initial_assets, indent=2)+'\n', encoding='utf-8')
    (out/'actor-source.gd').write_bytes((PROJECT/'tests/campaign_earned_soak.gd').read_bytes())
    (out/'runner-source.py').write_bytes(Path(__file__).read_bytes())
    (out/'launch.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'event':'launched', 'output':str(out), 'source_hash':initial_hash}), flush=True)
    with (out/'engine.log').open('w', encoding='utf-8') as log:
        process = subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                                   creationflags=creation_flags)
        metadata['process_id'] = process.pid
        (out/'launch.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
        def stop_owned_process_tree():
            # Godot's Windows console launcher creates a GUI child. Terminate
            # only this known launched process tree, so timeout leaves no orphan.
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
            elif process.poll() is None:
                process.kill()
            process.wait(timeout=10)
        try:
            while process.poll() is None:
                elapsed = time.monotonic()-started
                if elapsed > args.max_wall+40:
                    timed_out = True
                    stop_owned_process_tree()
                    break
                progress = out/'progress.json'
                if progress.exists():
                    try:
                        report = json.loads(progress.read_text(encoding='utf-8'))
                        key = (report.get('stage'), int(report.get('wall_seconds', 0)//10))
                        if key != last_heartbeat:
                            last_heartbeat = key
                            print(json.dumps({'event':'progress', **report}), flush=True)
                    except (OSError, json.JSONDecodeError):
                        pass  # Child may be flushing the next progress receipt.
                time.sleep(1)
            result = process.returncode
        except KeyboardInterrupt:
            stop_owned_process_tree()
            result = process.returncode
            metadata['interrupted'] = True
    final_hash = source_fingerprint()
    final_assets = asset_manifest()
    final_actor_hash = sha(PROJECT/'tests/campaign_earned_soak.gd')
    final_runner_hash = sha(Path(__file__))
    inputs_stable = (initial_hash == final_hash and initial_assets == final_assets and
                     metadata['actor_sha256'] == final_actor_hash and metadata['runner_sha256'] == final_runner_hash)
    (out/'assets-end.json').write_text(json.dumps(final_assets, indent=2)+'\n', encoding='utf-8')
    engine_text = (out/'engine.log').read_text(encoding='utf-8', errors='replace')
    errors = [line for line in engine_text.splitlines() if line.startswith(('SCRIPT ERROR:', 'ERROR:'))]
    report_file = out/'report.json'
    report = json.loads(report_file.read_text(encoding='utf-8')) if report_file.exists() else {}
    summary = dict(metadata, exit_code=result, timed_out=timed_out,
                   wall_seconds=time.monotonic()-started, source_hash_end=final_hash,
                   actor_sha256_end=final_actor_hash, runner_sha256_end=final_runner_hash,
                   asset_sha256_end=final_assets['sha256'], inputs_stable=inputs_stable,
                   source_stable=initial_hash==final_hash, engine_errors=errors[:50], engine_error_count=len(errors),
                   completed_report=bool(report), actor_passed=report.get('passed', False),
                   passed=not args.diagnostic and result==0 and not timed_out and
                          inputs_stable and not errors and report.get('passed', False))
    (out/'runner-summary.json').write_text(json.dumps(summary, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'event':'finished', **summary}), flush=True)
    return 0 if summary['passed'] or (args.diagnostic and result==0 and not errors and not timed_out) else 1


if __name__ == '__main__':
    raise SystemExit(main())
