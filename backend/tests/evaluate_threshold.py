"""Measure match accuracy on labelled face pairs, to choose FACE_MATCH_THRESHOLD.

Usage: python tests/evaluate_threshold.py <images_dir> <pairs.csv>   (CSV columns: file_x,file_y,Decision)
"""
import csv
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
import faces  # noqa: E402

images, pairs_file = Path(sys.argv[1]), sys.argv[2]
cache = {}


def embedding(name):
    if name not in cache:
        img = cv2.imread(str(images / name))
        found = faces.detect(img) if img is not None else []
        cache[name] = faces.embed(img, found[0]) if found else None
    return cache[name]


same, different, skipped = [], [], 0
with open(pairs_file) as f:
    for row in csv.DictReader(f):
        a, b = embedding(row["file_x"]), embedding(row["file_y"])
        if a is None or b is None:
            skipped += 1
            continue
        (same if row["Decision"] == "Yes" else different).append(faces.similarity(a, b))

same, different = np.array(same), np.array(different)
print(f"same-person pairs: {len(same)}, different-person pairs: {len(different)}, skipped: {skipped}")
print(f"{'threshold':>9} {'false accept':>13} {'false reject':>13}")
for t in np.arange(0.30, 0.61, 0.03):
    print(f"{t:9.2f} {np.mean(different >= t):13.1%} {np.mean(same < t):13.1%}")
print(f"highest different-person score: {different.max():.3f}; lowest same-person score: {same.min():.3f}")
