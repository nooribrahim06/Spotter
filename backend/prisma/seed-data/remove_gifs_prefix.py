#!/usr/bin/env python3

import csv
import sys
from pathlib import Path


def clean_public_id(value: str) -> str:
    value = (value or "").strip()

    # Remove only a leading gifs/ prefix.
    if value.startswith("gifs/"):
        value = value[len("gifs/"):]

    return value


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python remove_gifs_prefix.py input.csv [output.csv]")
        return 1

    input_path = Path(sys.argv[1])
    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) >= 3
        else Path("spotter_exercises_cloudinary_clean.csv")
    )

    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        return 1

    with input_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        if not reader.fieldnames:
            print("CSV has no header.")
            return 1

        if "gifPublicId" not in reader.fieldnames:
            print('CSV must contain a "gifPublicId" column.')
            return 1

        rows = list(reader)
        fieldnames = reader.fieldnames

    changed = 0

    for row in rows:
        before = row.get("gifPublicId", "")
        after = clean_public_id(before)

        if before != after:
            changed += 1

        row["gifPublicId"] = after

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print()
    print("DONE")
    print(f"Rows cleaned: {changed}")
    print(f"Output: {output_path.resolve()}")
    print()
    print("Example:")
    print("  gifs/walking-on-stepmill")
    print("  -> walking-on-stepmill")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
