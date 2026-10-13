"""CLI inference: stdout is one JSON array; diagnostics go to stderr."""
import contextlib
import json
import os
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parent / "best (3).pt"
VALID_CLASSES = {"circle", "square", "triangle"}
os.environ['YOLO_AUTOINSTALL'] = 'false'
os.environ.setdefault('YOLO_CONFIG_DIR', str(Path(tempfile.gettempdir()) / 'working-memory-yolo'))
Path(os.environ['YOLO_CONFIG_DIR']).mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def load_model():
    from ultralytics import YOLO
    return YOLO(str(MODEL_PATH))


def predict(image_path):
    from PIL import Image, UnidentifiedImageError

    if not MODEL_PATH.is_file():
        raise FileNotFoundError("Trained model file is missing")
    try:
        with Image.open(image_path) as source:
            image = source.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError("Invalid image data") from error
    model = load_model()
    results = model(image, imgsz=640, conf=0.40, augment=True, verbose=False, device="cpu")
    predictions = []
    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            class_name = model.names[int(box.cls[0])]
            if class_name in VALID_CLASSES:
                predictions.append({"shape": class_name, "confidence": float(box.conf[0])})
    predictions.sort(key=lambda item: item["confidence"], reverse=True)
    return predictions[:1]


def main():
    if len(sys.argv) != 2:
        print("Usage: predict.py IMAGE_PATH", file=sys.stderr)
        return 1
    try:
        with contextlib.redirect_stdout(sys.stderr):
            predictions = predict(sys.argv[1])
        print(json.dumps(predictions, allow_nan=False), flush=True)
        return 0
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    except Exception as error:
        print(f"Prediction failed: {type(error).__name__}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
