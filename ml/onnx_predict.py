"""YOLOv8 raw ONNX decoding with the checkpoint's original three-pass augmentation."""
import json
import math
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, UnidentifiedImageError

VALID_CLASSES = {'circle', 'square', 'triangle'}
MODEL_PATH = Path(__file__).with_name('shape.onnx')


@lru_cache(maxsize=1)
def load_model():
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(MODEL_PATH), sess_options=options, providers=['CPUExecutionProvider'])
    metadata = session.get_modelmeta().custom_metadata_map
    names = {int(key): value for key, value in json.loads(metadata['names']).items()}
    if not VALID_CLASSES <= set(names.values()):
        raise RuntimeError('Model class mapping is incompatible')
    return session, names, int(metadata['stride']), int(metadata['layers'])


def preprocess(image, stride):
    h, w = image.shape[:2]
    ratio = min(640 / h, 640 / w)
    size = (round(w * ratio), round(h * ratio))
    dw, dh = (640 - size[0]) % stride / 2, (640 - size[1]) % stride / 2
    resized = cv2.resize(image, size, interpolation=cv2.INTER_LINEAR) if (w, h) != size else image
    padded = cv2.copyMakeBorder(resized, round(dh - 0.1), round(dh + 0.1),
        round(dw - 0.1), round(dw + 0.1), cv2.BORDER_CONSTANT, value=(114, 114, 114))
    return np.ascontiguousarray(padded.transpose(2, 0, 1)[None], dtype=np.float32) / 255


def scale_tensor(tensor, scale, stride, flip=False):
    if flip:
        tensor = tensor[:, :, :, ::-1]
    if scale == 1:
        return np.ascontiguousarray(tensor)
    h, w = tensor.shape[2:]
    oh, ow = int(h * scale), int(w * scale)
    # Match torch interpolate(size=..., mode=bilinear, align_corners=False).
    yy = np.maximum((np.arange(oh, dtype=np.float32) + 0.5) * (h / oh) - 0.5, 0)
    xx = np.maximum((np.arange(ow, dtype=np.float32) + 0.5) * (w / ow) - 0.5, 0)
    y0, x0 = yy.astype(int), xx.astype(int)
    y1, x1 = np.minimum(y0 + 1, h - 1), np.minimum(x0 + 1, w - 1)
    wy, wx = (yy - y0).astype(np.float32), (xx - x0).astype(np.float32)
    rows = tensor[:, :, y0, :] * (1 - wy)[None, None, :, None] + tensor[:, :, y1, :] * wy[None, None, :, None]
    resized = rows[:, :, :, x0] * (1 - wx)[None, None, None, :] + rows[:, :, :, x1] * wx[None, None, None, :]
    return np.pad(resized, ((0, 0), (0, 0), (0, math.ceil(h * scale / stride) * stride - oh),
        (0, math.ceil(w * scale / stride) * stride - ow)), constant_values=0.447)


def raw_predictions(tensor):
    session, names, stride, layers = load_model()
    outputs = []
    for scale, flip in [(1, False), (0.83, True), (0.67, False)]:
        output = session.run(None, {'images': scale_tensor(tensor, scale, stride, flip)})[0]
        if output.ndim != 3 or output.shape[1] != 4 + len(names):
            raise RuntimeError('Unsupported ONNX output layout')
        output[:, :4] /= scale
        if flip:
            output[:, 0] = tensor.shape[3] - output[:, 0]
        outputs.append(output)
    grid = sum(4 ** index for index in range(layers))
    outputs[0] = outputs[0][:, :, :-(outputs[0].shape[2] // grid)]
    outputs[-1] = outputs[-1][:, :, (outputs[-1].shape[2] // grid) * 4 ** (layers - 1):]
    return np.concatenate(outputs, axis=2)


def decode(output, confidence=0.40, iou_threshold=0.7):
    candidates = output[0].T
    classes = np.argmax(candidates[:, 4:], axis=1)
    scores = candidates[np.arange(len(candidates)), classes + 4]
    mask = scores > confidence
    candidates, classes, scores = candidates[mask], classes[mask], scores[mask]
    boxes = np.concatenate((candidates[:, :2] - candidates[:, 2:4] / 2,
        candidates[:, :2] + candidates[:, 2:4] / 2), axis=1)
    offset_boxes = boxes + classes[:, None] * 7680
    order = np.argsort(-scores, kind='stable')[:30000]
    area = np.maximum(0, offset_boxes[:, 2:] - offset_boxes[:, :2]).prod(axis=1)
    keep = []
    while order.size and len(keep) < 300:
        index = order[0]
        keep.append(index)
        remaining = order[1:]
        intersection = np.maximum(0, np.minimum(offset_boxes[index, 2:], offset_boxes[remaining, 2:])
            - np.maximum(offset_boxes[index, :2], offset_boxes[remaining, :2])).prod(axis=1)
        iou = intersection / np.maximum(area[index] + area[remaining] - intersection, 1e-12)
        order = remaining[iou <= iou_threshold]
    return [(boxes[i], float(scores[i]), int(classes[i])) for i in keep]


def predict(image_path):
    try:
        with Image.open(image_path) as source:
            image = np.asarray(source.convert('RGB'))
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError('Invalid image data') from error
    _, names, stride, _ = load_model()
    detections = decode(raw_predictions(preprocess(image, stride)))
    valid = [{'shape': names[class_id], 'confidence': score} for _, score, class_id in detections
        if names[class_id] in VALID_CLASSES]
    return sorted(valid, key=lambda item: item['confidence'], reverse=True)[:1]
