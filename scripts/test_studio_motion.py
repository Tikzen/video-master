"""Regression tests for studio display state and voice-driven sticker motion (motionkit).

Covers the 2026-10 studio retrospective: captions/PIP must not fall back to a default in the
pause between lines, and sprite hosts must stretch/rebound with the voice, then ease down.
"""
import math
import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "engine"))
from motionkit import studio as st  # noqa: E402


def speech():
    sp = st.Speech(fps=60)
    a = sp.add_synthetic("a", "第一句话来自蓝色主持人。", 0.5)
    b = sp.add_synthetic("b", "第二句话来自白色主持人。", a.t1 + 0.433)
    return sp, a, b


class HeldLineTest(unittest.TestCase):
    def test_gap_holds_previous_line_and_speaker(self):
        sp, a, b = speech()
        self.assertIsNone(sp.held(0.2))
        t = a.t1 + 0.01
        while t < b.t0:
            self.assertIsNone(sp.active(t))            # audio is silent…
            self.assertIs(sp.held(t), a)               # …but the display still owns line a
            t += 1 / 30
        self.assertIs(sp.held(b.t0 + 0.01), b)
        self.assertIs(sp.held(b.t1 + 5), b)


class DriveTest(unittest.TestCase):
    def test_stretch_rebound_and_ease_down(self):
        sp, a, b = speech()
        fps = 30
        xs = [sp.drive("a", f / fps) for f in range(int((b.t0 + 1.5) * fps))]
        talk = xs[int((a.t0 + 0.1) * fps):int(a.t1 * fps)]
        self.assertGreater(max(talk), 0.5)
        rebounds = sum(1 for i in range(1, len(talk) - 4)
                       if talk[i] >= talk[i - 1] and talk[i] > talk[i + 1] and talk[i] - min(talk[i:i + 5]) > 0.2)
        self.assertGreaterEqual(rebounds, 3)
        self.assertGreater(abs(xs[int(a.t1 * fps) + 2]), 0.03, "still easing right after speech ends")
        tail = xs[int((a.t1 + 1.2) * fps):]
        self.assertLess(max(abs(v) for v in tail), 0.1 * max(talk), "settles in silence")
        # host b is silent during line a
        self.assertLess(max(abs(sp.drive("b", f / fps)) for f in range(int(a.t0 * fps), int(a.t1 * fps))), 1e-9)

    def test_pure_function_of_time(self):
        sp, a, _ = speech()
        order = [2.1, 0.7, 1.33, 2.1, 0.7]
        fresh, _, _ = speech()
        self.assertEqual([sp.drive("a", t) for t in order], [fresh.drive("a", t) for t in order[::-1]][::-1])


class SpriteHostTest(unittest.TestCase):
    def test_whole_sticker_motion_is_visible_and_differentials_swap(self):
        import cairo
        from PIL import Image
        sp, a, _ = speech()
        with tempfile.TemporaryDirectory() as tmp:
            paths = {}
            for name, col in (("neutral", (60, 120, 220, 255)), ("neutral_talk", (220, 80, 60, 255))):
                im = Image.new("RGBA", (200, 400), (0, 0, 0, 0))
                im.paste(Image.new("RGBA", (160, 380), col), (20, 10))
                paths[name] = os.path.join(tmp, name + ".png")
                im.save(paths[name])
            host = st.SpriteHost(paths)
            perf = st.Performance("a", sp, seed=2)

            def frame(t, h=135):
                surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, 200, 200)
                ctx = cairo.Context(surf)
                host.draw(ctx, 100, 180, h, perf.state(t))
                arr = np.frombuffer(surf.get_data(), np.uint8).reshape(200, surf.get_stride() // 4, 4)
                return arr[:, :200]
            tops = []
            reds = 0
            for f in range(int((a.t0 + 0.2) * 30), int(a.t1 * 30)):
                arr = frame(f / 30)
                rows = np.where(arr[..., 3].max(axis=1) > 0)[0]
                tops.append(rows.min())
                reds += int(arr[..., 2].mean() > arr[..., 0].mean())   # BGRA: talk sprite is red
            self.assertGreaterEqual(max(tops) - min(tops), 3, "≥3 px head travel at 135 px PIP height")
            self.assertGreater(reds, 0, "talk differential used while speaking")
            silent = frame(0.1)
            self.assertLess(silent[..., 2].mean(), silent[..., 0].mean(), "base sprite in silence")


if __name__ == "__main__":
    unittest.main()
