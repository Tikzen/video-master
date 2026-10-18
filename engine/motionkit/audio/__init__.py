"""motionkit.audio — original score + sound design on the film clock, and audio QA."""
from . import synth
from .mix import Score, envelope, load_wav, make_ir
from .synth import SR, chord, nt

__all__ = ["synth", "Score", "envelope", "load_wav", "make_ir", "SR", "chord", "nt"]
