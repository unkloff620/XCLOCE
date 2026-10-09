"""Puppet warp helpers shared by build-hand.py and build-held.py: rigid moving-least-squares (Schaefer et al. 2006)."""
import numpy as np
import cv2


def mls_rigid_inverse(src_pts, dst_pts, w, h, alpha=1.0):
    """for every output pixel v the source pixel f(v): rigid MLS that maps dst pins → src pins"""
    p = np.asarray(dst_pts, np.float64)  # pins where they end up
    q = np.asarray(src_pts, np.float64)  # the same pins in the original image
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    v = np.stack([xs, ys], -1).reshape(-1, 1, 2)
    d2 = ((p[None] - v) ** 2).sum(-1)
    wgt = 1.0 / np.maximum(d2, 1e-6) ** alpha
    ws = wgt.sum(1, keepdims=True)
    ps = (wgt[..., None] * p[None]).sum(1) / ws
    qs = (wgt[..., None] * q[None]).sum(1) / ws
    ph = p[None] - ps[:, None]
    qh = q[None] - qs[:, None]
    vp = v[:, 0] - ps
    perp = lambda a: np.stack([-a[..., 1], a[..., 0]], -1)
    a11 = (ph * vp[:, None]).sum(-1)
    a12 = (ph * -perp(vp)[:, None]).sum(-1)
    pp = -perp(ph)
    a21 = (pp * vp[:, None]).sum(-1)
    a22 = (pp * -perp(vp)[:, None]).sum(-1)
    fx = (wgt * (qh[..., 0] * a11 + qh[..., 1] * a21)).sum(1)
    fy = (wgt * (qh[..., 0] * a12 + qh[..., 1] * a22)).sum(1)
    fr = np.stack([fx, fy], -1)
    norm = np.linalg.norm(fr, axis=-1, keepdims=True)
    f = np.linalg.norm(vp, axis=-1, keepdims=True) * fr / np.maximum(norm, 1e-9) + qs
    return f[:, 0].reshape(h, w).astype(np.float32), f[:, 1].reshape(h, w).astype(np.float32)


def premul(img, up):
    big = cv2.resize(img, (img.shape[1] * up, img.shape[0] * up), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    a = big[:, :, 3:4] / 255.0
    return np.concatenate([big[:, :, :3] * a, big[:, :, 3:4]], -1)


def unpremul(pre, size):
    al = pre[:, :, 3:4]
    rgb = np.where(al > 0.5, pre[:, :, :3] / np.maximum(al / 255.0, 1e-6), 0)
    small = cv2.resize(np.concatenate([rgb, al], -1), size, interpolation=cv2.INTER_AREA)
    return np.clip(small + 0.5, 0, 255).astype(np.uint8)


def warp_all(pre, maps):
    return cv2.remap(pre, maps[0], maps[1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
