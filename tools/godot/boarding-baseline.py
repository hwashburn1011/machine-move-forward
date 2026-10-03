"""Extract the pre-refinement ship methods for reproducible native comparisons.

This does not overwrite the recorded contract fixture. It writes a test-only
subclass that can run alongside the current typed native game.
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVISION = "9865934"
code = subprocess.check_output(
    ["git", "show", f"{REVISION}:godot/scripts/combat.gd"], cwd=ROOT, text=True
)
names = ["begin_ship", "update_ship", "cut_hook", "destroy_ship", "retreat_ship"]
selected = [
    function for function in re.split(r"(?=^func )", code, flags=re.M)
    if any(function.startswith("func " + name + "(") for name in names)
]
assert len(selected) == len(names), "Original ship methods could not be extracted"
output = ROOT / "test-results/godot-native/boarding-prior.gd"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text("extends MMFCombat\n\n" + "".join(selected), encoding="utf-8")
print(f"Wrote original {REVISION} ship methods to {output}")
