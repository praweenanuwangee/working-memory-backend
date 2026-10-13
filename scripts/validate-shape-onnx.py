"""Compare exported raw/TTA/NMS predictions to the original checkpoint on image variants."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
import cv2
import numpy as np
import torch
from PIL import Image
from ml.predict import load_model
from ml.onnx_predict import load_model as load_onnx, preprocess, scale_tensor, raw_predictions, decode
from ultralytics.utils.torch_utils import scale_img
from ultralytics.utils.nms import non_max_suppression

original = load_model()
sample = np.asarray(Image.open(root / 'ml/test-circle.jpeg').convert('RGB'))
images = [sample, sample[:, ::-1].copy(), cv2.resize(sample, (640, 640)),
    cv2.resize(sample, (700, 300)), cv2.resize(sample, (300, 700)),
    np.full((320, 480, 3), 255, dtype=np.uint8)]
names = load_onnx()[1]
assert names == original.names
records = []
for image in images:
    results = original.predict(Image.fromarray(image), imgsz=640, conf=0.40, augment=True,
        verbose=False, device='cpu')[0]
    tensor = preprocess(image, 32)
    reference_tensor = original.predictor.preprocess([image[:, :, ::-1].copy()])
    np.testing.assert_array_equal(tensor, reference_tensor.numpy())
    for scale, flip in [(1, False), (0.83, True), (0.67, False)]:
        reference = scale_img(reference_tensor.flip(3) if flip else reference_tensor, scale, gs=32)
        np.testing.assert_allclose(scale_tensor(tensor, scale, 32, flip), reference.numpy(), atol=6e-5, rtol=0)
    with torch.inference_mode():
        raw_reference = original.model(reference_tensor, augment=True)[0]
    raw_onnx = raw_predictions(tensor)
    np.testing.assert_allclose(raw_onnx[:, 4:], raw_reference.numpy()[:, 4:], atol=2e-4, rtol=0)
    np.testing.assert_allclose(raw_onnx[:, :4], raw_reference.numpy()[:, :4], atol=0.08, rtol=1e-4)
    detections = decode(raw_onnx)
    reference_detections = non_max_suppression(raw_reference.clone(), conf_thres=0.40, iou_thres=0.7)[0].numpy()
    assert len(detections) == len(reference_detections), (len(detections), len(reference_detections))
    for (box, confidence, class_id), expected in zip(detections, reference_detections):
        np.testing.assert_allclose(box, expected[:4], atol=0.08, rtol=1e-4)
        assert abs(confidence - expected[4]) < 2e-4
        assert class_id == int(expected[5])
    valid = [(names[class_id], confidence) for _, confidence, class_id in detections
        if names[class_id] in {'circle', 'square', 'triangle'}]
    reference_valid = [(original.names[int(box.cls)], float(box.conf)) for box in results.boxes
        if original.names[int(box.cls)] in {'circle', 'square', 'triangle'}]
    assert bool(valid) == bool(reference_valid)
    if valid:
        assert valid[0][0] == reference_valid[0][0]
        assert abs(valid[0][1] - reference_valid[0][1]) < 2e-4
    records.append({'image_size': list(image.shape[:2]), 'strongest': valid[:1],
        'max_score_error': float(np.abs(raw_onnx[:, 4:] - raw_reference.numpy()[:, 4:]).max())})
print(json.dumps({'class_mapping': names, 'cases': records}, indent=2))
