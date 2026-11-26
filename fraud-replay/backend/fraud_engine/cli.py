"""python -m fraud_engine.cli --input data.csv --output result.json"""
import argparse
import json
import sys
from pathlib import Path

from . import analyze_csv


def main():
    parser = argparse.ArgumentParser(description="Fraud Replay: анализ синтетических банковских переводов")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        result = analyze_csv(args.input)
        Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    except (ValueError, OSError) as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
