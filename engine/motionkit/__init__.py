"""motionkit — deterministic, code-first motion design engine for Video Master.

    import motionkit as mk

Core
    mk.Film               frame pipeline (chapters, impacts, motion blur, post, HUD, CLI)
    mk.Grid, mk.EventMap  musical clock + shared event map (picture and sound read the same events)
    mk.ease.*             easing / springs / noise (also re-exported: mk.out_expo, mk.spring, …)
    mk.draw.*             cairo shapes, morphs, ribbons, patterns, camera, blending
    mk.text.*             HarfBuzz typography with variable axes (Run, face, fit_width, wrap, …)
    mk.fonts              font roles, discovery, `python -m motionkit.fonts install "Family"`
    mk.annotate           callouts, rails, dimensions, crop marks (the detail layer)
    mk.post               bloom, chroma, grain, vignette, flash, adaptive overlay
    mk.HUD                designer overlay (timecode, chapter roll, beat meter)
Systems
    mk.sim                cached particle simulations (fields, bursts, orbits) + batched drawing
    mk.space              3D point clouds, camera, shading, wireframes, floor grid
    mk.transitions        live two-scene transitions (iris, tile flip, slices, wipes, push, masks)
Genre kits
    mk.present            演示: layout, titles, charts, counters, UI shots, spotlight, cursor
    mk.studio             演播室: speech-driven hosts, set, shot grammar, lower thirds, captions
    mk.mv                 MV: measured beat grid / sections from a real song, kinetic word cards, beat strobes
Audio
    mk.audio.Score, mk.audio.synth   original score/SFX on the film clock; `film.py audio-qa`
"""
from . import annotate, color, draw, ease, fonts, grid, mv, post, present, sim, space, studio, text, transitions
from .color import Palette, contrast, hexc, mix, palette, shade
from .draw import (alpha_group, blend, camera, circle, ellipse, fill_bg, group, morph_pts, poly, rect_c, rgba, rrect)
from .ease import *  # noqa: F401,F403  (easing names are the vocabulary of every scene)
from .film import Chapter, Film
from .grid import Event, EventMap, Grid
from .hud import HUD
from .text import Run, draw_paragraph, draw_text, draw_vertical, face, fit_size, fit_width, glyph_path, wrap

__version__ = "1.0.0"
