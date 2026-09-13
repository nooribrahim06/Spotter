#!/usr/bin/env python3

import csv
import json
import sys
from pathlib import Path


# What the Spotter workout UI should allow for each exercise.
#
# Supported values:
#   SETS
#   REPS
#   WEIGHT
#   DURATION
#   DISTANCE
#
# IMPORTANT:
# This describes how the exercise is TRACKED in Spotter,
# not every measurement that could theoretically exist.

TRACKING_METRICS = {
    # Bodyweight / core / mobility
    "push-up": ["SETS", "REPS"],
    "incline-push-up": ["SETS", "REPS"],
    "bodyweight-squat": ["SETS", "REPS"],
    "walking-lunge": ["SETS", "REPS"],
    "step-up": ["SETS", "REPS"],
    "glute-bridge": ["SETS", "REPS"],
    "standing-calf-raise": ["SETS", "REPS"],
    "pull-up": ["SETS", "REPS"],
    "inverted-row": ["SETS", "REPS"],
    "bench-dip": ["SETS", "REPS"],

    "plank": ["SETS", "DURATION"],
    "side-plank": ["SETS", "DURATION"],
    "dead-bug": ["SETS", "REPS"],
    "bird-dog": ["SETS", "REPS"],
    "bicycle-crunch": ["SETS", "REPS"],
    "crunch": ["SETS", "REPS"],
    "reverse-crunch": ["SETS", "REPS"],
    "lying-leg-raise": ["SETS", "REPS"],
    "superman": ["SETS", "REPS"],

    "mountain-climber": ["DURATION", "REPS"],
    "burpee": ["DURATION", "REPS"],
    "jumping-jack": ["DURATION", "REPS"],
    "high-knees": ["DURATION"],
    "jump-squat": ["SETS", "REPS"],
    "jump-rope": ["DURATION", "REPS"],
    "wall-sit": ["SETS", "DURATION"],

    # Mobility: time is the useful MVP metric.
    "child-s-pose": ["DURATION"],
    "cat-cow-stretch": ["DURATION"],
    "kneeling-hip-flexor-stretch": ["DURATION"],
    "90-90-hamstring-stretch": ["DURATION"],
    "quadriceps-stretch": ["DURATION"],
    "calf-stretch": ["DURATION"],
    "chest-stretch": ["DURATION"],
    "shoulder-stretch": ["DURATION"],
    "figure-four-glute-stretch": ["DURATION"],
    "butterfly-stretch": ["DURATION"],

    # Dumbbell
    "dumbbell-bench-press": ["SETS", "REPS", "WEIGHT"],
    "incline-dumbbell-press": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-fly": ["SETS", "REPS", "WEIGHT"],
    "one-arm-dumbbell-row": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-pullover": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-shoulder-press": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-lateral-raise": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-front-raise": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-reverse-fly": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-biceps-curl": ["SETS", "REPS", "WEIGHT"],
    "hammer-curl": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-triceps-extension": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-lunge": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-romanian-deadlift": ["SETS", "REPS", "WEIGHT"],
    "bulgarian-split-squat": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-shrug": ["SETS", "REPS", "WEIGHT"],
    "farmer-s-walk": ["SETS", "WEIGHT", "DURATION", "DISTANCE"],
    "dumbbell-side-bend": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-wrist-curl": ["SETS", "REPS", "WEIGHT"],
    "dumbbell-step-up": ["SETS", "REPS", "WEIGHT"],

    # Barbell
    "barbell-bench-press": ["SETS", "REPS", "WEIGHT"],
    "barbell-overhead-press": ["SETS", "REPS", "WEIGHT"],
    "barbell-bent-over-row": ["SETS", "REPS", "WEIGHT"],
    "barbell-back-squat": ["SETS", "REPS", "WEIGHT"],
    "conventional-deadlift": ["SETS", "REPS", "WEIGHT"],
    "romanian-deadlift": ["SETS", "REPS", "WEIGHT"],
    "barbell-hip-thrust": ["SETS", "REPS", "WEIGHT"],
    "barbell-lunge": ["SETS", "REPS", "WEIGHT"],
    "barbell-biceps-curl": ["SETS", "REPS", "WEIGHT"],
    "barbell-calf-raise": ["SETS", "REPS", "WEIGHT"],

    # Cable / machine
    "lat-pulldown": ["SETS", "REPS", "WEIGHT"],
    "seated-cable-row": ["SETS", "REPS", "WEIGHT"],
    "cable-wood-chop": ["SETS", "REPS", "WEIGHT"],
    "triceps-pushdown": ["SETS", "REPS", "WEIGHT"],
    "cable-biceps-curl": ["SETS", "REPS", "WEIGHT"],
    "face-pull": ["SETS", "REPS", "WEIGHT"],
    "straight-arm-pulldown": ["SETS", "REPS", "WEIGHT"],
    "cable-lateral-raise": ["SETS", "REPS", "WEIGHT"],
    "cable-crunch": ["SETS", "REPS", "WEIGHT"],

    "leg-press": ["SETS", "REPS", "WEIGHT"],
    "leg-extension": ["SETS", "REPS", "WEIGHT"],
    "lying-leg-curl": ["SETS", "REPS", "WEIGHT"],
    "machine-chest-press": ["SETS", "REPS", "WEIGHT"],
    "machine-shoulder-press": ["SETS", "REPS", "WEIGHT"],

    # Assistance weight is not the same thing as external load,
    # so don't overload weightKg for this in the MVP.
    "assisted-pull-up": ["SETS", "REPS"],

    "ab-crunch-machine": ["SETS", "REPS", "WEIGHT"],
    "hip-abduction-machine": ["SETS", "REPS", "WEIGHT"],
    "hip-adduction-machine": ["SETS", "REPS", "WEIGHT"],
    "cable-glute-kickback": ["SETS", "REPS", "WEIGHT"],
    "seated-calf-raise": ["SETS", "REPS", "WEIGHT"],
    "back-extension": ["SETS", "REPS", "WEIGHT"],

    # Kettlebell / resistance band
    "kettlebell-swing": ["SETS", "REPS", "WEIGHT"],
    "goblet-squat": ["SETS", "REPS", "WEIGHT"],
    "kettlebell-deadlift": ["SETS", "REPS", "WEIGHT"],
    "kettlebell-overhead-press": ["SETS", "REPS", "WEIGHT"],

    # Resistance-band load isn't represented well by weightKg,
    # so track reps/sets for the MVP.
    "band-pull-apart": ["SETS", "REPS"],
    "resistance-band-row": ["SETS", "REPS"],
    "resistance-band-chest-press": ["SETS", "REPS"],
    "resistance-band-biceps-curl": ["SETS", "REPS"],

    # Cardio machines
    "treadmill-running": ["DURATION", "DISTANCE"],
    "stationary-bike": ["DURATION", "DISTANCE"],
    "elliptical-trainer": ["DURATION", "DISTANCE"],
    "stationary-rowing": ["DURATION", "DISTANCE"],

    # "Distance" does not make product sense for a stair climber.
    "stair-climber": ["DURATION"],
}


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python add_tracking_metrics.py input.csv [output.csv]")
        return 1

    input_path = Path(sys.argv[1])

    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) >= 3
        else input_path.with_name(f"{input_path.stem}_with_metrics.csv")
    )

    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        return 1

    with input_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        if not reader.fieldnames:
            print("CSV has no header.")
            return 1

        if "slug" not in reader.fieldnames:
            print('CSV must contain a "slug" column.')
            return 1

        rows = list(reader)
        fieldnames = list(reader.fieldnames)

    # Add trackingMetrics before gifPublicId when possible,
    # so the CSV remains easy to read.
    if "trackingMetrics" not in fieldnames:
        if "gifPublicId" in fieldnames:
            index = fieldnames.index("gifPublicId")
            fieldnames.insert(index, "trackingMetrics")
        else:
            fieldnames.append("trackingMetrics")

    missing = []

    for row in rows:
        slug = (row.get("slug") or "").strip()
        metrics = TRACKING_METRICS.get(slug)

        if metrics is None:
            missing.append(slug)
            continue

        # JSON array stored safely inside a CSV cell.
        # Example: ["SETS","REPS","WEIGHT"]
        row["trackingMetrics"] = json.dumps(
            metrics,
            separators=(",", ":"),
        )

    if missing:
        print()
        print("ERROR: These exercise slugs have no tracking configuration:")
        for slug in missing:
            print(f"  - {slug or '<empty slug>'}")

        print()
        print("No output file was written.")
        print("Add them to TRACKING_METRICS first.")
        return 1

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=fieldnames,
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(rows)

    print()
    print("DONE")
    print(f"Rows updated: {len(rows)}")
    print(f"Output: {output_path.resolve()}")
    print()
    print("Examples:")
    print('  jump-rope       -> ["DURATION","REPS"]')
    print('  treadmill-running -> ["DURATION","DISTANCE"]')
    print('  plank           -> ["SETS","DURATION"]')
    print('  barbell-bench-press -> ["SETS","REPS","WEIGHT"]')

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
