"""Record real CRE CLI simulations for the Chainlink video: every output line with the second it appeared.

  python3 capture.py              -> cre-run.json (dry runs: read Monad and API-Football, write nothing)
  python3 capture.py --broadcast  -> the same, but the reports go on chain (spends the broadcaster's testnet MON)

tracks.html replays cre-run.json in its terminal scene, so the video shows the actual output of a run.
"""
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
CRE = ROOT.parents[1] / "monad/cre"
RUNS = [
    ("settlement", 1, "schedule new fixtures"),
    ("settlement", 0, "write final scores"),
    ("questions", 0, "settle fans' takes"),
]
KEEP = re.compile(r"✓|\[SIMULATION\] Running trigger|\[USER LOG\]|^\"|Simulation complete|Binary hash")


def run(workflow, index, broadcast):
    cmd = ["cre", "workflow", "simulate", workflow, "-T", "staging-settings", "--non-interactive", "--trigger-index", str(index)]
    if broadcast:
        cmd.append("--broadcast")
    start = time.monotonic()
    proc = subprocess.Popen(cmd, cwd=CRE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    lines = []
    for line in proc.stdout:
        line = line.rstrip()
        if line.strip() and KEEP.search(line):
            lines.append({"at": round(time.monotonic() - start, 2), "text": line.strip()})
    proc.wait()
    return {"cmd": "cre " + " ".join(cmd[1:]), "lines": lines, "secs": round(time.monotonic() - start, 2)}


if __name__ == "__main__":
    broadcast = "--broadcast" in sys.argv
    out = {
        "captured": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "broadcast": broadcast,
        "runs": [run(w, i, broadcast) | {"why": why} for w, i, why in RUNS],
    }
    (ROOT / "cre-run.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    for r in out["runs"]:
        print("$", r["cmd"])
        for l in r["lines"]:
            print(f"  {l['at']:5.1f}s  {l['text'][:120]}")
