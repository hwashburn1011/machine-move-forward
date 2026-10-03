"""Summarize an explicitly exported local MMF playtest recording; no network I/O."""
import argparse
import collections
import json
from pathlib import Path


def summarize(report):
    if report.get("schema") != 1 or not isinstance(report.get("events"), list):
        raise ValueError("Expected MMF recorder schema 1 and events array")
    events = report["events"]
    provenance = sorted({(e.get("mode", ""), e.get("checkpoint_id", ""), e.get("segment", 0)) for e in events})
    transactions = []
    for event in events:
        # Retain exact committed ledgers; do not infer money earned from labels,
        # count internal transfers as rewards, or assume missing data means zero.
        if event.get("event") in {"resource_transaction", "construction", "craft", "undo", "reward"}:
            transactions.append({k: event.get(k) for k in ("id", "segment", "simulation_s", "event", "payload")})
    return {
        "schema": 1,
        "metadata": report.get("metadata", {}),
        "recording_enabled": report.get("enabled", False),
        "event_count": len(events),
        "overflow": report.get("overflow", 0),
        "payload_truncations": report.get("payload_truncations", 0),
        "complete_event_history": report.get("overflow", 0) == 0,
        "provenance": [{"mode": mode, "checkpoint_id": checkpoint, "segment": segment} for mode, checkpoint, segment in provenance],
        "event_counts": dict(sorted(collections.Counter(e.get("event", "") for e in events).items())),
        "exclusive_activity_dwell": report.get("dwell", {}),
        "committed_event_ledger": transactions,
        "scope": "Local recorded observations. Checkpoint/synthetic segments are not uncoached campaign evidence; absent events are not proof that an activity did not happen.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = json.dumps(summarize(json.loads(args.recording.read_text(encoding="utf-8"))), indent=2)
    if args.output:
        args.output.write_text(result + "\n", encoding="utf-8")
    else:
        print(result)


if __name__ == "__main__":
    main()
