import zipfile, pickle, numpy as np
def load_pth(path):
    z = zipfile.ZipFile(path); prefix = z.namelist()[0].split('/')[0]
    class Storage:
        def __init__(self, key, dtype): self.key, self.dtype = key, dtype
    def rebuild(storage, offset, size, stride, *a):
        raw = np.frombuffer(z.read(f'{prefix}/data/{storage.key}'), dtype=storage.dtype)
        n = int(np.prod(size)) if size else 1
        arr = np.lib.stride_tricks.as_strided(raw[offset:], shape=tuple(size), strides=tuple(s * raw.itemsize for s in stride)) if size else raw[offset:offset+1].reshape(())
        return np.array(arr)
    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if name == '_rebuild_tensor_v2': return rebuild
            if name == 'FloatStorage': return np.float32
            if name == 'HalfStorage': return np.float16
            if mod == 'collections' and name == 'OrderedDict':
                import collections; return collections.OrderedDict
            if name == '_rebuild_parameter': return lambda d, *a: d
            return super().find_class(mod, name)
        def persistent_load(self, pid):
            _, cls, key, loc, numel = pid
            return Storage(key, cls)
    return U(z.open(f'{prefix}/data.pkl')).load()
if __name__ == '__main__':
    d = load_pth('/tmp/t/sr/anime.pth'); print(d.keys())
    sd = d.get('params_ema', d)
    ks = list(sd.keys()); print(len(ks), ks[:8], ks[-8:]); print(sd[ks[0]].shape, sd[ks[0]].dtype)
