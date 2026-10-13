import http.client
import json
import os
import tempfile
import threading
import unittest
from http.server import HTTPServer
from pathlib import Path
from unittest.mock import patch

from api.predict_shape import handler, confidence_level


class PythonFunctionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('127.0.0.1', 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, body=None, origin='https://localhost:5173', content_type=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=90)
        headers = {'Origin': origin}
        if content_type:
            headers['Content-Type'] = content_type
        connection.request(method, '/api/working-memory/predict-shape', body, headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def upload(self, image, field='image', mime='image/jpeg'):
        body = (f'--test-boundary\r\nContent-Disposition: form-data; name="{field}"; filename="shape.jpg"\r\nContent-Type: {mime}\r\n\r\n'.encode()
                + image + b'\r\n--test-boundary--\r\n')
        return self.request('POST', body, content_type='multipart/form-data; boundary=test-boundary')

    def test_cors(self):
        for origin in ['http://localhost:5173', 'https://localhost:5173']:
            status, headers, _ = self.request('OPTIONS', origin=origin)
            self.assertEqual(status, 204)
            self.assertEqual(headers['Access-Control-Allow-Origin'], origin)
        with patch.dict(os.environ, {'CLIENT_URLS': 'https://frontend.example'}):
            self.assertEqual(self.request('OPTIONS', origin='https://frontend.example')[0], 204)
        status, headers, _ = self.request('OPTIONS', origin='https://untrusted.example')
        self.assertEqual(status, 403)
        self.assertNotIn('Access-Control-Allow-Origin', headers)

    def test_thresholds(self):
        for confidence, expected in [(0.39, 'Not Detected'), (0.4, 'Low'), (0.55, 'Medium'), (0.7, 'Good'), (0.8, 'Very Good')]:
            self.assertEqual(confidence_level(confidence), expected)

    def test_upload_and_cleanup(self):
        before = set(Path(tempfile.gettempdir()).glob('working-memory-*.image'))
        with patch('api.predict_shape.predict', return_value=[{'shape': 'circle', 'confidence': 0.9}]):
            status, headers, body = self.upload(b'image')
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)['data']['confidenceLevel'], 'Very Good')
            self.assertEqual(headers['Access-Control-Allow-Origin'], 'https://localhost:5173')
        with patch('api.predict_shape.predict', side_effect=TimeoutError):
            self.assertEqual(self.upload(b'image')[0], 504)
        self.assertEqual(self.upload(b'image', field='wrong')[0], 400)
        self.assertEqual(self.upload(b'image', mime='text/plain')[0], 400)
        self.assertEqual(self.upload(b'x' * (4 * 1024 * 1024 + 1))[0], 413)
        self.assertEqual(set(Path(tempfile.gettempdir()).glob('working-memory-*.image')), before)

    @unittest.skipUnless(os.getenv('RUN_ML_TESTS') == '1', 'Set RUN_ML_TESTS=1 for actual model inference')
    def test_actual_model(self):
        status, _, body = self.upload(Path('ml/test-circle.jpeg').read_bytes())
        self.assertEqual(status, 200, body)
        self.assertEqual(json.loads(body)['data']['shape'], 'circle')


if __name__ == '__main__':
    unittest.main()
