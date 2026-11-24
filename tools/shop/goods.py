"""The artist's currency goods (tools/shop/source/v3/goods.png): drawn right where they stand on the shelves of the 2000×3000
shop canvas (the bottoms on the boards 584 / 905 / 1220 / 1510 / 1796); their boxes, by name."""
GOODS = {
    "toolbox": (305, 344, 790, 582),   # «Строительный ящик»: later the parts for tokens (the user 2026-11-24)
    "rub-s": (289, 735, 555, 905), "rub-l": (574, 744, 908, 911),
    "gold-l": (264, 1000, 654, 1219), "gold-s": (651, 1000, 947, 1219),
    "tok-s": (1223, 430, 1468, 592), "tok-l": (1471, 424, 1723, 584),
    "tooth-jar": (284, 1555, 509, 1791), "tooth-jar2": (1274, 1559, 1487, 1792), "tooth-spill": (955, 1577, 1253, 1788),
    "tooth-spill2": (933, 687, 1231, 898), "tooth-crate": (816, 345, 1212, 581), "tooth-crate2": (530, 1554, 926, 1790),
    "pap-s": (281, 1294, 548, 1506), "pap-m": (965, 1000, 1232, 1212), "pap-l": (555, 1287, 1002, 1515),
}

def cut(sheet, name):
    """the good alone: its box, only its own pixels (the neighbours' bits off), 6 px of room"""
    import numpy as np
    from scipy import ndimage
    x0, y0, x1, y1 = GOODS[name]
    a = np.array(sheet)[y0 - 6:y1 + 6, x0 - 6:x1 + 6].copy()
    m = a[..., 3] > 20
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=3))
    if n > 1:
        sz = ndimage.sum(m, lab, range(1, n + 1))
        keep = [i + 1 for i, v in enumerate(sz) if v >= 0.08 * sz.max()]
        a[~np.isin(lab, keep)] = 0
    return a
