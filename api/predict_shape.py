"""Vercel Python Function; also runnable locally with Python's HTTPServer."""
import contextlib
import json
import logging
import os
import signal
import sys
import tempfile
import threading
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.predict import predict

MAX_IMAGE = 4 * 1024 * 1024
MAX_BODY = MAX_IMAGE + 128 * 1024
lock = threading.Lock()


def confidence_level(confidence):
    for threshold, label in [(0.40, 'Not Detected'), (0.55, 'Low'), (0.70, 'Medium'), (0.80, 'Good')]:
        if confidence < threshold:
            return label
    return 'Very Good'


class handler(BaseHTTPRequestHandler):
    def origins(self):
        configured = os.getenv('CLIENT_URLS') or os.getenv('CLIENT_URL', '')
        return {'http://localhost:5173', 'https://localhost:5173'} | {
            origin.strip().rstrip('/') for origin in configured.split(',') if origin.strip()
        }

    def reply(self, status, body=None):
        encoded = json.dumps(body, allow_nan=False).encode() if body is not None else b''
        self.send_response(status)
        origin = self.headers.get('Origin')
        self.send_header('Vary', 'Origin')
        if origin in self.origins():
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id')
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def allowed(self):
        origin = self.headers.get('Origin')
        if origin and origin not in self.origins():
            self.reply(403, {'success': False, 'message': 'Not allowed by CORS'})
            return False
        return True

    def do_OPTIONS(self):
        if self.allowed():
            self.reply(204)

    def do_POST(self):
        if not self.allowed():
            return
        image_path = None
        acquired = False
        previous_handler = None
        alarm_set = False
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0:
                raise ValueError('Image file is required')
            if length > MAX_BODY:
                self.reply(413, {'success': False, 'message': 'Image must be no larger than 4 MB'})
                return
            content_type = self.headers.get('Content-Type', '')
            if '\r' in content_type or '\n' in content_type:
                raise ValueError('Invalid multipart upload')
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError('Incomplete image upload')
            message = BytesParser(policy=default).parsebytes(
                f'Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n'.encode() + body)
            if message.get_content_type() != 'multipart/form-data' or not message.is_multipart() or message.defects:
                raise ValueError('Invalid multipart upload')
            files = [part for part in message.iter_parts() if part.get_filename() is not None]
            if len(files) != 1 or files[0].get_param('name', header='content-disposition') != 'image':
                raise ValueError('One image file is required in field image')
            if files[0].get_content_type() not in {'image/jpeg', 'image/png', 'image/webp'}:
                raise ValueError('Only JPG, PNG and WEBP images are allowed')
            image = files[0].get_payload(decode=True)
            if not image:
                raise ValueError('Image file is required')
            if len(image) > MAX_IMAGE:
                self.reply(413, {'success': False, 'message': 'Image must be no larger than 4 MB'})
                return
            timeout = int(os.getenv('PREDICTION_TIMEOUT_MS', '60000')) / 1000
            if not 0 < timeout <= 110:
                raise RuntimeError('Invalid prediction timeout configuration')
            acquired = lock.acquire(blocking=False)
            if not acquired:
                self.reply(503, {'success': False, 'message': 'Shape prediction is busy; please try again'})
                return
            with tempfile.NamedTemporaryFile(prefix='working-memory-', suffix='.image', delete=False) as file:
                image_path = file.name
                file.write(image)
            # Linux main-thread alarm gives a safe JSON timeout when possible.
            # Native Torch calls may delay delivery; Vercel's maxDuration is the hard limit.
            if hasattr(signal, 'SIGALRM') and threading.current_thread() is threading.main_thread():
                def expired(signum, frame):
                    raise TimeoutError()
                previous_handler = signal.signal(signal.SIGALRM, expired)
                signal.setitimer(signal.ITIMER_REAL, timeout)
                alarm_set = True
            with contextlib.redirect_stdout(sys.stderr):
                predictions = predict(image_path)
            prediction = predictions[0] if predictions else None
            data = {'shape': None, 'confidence': 0, 'confidenceLevel': 'Not Detected'}
            if prediction:
                data = {**prediction, 'confidenceLevel': confidence_level(prediction['confidence'])}
            self.reply(200, {'success': True, 'data': data})
        except TimeoutError:
            self.reply(504, {'success': False, 'message': 'Shape prediction timed out'})
        except ValueError:
            self.reply(400, {'success': False, 'message': 'Invalid image or multipart upload'})
        except Exception:
            logging.exception('Shape prediction failed')
            self.reply(500, {'success': False, 'message': 'Shape prediction failed'})
        finally:
            if alarm_set:
                signal.setitimer(signal.ITIMER_REAL, 0)
                signal.signal(signal.SIGALRM, previous_handler)
            if image_path:
                try:
                    Path(image_path).unlink(missing_ok=True)
                except OSError:
                    logging.exception('Temporary image cleanup failed')
            if acquired:
                lock.release()

    def do_GET(self):
        self.reply(405, {'success': False, 'message': 'Use POST with multipart field image'})


if __name__ == '__main__':
    from http.server import HTTPServer
    HTTPServer(('127.0.0.1', 8000), handler).serve_forever()
