import numpy as np, onnx
from onnx import helper, TensorProto, numpy_helper
import sys; sys.path.insert(0, '/tmp/t/sr')
from load import load_pth
sd = load_pth('/tmp/t/sr/anime.pth')['params_ema']
nb = 1 + max(int(k.split('.')[1]) for k in sd if k.startswith('body.'))
nodes, inits = [], []
for k, v in sd.items(): inits.append(numpy_helper.from_array(v.astype(np.float32), k))
cnt = [0]
def nm(p): cnt[0] += 1; return f'{p}_{cnt[0]}'
def conv(x, name):
    o = nm(name); nodes.append(helper.make_node('Conv', [x, name + '.weight', name + '.bias'], [o], pads=[1, 1, 1, 1], kernel_shape=[3, 3])); return o
def lrelu(x):
    o = nm('lr'); nodes.append(helper.make_node('LeakyRelu', [x], [o], alpha=0.2)); return o
def cat(xs):
    o = nm('cat'); nodes.append(helper.make_node('Concat', xs, [o], axis=1)); return o
def add(a, b):
    o = nm('add'); nodes.append(helper.make_node('Add', [a, b], [o])); return o
inits.append(numpy_helper.from_array(np.array(0.2, np.float32), 'c02'))
def mul02(a):
    o = nm('mul'); nodes.append(helper.make_node('Mul', [a, 'c02'], [o])); return o
def rdb(x, p):
    x1 = lrelu(conv(x, p + '.conv1')); x2 = lrelu(conv(cat([x, x1]), p + '.conv2')); x3 = lrelu(conv(cat([x, x1, x2]), p + '.conv3'))
    x4 = lrelu(conv(cat([x, x1, x2, x3]), p + '.conv4')); x5 = conv(cat([x, x1, x2, x3, x4]), p + '.conv5')
    return add(mul02(x5), x)
inits.append(numpy_helper.from_array(np.array([1, 1, 2, 2], np.float32), 'scales'))
def up(x):
    o = nm('up'); nodes.append(helper.make_node('Resize', [x, '', 'scales'], [o], mode='nearest')); return o
feat = conv('input', 'conv_first')
b = feat
for i in range(nb):
    p = f'body.{i}'
    o = rdb(rdb(rdb(b, p + '.rdb1'), p + '.rdb2'), p + '.rdb3')
    b = add(mul02(o), b)
feat = add(feat, conv(b, 'conv_body'))
feat = lrelu(conv(up(feat), 'conv_up1'))
feat = lrelu(conv(up(feat), 'conv_up2'))
out = conv(lrelu(conv(feat, 'conv_hr')), 'conv_last')
nodes.append(helper.make_node('Identity', [out], ['output']))
g = helper.make_graph(nodes, 'rrdb', [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, None, None])],
                      [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, None, None])], inits)
m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 13)]); m.ir_version = 8
onnx.save(m, '/tmp/t/sr/anime.onnx'); print('ok', nb)
