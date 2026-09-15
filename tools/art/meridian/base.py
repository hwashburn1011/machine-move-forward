"""Reuse original campaign geometry/material tools in a fresh Blender process."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'glass_orchard'))
import common as c
c.OUT=c.ROOT/'assets/meridian';c.OUT.mkdir(parents=True,exist_ok=True)
(c.OUT/'exports').mkdir(exist_ok=True)
