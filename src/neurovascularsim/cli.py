"""Command line: ``nvs run spec.json`` and ``nvs serve``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .experiment import ExperimentSpec, RunStore, run_experiment


def main(argv: list[str] | None = None) -> int:
    """Command-line entry point: ``nvs run SPEC`` and ``nvs serve``."""
    parser = argparse.ArgumentParser(prog="nvs", description="NeuroVascularSim")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="run an experiment spec (JSON)")
    run.add_argument("spec", type=Path)
    run.add_argument("--store", type=Path, default=Path("runs"), help="directory for run records")
    run.add_argument("--print", action="store_true", help="print the full run record")

    serve = sub.add_parser("serve", help="start the web API")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)

    args = parser.parse_args(argv)

    if args.command == "run":
        spec = ExperimentSpec.from_json(args.spec.read_text())
        record = run_experiment(spec)
        RunStore(args.store).save(record)
        if args.print:
            json.dump(record.to_dict(), sys.stdout, indent=2)
            print()
        else:
            print(f"run {record.id} saved in {args.store}/")
            for label, s in record.summary.items():
                rel = [f"{x:.3f}" if x is not None else "nan" for x in s["relative_flow"]]
                print(f"  {label}: relative flow per edge {rel}")
        return 0

    if args.command == "serve":
        try:
            import uvicorn
        except ImportError:
            print('the server needs extra packages: pip install -e ".[server]"', file=sys.stderr)
            return 1
        uvicorn.run("neurovascularsim.server.app:create_app", factory=True, host=args.host, port=args.port)
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
