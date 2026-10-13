import unittest
import numpy as np
from ml.onnx_predict import decode, load_model, VALID_CLASSES


class ONNXPredictionTest(unittest.TestCase):
    def test_classes_from_exported_checkpoint(self):
        _, names, stride, layers = load_model()
        self.assertEqual(names, {0: 'circle', 1: 'shapes-dataset1', 2: 'square', 3: 'triangle'})
        self.assertEqual(stride, 32)
        self.assertEqual(layers, 3)
        self.assertEqual(VALID_CLASSES, {'circle', 'square', 'triangle'})

    def test_class_aware_nms_and_threshold(self):
        output = np.zeros((1, 8, 5), dtype=np.float32)
        output[0, :4, :] = np.array([[100, 100, 100, 300, 500], [100, 100, 100, 300, 500],
                                     [50, 50, 50, 50, 50], [50, 50, 50, 50, 50]])
        output[0, 4, 0] = 0.9
        output[0, 4, 1] = 0.8  # same class overlap is suppressed
        output[0, 7, 2] = 0.85  # triangle overlapping circle is retained
        output[0, 6, 3] = 0.4  # original Ultralytics uses strict > 0.40
        output[0, 6, 4] = 0.7
        detections = decode(output)
        self.assertEqual([item[2] for item in detections], [0, 3, 2])
        np.testing.assert_allclose(detections[0][0], [75, 75, 125, 125])

    def test_empty(self):
        self.assertEqual(decode(np.zeros((1, 8, 10), dtype=np.float32)), [])


if __name__ == '__main__':
    unittest.main()
