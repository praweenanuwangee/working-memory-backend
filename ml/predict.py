from ultralytics import YOLO
import sys
import json
import os

MODEL_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "best (3).pt"
)

model = YOLO(MODEL_PATH)

VALID_CLASSES = {
    "circle",
    "square",
    "triangle"
}

image_path = sys.argv[1]

# Test-time augmentation makes inference more tolerant of the uneven scale,
# rotation and stroke shape common in drawings made by young children on a
# mobile screen. Keep the same 40% acceptance floor; augmentation only makes
# the model evaluate useful transformed views of the submitted image.
results = model(
    image_path,
    imgsz=640,
    conf=0.40,
    augment=True,
    verbose=False,
)

predictions = []

for result in results:
    if result.boxes is None:
        continue

    for box in result.boxes:
        class_id = int(box.cls[0])
        confidence = float(box.conf[0])

        class_name = model.names[class_id]

        if class_name not in VALID_CLASSES:
            continue

        predictions.append({
            "shape": class_name,
            "confidence": confidence
        })

# A detector can return several overlapping candidates. The frontend needs the
# strongest valid shape, not whichever box happens to appear first.
predictions.sort(key=lambda prediction: prediction["confidence"], reverse=True)

print(json.dumps(predictions[:1]))
