"""Face detection and recognition with OpenCV's YuNet and SFace ONNX models.

Small enough for a 512 MB instance. Photos are only held in memory for the request.
"""
import base64
import binascii
import os
import threading
from pathlib import Path

import cv2
import numpy as np

MODELS = Path(os.getenv("MODEL_DIR", Path(__file__).parent / "models"))
MAX_SIDE = 640
MIN_FACE_PX = 60
DETECTION_SCORE = 0.8
# Cosine similarity above which two faces count as the same person. See tests/evaluate_threshold.py.
MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.42"))
# The best candidate must beat the runner-up by this much, otherwise the match is ambiguous.
MATCH_MARGIN = 0.05

cv2.setNumThreads(1)
_detector = cv2.FaceDetectorYN.create(str(MODELS / "face_detection_yunet_2023mar.onnx"), "", (320, 320), DETECTION_SCORE)
_recognizer = cv2.FaceRecognizerSF.create(str(MODELS / "face_recognition_sface_2021dec.onnx"), "")
# ponytail: the OpenCV models hold per-call state, so inference is serialized. One lock is fine for
# a single small instance; run more processes if classes ever need parallel recognition.
_lock = threading.Lock()


class BadImage(ValueError):
    pass


def decode_image(data_url):
    """Decode a base64 or data-URL image into a BGR array no larger than MAX_SIDE."""
    if not isinstance(data_url, str) or not data_url:
        raise BadImage("Image is missing")
    payload = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise BadImage("Image is not valid base64") from exc
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise BadImage("Image could not be read")
    height, width = img.shape[:2]
    scale = MAX_SIDE / max(height, width)
    if scale < 1:
        img = cv2.resize(img, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    return img


def detect(img):
    """Return face rows large enough to recognise, biggest first."""
    with _lock:
        _detector.setInputSize((img.shape[1], img.shape[0]))
        _, rows = _detector.detect(img)
    if rows is None:
        return []
    faces = [row for row in rows if min(row[2], row[3]) >= MIN_FACE_PX]
    return sorted(faces, key=lambda row: row[2] * row[3], reverse=True)


def embed(img, face):
    """Return the unit-length embedding of one detected face."""
    with _lock:
        aligned = _recognizer.alignCrop(img, face)
        feature = _recognizer.feature(aligned).flatten()
    return feature / np.linalg.norm(feature)


def box(face):
    return [int(max(0, v)) for v in face[:4]]


def centroid(embeddings):
    mean = np.mean(embeddings, axis=0)
    return mean / np.linalg.norm(mean)


def similarity(a, b):
    return float(np.dot(a, b))


def identify(embedding, candidates):
    """Pick the best (id, stored_embedding) candidate.

    Returns (id or None, best similarity). None means below threshold, or too close to a second person.
    """
    if not candidates:
        return None, 0.0
    ids = [c[0] for c in candidates]
    scores = np.array([c[1] for c in candidates], dtype=np.float32) @ embedding
    order = np.argsort(scores)[::-1]
    best = float(scores[order[0]])
    runner_up = float(scores[order[1]]) if len(order) > 1 else -1.0
    if best < MATCH_THRESHOLD or best - runner_up < MATCH_MARGIN:
        return None, best
    return ids[order[0]], best
