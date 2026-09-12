#!/usr/bin/env python3

import argparse
import csv
from pathlib import Path

GIF_PUBLIC_IDS = {
    "push-up": "push-up",
    "incline-push-up": "incline-push-up",
    "bodyweight-squat": "jump-squat",
    "walking-lunge": "walking-lunge",
    "step-up": "outside-leg-kick-push-up",
    "glute-bridge": "glute-bridge-march",
    "standing-calf-raise": "bodyweight-standing-calf-raise",
    "pull-up": "pull-up",
    "inverted-row": "inverted-row",
    "bench-dip": "three-bench-dip",
    "plank": "power-point-plank",
    "side-plank": "push-up-to-side-plank",
    "dead-bug": "dead-bug",
    "bird-dog": "side-bridge-v-2",
    "bicycle-crunch": "air-bike",
    "crunch": "frog-crunch",
    "reverse-crunch": "reverse-crunch",
    "lying-leg-raise": "lying-leg-hip-raise",
    "superman": "superman-push-up",
    "mountain-climber": "mountain-climber",
    "burpee": "burpee",
    "jumping-jack": "jack-burpee",
    "high-knees": "walking-high-knees-lunge",
    "jump-squat": "jump-squat-v-2",
    "jump-rope": "jump-rope",
    "wall-sit": "march-sit-wall",
    "child-s-pose": "chin-up",
    "cat-cow-stretch": "back-pec-stretch",
    "kneeling-hip-flexor-stretch": "runners-stretch",
    "90-90-hamstring-stretch": "hamstring-stretch",
    "quadriceps-stretch": "all-fours-squad-stretch",
    "calf-stretch": "seated-calf-stretch-male",
    "chest-stretch": "dynamic-chest-stretch-male",
    "shoulder-stretch": "chest-and-front-of-shoulder-stretch",
    "figure-four-glute-stretch": "seated-glute-stretch",
    "butterfly-stretch": "butterfly-yoga-pose",
    "dumbbell-bench-press": "dumbbell-bench-press",
    "incline-dumbbell-press": "dumbbell-incline-bench-press",
    "dumbbell-fly": "dumbbell-fly",
    "one-arm-dumbbell-row": "dumbbell-one-arm-bent-over-row",
    "dumbbell-pullover": "dumbbell-pullover",
    "dumbbell-shoulder-press": "dumbbell-seated-shoulder-press",
    "dumbbell-lateral-raise": "dumbbell-lateral-raise",
    "dumbbell-front-raise": "dumbbell-front-raise",
    "dumbbell-reverse-fly": "dumbbell-reverse-fly",
    "dumbbell-biceps-curl": "dumbbell-biceps-curl",
    "hammer-curl": "dumbbell-hammer-curl",
    "dumbbell-triceps-extension": "dumbbell-one-arm-triceps-extension-on-bench",
    "dumbbell-lunge": "dumbbell-lunge",
    "dumbbell-romanian-deadlift": "dumbbell-romanian-deadlift",
    "bulgarian-split-squat": "dumbbell-step-up-split-squat",
    "dumbbell-shrug": "dumbbell-shrug",
    "farmer-s-walk": "farmers-walk",
    "dumbbell-side-bend": "dumbbell-side-bend",
    "dumbbell-wrist-curl": "dumbbell-reverse-wrist-curl",
    "dumbbell-step-up": "dumbbell-step-up",
    "barbell-bench-press": "barbell-bench-press",
    "barbell-overhead-press": "barbell-seated-overhead-press",
    "barbell-bent-over-row": "barbell-bent-over-row",
    "barbell-back-squat": "barbell-full-squat",
    "conventional-deadlift": "barbell-deadlift",
    "romanian-deadlift": "barbell-romanian-deadlift",
    "barbell-hip-thrust": "barbell-step-up",
    "barbell-lunge": "barbell-lunge",
    "barbell-biceps-curl": "barbell-curl",
    "barbell-calf-raise": "barbell-standing-calf-raise",
    "lat-pulldown": "cable-pulldown",
    "seated-cable-row": "cable-seated-row",
    "cable-wood-chop": "cable-twist",
    "triceps-pushdown": "cable-pushdown",
    "cable-biceps-curl": "cable-curl",
    "face-pull": "cable-shoulder-press",
    "straight-arm-pulldown": "cable-straight-arm-pulldown",
    "cable-lateral-raise": "cable-lateral-raise",
    "cable-crunch": "cable-side-crunch",
    "leg-press": "smith-leg-press",
    "leg-extension": "lever-leg-extension",
    "lying-leg-curl": "lever-lying-leg-curl",
    "machine-chest-press": "lever-chest-press",
    "machine-shoulder-press": "lever-shoulder-press",
    "assisted-pull-up": "assisted-pull-up",
    "ab-crunch-machine": "lever-seated-crunch",
    "hip-abduction-machine": "lever-seated-hip-abduction",
    "hip-adduction-machine": "lever-seated-hip-adduction",
    "cable-glute-kickback": "cable-kickback",
    "seated-calf-raise": "lever-seated-calf-raise",
    "back-extension": "lever-back-extension",
    "kettlebell-swing": "kettlebell-swing",
    "goblet-squat": "kettlebell-goblet-squat",
    "kettlebell-deadlift": "kettlebell-hang-clean",
    "kettlebell-overhead-press": "kettlebell-two-arm-military-press",
    "band-pull-apart": "band-shoulder-press",
    "resistance-band-row": "resistance-band-seated-straight-back-row",
    "resistance-band-chest-press": "resistance-band-seated-chest-press",
    "resistance-band-biceps-curl": "resistance-band-seated-biceps-curl",
    "treadmill-running": "walking-on-stepmill",
    "stationary-bike": "stationary-bike-walk",
    "elliptical-trainer": "walk-elliptical-cross-trainer",
    "stationary-rowing": "reverse-grip-machine-lat-pulldown",
    "stair-climber": "ski-ergometer",
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv")
    parser.add_argument("output_csv", nargs="?", default="spotter_exercises_cloudinary.csv")
    parser.add_argument("--prefix", default="")
    args = parser.parse_args()

    src = Path(args.input_csv)
    dst = Path(args.output_csv)
    if not src.exists():
        raise SystemExit(f"Input file not found: {src}")

    with src.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        if "slug" not in fieldnames:
            raise SystemExit('CSV must contain a "slug" column.')
        if "gifPublicId" not in fieldnames:
            fieldnames.append("gifPublicId")
        rows = list(reader)

    prefix = args.prefix.strip("/")
    missing = []
    for row in rows:
        slug = (row.get("slug") or "").strip()
        public_id = GIF_PUBLIC_IDS.get(slug)
        if not public_id:
            missing.append(slug)
            continue
        row["gifPublicId"] = f"{prefix}/{public_id}" if prefix else public_id

    if missing:
        print("Missing mappings:")
        for slug in missing:
            print(" -", slug)
        raise SystemExit("No output written.")

    with dst.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Updated {len(rows)} rows")
    print(f"Output: {dst.resolve()}")
    print("Example: treadmill-running -> walking-on-stepmill")

if __name__ == "__main__":
    main()
