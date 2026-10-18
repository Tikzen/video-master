"""Image-space finishing on float32 HxWx3 sRGB frames (0..1).

Order used by Film: scene → motion-blur average → bloom → chroma → overlay (HUD) → flash → vignette → grain.

Taste defaults (references/craft/finish.md):
  bloom   0 on paper/light grounds, 0.3–0.5 on dark graphic scenes, 0.8–1.2 for emissive particles/light
          key="luma" when a saturated ground (e.g. red) must not glow; key="max" for coloured light
  grain   0.015–0.025 (film), 0 for UI-crisp product demos
  vignette 0.15–0.25
  chroma  only on impacts (0.004–0.01, decaying ≤0.4 s), never as a constant look
"""
import cv2
import numpy as np

cv2.setNumThreads(1)

_VIG = {}


def _vig(h, w):
    k = (h, w)
    if k not in _VIG:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (w / 2)) ** 2)
        _VIG[k] = (np.clip((r - 0.45) / 0.9, 0, 1) ** 1.6)[..., None].astype(np.float32)
    return _VIG[k]


LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def bloom(img, amount, thr=0.55, radius=1.0, key="max"):
    h, w = img.shape[:2]
    small = cv2.resize(img, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    lum = (small @ LUMA)[..., None] if key == "luma" else small.max(axis=2, keepdims=True)
    bright = small * np.clip((lum - thr) / (1 - thr + 1e-6), 0, 1)
    b1 = cv2.GaussianBlur(bright, (0, 0), 4 * radius)
    tiny = cv2.resize(bright, (w // 16, h // 16), interpolation=cv2.INTER_AREA)
    b2 = cv2.resize(cv2.GaussianBlur(tiny, (0, 0), 5 * radius), (w // 4, h // 4), interpolation=cv2.INTER_LINEAR)
    b = cv2.resize(b1 * 0.55 + b2 * 0.9, (w, h), interpolation=cv2.INTER_LINEAR)
    return img + b * amount


def chroma(img, k, cx=None, cy=None):
    """Radial chromatic aberration (R scaled up, B down) around (cx, cy)."""
    h, w = img.shape[:2]
    cx = w / 2 if cx is None else cx
    cy = h / 2 if cy is None else cy
    out = img.copy()
    for ch, s in ((0, 1 + k), (2, 1 - k)):
        M = np.float32([[s, 0, cx * (1 - s)], [0, s, cy * (1 - s)]])
        out[:, :, ch] = cv2.warpAffine(img[:, :, ch], M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return out


def flash(img, amount, col=(1.0, 1.0, 1.0)):
    return img + (np.array(col, np.float32) - img) * amount


def vignette(img, amount):
    return img * (1 - amount * _vig(*img.shape[:2]))


def grain(img, seed, amp=0.02, size=2):
    """Monochrome film grain, strongest in mid-tones. Deterministic per frame seed."""
    h, w = img.shape[:2]
    rng = np.random.default_rng(int(seed) * 7919 + 13)
    n = rng.standard_normal((h // size, w // size), dtype=np.float32)
    n = cv2.resize(n, (w, h), interpolation=cv2.INTER_LINEAR)
    lum = img.mean(axis=2, keepdims=True)
    return img + n[..., None] * (amp * (0.55 + 1.2 * lum * (1 - lum)))


def blur(img, sigma):
    return cv2.GaussianBlur(img, (0, 0), sigma)


def depth_of_field(img, mask_focus, sigma=6.0):
    """Blur everything where mask_focus (HxW 0..1, 1=in focus) is low."""
    b = cv2.GaussianBlur(img, (0, 0), sigma)
    m = mask_focus[..., None]
    return img * m + b * (1 - m)


def composite_adaptive(img, alpha, light, dark, opacity=0.85, threshold=0.36, soft=0.16):
    """Overlay a mask (HUD, credits) in `dark` over light pixels and `light` over dark pixels."""
    if alpha is None or not (alpha > 0.002).any():
        return img
    h, w = img.shape[:2]
    small = cv2.resize(img, (max(1, w // 16), max(1, h // 16)), interpolation=cv2.INTER_AREA)
    lum = cv2.GaussianBlur(small @ LUMA, (0, 0), 1.2)
    lum = cv2.resize(lum, (w, h), interpolation=cv2.INTER_LINEAR)
    k = np.clip((lum - threshold) / soft, 0, 1)[..., None]
    col = np.array(light, np.float32) * (1 - k) + np.array(dark, np.float32) * k
    a = (alpha * opacity)[..., None]
    return img * (1 - a) + col * a


def composite_rgba(img, rgba):
    """Premultiplied RGBA layer over img."""
    return img * (1 - rgba[..., 3:4]) + rgba[..., :3]


def to_u8(img):
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
