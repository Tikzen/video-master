"""Colour: hex parsing, mixing, role-based palettes, contrast checks.

A palette is a set of ROLES, not a bag of colours (references/craft/concept-and-system.md):
    ground   – dominant background value (ink or paper)
    ground2  – the opposite ground, used for value flips between chapters
    text     – body/title colour on `ground`
    accent   – the ONE action colour: marks the hero event, never decoration
    support  – 1–2 secondary hues that serve the concept (e.g. Bauhaus blue/yellow)
    mute     – annotations, guides, HUD
Keep dominant hues ≤ 3. Richness comes from value, scale and layering, not more hues.
"""
import colorsys


def hexc(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def to_hex(c):
    return "#%02X%02X%02X" % tuple(int(round(max(0, min(1, v)) * 255)) for v in c[:3])


def mix(a, b, u):
    return tuple(x + (y - x) * u for x, y in zip(a, b))


def shade(c, k):
    """k<0 darker (toward black), k>0 lighter (toward white)."""
    return mix(c, (0, 0, 0), -k) if k < 0 else mix(c, (1, 1, 1), k)


def hsv_shift(c, dh=0.0, ds=0.0, dv=0.0):
    h, s, v = colorsys.rgb_to_hsv(*c)
    return colorsys.hsv_to_rgb((h + dh) % 1.0, max(0, min(1, s + ds)), max(0, min(1, v + dv)))


def _lin(v):
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def luminance(c):
    r, g, b = (_lin(v) for v in c[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    """WCAG contrast ratio. ≥4.5 body text, ≥3 large titles/UI, ≥7 for small captions on video."""
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def readable_on(bg, light=(0.93, 0.91, 0.88), dark=(0.04, 0.04, 0.05)):
    return light if contrast(light, bg) >= contrast(dark, bg) else dark


class Palette(dict):
    """Palette(ground="#0B0B0D", text="#EDE8DF", accent="#FF3B1F", ...) → attribute access to RGB tuples."""

    def __init__(self, **roles):
        super().__init__({k: (hexc(v) if isinstance(v, str) else tuple(v)) for k, v in roles.items()})

    def __getattr__(self, k):
        try:
            return self[k]
        except KeyError:
            raise AttributeError(k)

    def audit(self, pairs=None):
        """Return [(fg, bg, ratio, ok)] for declared text-on-ground pairs."""
        pairs = pairs or [("text", "ground"), ("accent", "ground")]
        out = []
        for fg, bg in pairs:
            if fg in self and bg in self:
                r = contrast(self[fg], self[bg])
                out.append((fg, bg, round(r, 2), r >= 3.0))
        return out


# A few tested starting palettes (adapt, don't adopt wholesale)
PALETTES = {
    "bauhaus-ink": dict(ground="#0B0B0D", ground2="#EDE8DF", text="#EDE8DF", accent="#FF3B1F",
                        support="#2440FF", support2="#FFC21A", mute="#8A867E"),
    "swiss-paper": dict(ground="#F2F0EB", ground2="#111111", text="#111111", accent="#E8291C",
                        support="#1F1F1F", mute="#9A968E"),
    "night-signal": dict(ground="#07090F", ground2="#E9EEF5", text="#E9EEF5", accent="#3DF2C4",
                         support="#5B6BFF", mute="#6B7486"),
    "studio-warm": dict(ground="#F4EFE6", ground2="#1E2A33", text="#1E2A33", accent="#E4572E",
                        support="#2E86AB", support2="#F3C969", mute="#8C8476"),
    "report-calm": dict(ground="#F5F6F2", ground2="#13202A", text="#13202A", accent="#D9483B",
                        support="#2F6F73", support2="#9BB7B2", mute="#7E8B87"),
}


def palette(name, **overrides):
    d = dict(PALETTES[name])
    d.update(overrides)
    return Palette(**d)
