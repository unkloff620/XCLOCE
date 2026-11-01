import numpy as np, onnxruntime as ort, sys
from PIL import Image
sess = ort.InferenceSession(__import__('os').environ.get('SR_MODEL', '/tmp/t/sr/anime.onnx'), providers=['CPUExecutionProvider'])
def sr(rgb):  # HxWx3 uint8 → 4x
    x = (rgb.astype(np.float32) / 255).transpose(2, 0, 1)[None]
    y = sess.run(None, {'input': x})[0][0]
    return (np.clip(y.transpose(1, 2, 0), 0, 1) * 255 + 0.5).astype(np.uint8)
if __name__ == '__main__':
    import time; t = time.time()
    im = np.array(Image.open(sys.argv[1]).convert('RGB'))
    Image.fromarray(sr(im)).save(sys.argv[2]); print('done', time.time() - t)
