"""Development-only export; PyTorch and ONNX are not deployment dependencies."""
import hashlib
import json
import os
from pathlib import Path

os.environ['YOLO_AUTOINSTALL'] = 'false'
import onnx
import torch
from ultralytics import YOLO

root = Path(__file__).resolve().parents[1]
checkpoint = root / 'ml' / 'best (3).pt'
output = root / 'ml' / 'shape.onnx'
model = YOLO(str(checkpoint)).model.float().eval().fuse()
head = model.model[-1]
assert head.__class__.__name__ == 'Detect' and not getattr(model, 'end2end', False)
head.export = True
head.dynamic = True
head.format = 'onnx'
with torch.inference_mode():
    torch.onnx.export(model, torch.zeros(1, 3, 640, 640), str(output),
        input_names=['images'], output_names=['predictions'], opset_version=17,
        dynamic_axes={'images': {2: 'height', 3: 'width'}, 'predictions': {2: 'anchors'}},
        dynamo=False)
graph = onnx.load(str(output))
onnx.helper.set_model_props(graph, {
    'names': json.dumps(model.names), 'stride': str(int(model.stride.max())),
    'layers': str(head.nl), 'checkpoint_sha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
})
onnx.checker.check_model(graph)
onnx.save(graph, str(output))
print(f'Exported {output}: {output.stat().st_size:,} bytes')
