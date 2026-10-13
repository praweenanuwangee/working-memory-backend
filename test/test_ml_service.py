import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from ml.app import app


class MLServiceTest(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def upload(self, image=b'image', mime='image/jpeg', field='image'):
        return self.client.post('/predict-shape', data={field: (io.BytesIO(image), 'shape.jpg', mime)})

    def test_upload_errors_and_cleanup(self):
        before = set(Path(tempfile.gettempdir()).glob('working-memory-*.image'))
        with patch('ml.app.predict', return_value=[{'shape': 'circle', 'confidence': 0.9}]):
            response = self.upload()
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, [{'shape': 'circle', 'confidence': 0.9}])
        with patch('ml.app.predict', side_effect=ValueError):
            self.assertEqual(self.upload().status_code, 400)
        self.assertEqual(self.upload(field='wrong').status_code, 400)
        self.assertEqual(self.upload(mime='text/plain').status_code, 400)
        self.assertEqual(self.upload(b'x' * (4 * 1024 * 1024 + 1)).status_code, 413)
        self.assertEqual(set(Path(tempfile.gettempdir()).glob('working-memory-*.image')), before)

    @unittest.skipUnless(os.getenv('RUN_ML_TESTS') == '1', 'Set RUN_ML_TESTS=1 for actual inference')
    def test_actual_model(self):
        response = self.upload(Path('ml/test-circle.jpeg').read_bytes())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.json[0]['shape'], 'circle')
        self.assertGreaterEqual(response.json[0]['confidence'], 0.4)


if __name__ == '__main__':
    unittest.main()
