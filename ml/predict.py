
from fastapi import FastAPI, UploadFile, File, HTTPException
from ultralytics import YOLO
from pathlib import Path
from PIL import Image
import io

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "best (3).pt"

model = YOLO(str(MODEL_PATH))

VALID_CLASSES = {"circle", "square", "triangle"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict-shape")
async def predict_shape(image: UploadFile = File(...)):
    if image.content_type not in [
        "image/jpeg",
        "image/png",
        "image/webp"
    ]:
        raise HTTPException(
            status_code=400,
            detail="Invalid image format"
        )

    image_bytes = await image.read()

    if len(image_bytes) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Image too large"
        )

    try:
        image_data = Image.open(
            io.BytesIO(image_bytes)
        ).convert("RGB")

        results = model(
            image_data,
            imgsz=640,
            conf=0.40,
            augment=True,
            verbose=False
        )

        predictions = []

        for result in results:
            if result.boxes is None:
                continue

            for box in result.boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                class_name = model.names[class_id]

                if class_name in VALID_CLASSES:
                    predictions.append({
                        "shape": class_name,
                        "confidence": confidence
                    })

        predictions.sort(
            key=lambda item: item["confidence"],
            reverse=True
        )

        return predictions[:1]

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Shape prediction failed"
        )
