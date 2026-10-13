"""Internal Vercel ML service. Express owns the public API response format."""
import contextlib
import logging
import sys
import tempfile
import threading
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

if __package__:
    from .onnx_predict import predict
else:
    from onnx_predict import predict

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024 + 128 * 1024
lock = threading.Lock()


@app.errorhandler(RequestEntityTooLarge)
def too_large(error):
    return jsonify(success=False, message='Image must be no larger than 4 MB'), 413


@app.post('/predict-shape')
def predict_shape():
    files = list(request.files.items(multi=True))
    if len(files) != 1 or files[0][0] != 'image':
        return jsonify(success=False, message='One image file is required in field image'), 400
    image = files[0][1]
    if image.mimetype not in {'image/jpeg', 'image/png', 'image/webp'}:
        return jsonify(success=False, message='Only JPG, PNG and WEBP images are allowed'), 400
    if not lock.acquire(blocking=False):
        return jsonify(success=False, message='Shape prediction is busy; please try again'), 503
    image_path = None
    try:
        data = image.read(4 * 1024 * 1024 + 1)
        if not data:
            return jsonify(success=False, message='Image file is required'), 400
        if len(data) > 4 * 1024 * 1024:
            return too_large(None)
        with tempfile.NamedTemporaryFile(prefix='working-memory-', suffix='.image', delete=False) as file:
            image_path = file.name
            file.write(data)
        with contextlib.redirect_stdout(sys.stderr):
            predictions = predict(image_path)
        return jsonify(predictions)
    except ValueError:
        return jsonify(success=False, message='Invalid image data'), 400
    except Exception:
        logging.exception('Shape prediction failed')
        return jsonify(success=False, message='Shape prediction failed'), 500
    finally:
        if image_path:
            try:
                Path(image_path).unlink(missing_ok=True)
            except OSError:
                logging.exception('Temporary image cleanup failed')
        lock.release()
