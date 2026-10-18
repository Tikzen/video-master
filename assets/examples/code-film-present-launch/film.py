"""演示范例 · 《Video Master 2.0 发布》— product launch / data story, 16 s, motionkit present kit.

    python film.py info | still 2 6.5 10.5 14 | sheet --chapters | diff | chunks 0 12 | assemble
    python score.py ; python film.py audio-qa

What this example teaches (references/craft/genre-presentation.md):
  * one claim per page, revealed in reading order (kicker → title → evidence → source)
  * the chart's AXIS NEVER MOVES; only the changed value morphs, highlighted in the accent
  * pages hand off through objects: title bar → chart baseline; highlighted bar → product window;
    render button → full-frame closing colour. No page-slide transitions.
  * UI camera eases between focus rectangles; the cursor lives in UI space so it stays on target
  * demo numbers and the mock UI are LABELLED as illustrative on screen
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.environ.get("MOTIONKIT_PATH") or next((p for p in (os.path.join(HERE, ".motionkit"),
               os.path.abspath(os.path.join(HERE, "..", "..", "..", "engine"))) if os.path.isdir(p)), "")
sys.path[:0] = [ENGINE, HERE]

import motionkit as mk                                     # noqa: E402
from motionkit import present as pr                        # noqa: E402
from motionkit.annotate import label                       # noqa: E402
from motionkit.draw import fill_bg, rgba, rrect            # noqa: E402
from motionkit.ease import SNAP, clamp, io_cubic, io_expo, out_expo, prog, smooth  # noqa: E402
from motionkit.text import draw_text                       # noqa: E402
import ui_mock                                             # noqa: E402

W, H, FPS, DUR = 1920, 1080, 60, 16.0
PAL = mk.palette("report-calm")
L = pr.Layout(W, H)
film = mk.Film("present-launch", W, H, FPS, DUR, bars=8, root=__file__)
g, ev = film.grid, film.events          # 120 BPM, bar = 2 s

ev.add("title", 0.45, "word")
ev.add("bar_handoff", g.bar(1) + 1.45, "whoosh", dur=0.55)
ev.add("chart", g.bar(2) + 0.15, "tick")
ev.add("morph", g.bar(3) + 0.2, "hit")
ev.add("badge", g.bar(3) + 0.65, "tick")
ev.add("ui_handoff", g.bar(4) - 0.4, "whoosh", dur=0.4)
ev.add("click", g.bar(5) + 0.3, "hit")
ev.add("zoom_out", g.bar(6) - 0.6, "whoosh", dur=0.6)
ev.add("close", g.bar(6), "drop")
ev.add("number", g.bar(6) + 0.4, "word")

# ---------------------------------------------------------------- geometry shared across handoffs
TX = L.m
TITLE_Y = 300
BAR0 = (TX, 640, TX + 420, 652)                     # accent bar under the title
CHART = (TX + 90, 400, 1020, 400)                    # x, y, w, h  → baseline y = 800
CHART_BASE = (CHART[0], 798, CHART[0] + CHART[2], 802)
UI_FRAME = (240, 150, 1680, 960)                     # 1440×810 = 16:9 product window
chart = pr.BarChart(CHART, ["v1.0", "v1.3", "v1.6", "v2.0"], vmax=16, unit="次", ink=PAL.text, bar=PAL.support,
                    accent=PAL.accent, mute=PAL.mute)
V1, V2 = [14, 11, 9, 9], [14, 11, 9, 2]
shot = pr.UIShot(ui_mock.make(PAL, ev["click"]), (ui_mock.UI_W, ui_mock.UI_H))
BTN = ui_mock.RENDER_BTN


def ch_open(ctx, t, ch):
    fill_bg(ctx, PAL.ground)
    pr.title_block(ctx, t, ev["title"], TX, TITLE_Y, 1200, "代码出片，展示级质量。", kicker="VIDEO MASTER 2.0",
                   sub="引擎 · 模板 · 范例 · 手艺标准，一次升级。", col=PAL.text, accent=PAL.accent, mute=PAL.mute,
                   size=104, role="cjk", sub_size=34)
    # hero numeral on the right: outlined "2.0" rising glyph by glyph, gone before the handoff
    hand = io_expo(prog(t, ev["bar_handoff"], ev["bar_handoff"] + 0.55))
    run = mk.Run(mk.face("display"), "2.0", 380, {"wght": 820, "wdth": 92}, -0.02)
    bx, base = W - L.m - run.ink1, 820
    ctx.save()
    ctx.rectangle(bx - 40, base - run.cap - 40, run.ink_w + 120, run.cap + 60)
    ctx.clip()
    ctx.new_path()
    run.path(ctx, bx, base, lambda gl: {"dy": (1 - SNAP(prog(t, 0.7 + 0.12 * gl["idx"], 1.5 + 0.12 * gl["idx"])))
                                        * run.cap * 1.15 + hand * 60})
    ctx.set_line_width(4)
    rgba(ctx, PAL.accent, 1 - hand)
    ctx.stroke()
    ctx.restore()
    grow = out_expo(prog(t, 1.2, 2.0))
    x0, y0, x1, y1 = pr.morph_rect(BAR0, CHART_BASE, hand)
    rgba(ctx, PAL.accent)
    ctx.rectangle(x0, y0, (x1 - x0) * (grow if hand == 0 else 1), y1 - y0)
    ctx.fill()


def ch_data(ctx, t, ch):
    fill_bg(ctx, PAL.ground)
    t0 = ch.t0
    out = io_cubic(prog(t, ev["ui_handoff"], ev["ui_handoff"] + 0.4))
    ctx.push_group()
    pr.title_block(ctx, t, t0 + 0.05, TX, 120, 1100, "每支片子平均人工修改次数", kicker="成片前的返工",
                   col=PAL.text, accent=PAL.accent, mute=PAL.mute, size=62, role="cjk")
    morphing = t >= ev["morph"]
    chart.draw(ctx, t, ev["chart"], V2 if morphing else V1, prev=V1 if morphing else None,
               t_change=ev["morph"] if morphing else None, highlight=3 if t >= ev["morph"] - 0.1 else None)
    pr.delta_badge(ctx, t, ev["badge"], "−78%", CHART[0] + CHART[2] + 70, 560, positive=True,
                   up_col=PAL.accent, size=30)
    label(ctx, "v2.0 引入手艺标准 + 自检循环", CHART[0] + CHART[2] + 70, 630, PAL.text,
          out_expo(prog(t, ev["badge"] + 0.15, ev["badge"] + 0.6)), 24, 600, role="cjk_regular", tracking=0.02)
    pr.source_note(ctx, "示例数据 · 仅用于演示动效，不代表实测结果", TX, 1000, PAL.mute)
    ctx.pop_group_to_source()
    ctx.paint_with_alpha(1 - out)
    # handoff: the highlighted bar becomes the product window
    if t >= ev["ui_handoff"] - 0.05:
        r = chart.bar_rect(3, V2[3])
        x0, y0, x1, y1 = pr.morph_rect(r, UI_FRAME, out)
        rgba(ctx, PAL.accent)
        rrect(ctx, x0, y0, x1 - x0, y1 - y0, 6 + 12 * out)
        ctx.fill()


def _focus(t):
    full = shot.full
    near = (980, 520, 1600, 900)
    tight = (BTN[0] - 6, BTN[1] - 4, BTN[2] + 6, BTN[3] + 4)
    return shot.focus_at(t, [(g.bar(4), full), (g.bar(4) + 1.2, full), (g.bar(5) - 0.15, near),
                             (ev["zoom_out"], near), (g.bar(6), tight)], ease=io_cubic)


def ch_product(ctx, t, ch):
    fill_bg(ctx, PAL.ground)
    t0 = ch.t0
    appear = smooth(prog(t, t0, t0 + 0.25))
    focus = _focus(t)
    # as the camera dives into the button, the window grows to the full frame
    dive = io_cubic(prog(t, ev["zoom_out"], g.bar(6)))
    frame = pr.morph_rect(UI_FRAME, (0, 0, W, H), dive)
    shot.draw(ctx, frame, focus, t, chrome="browser" if dive < 0.5 else None, title="studio.video-master.local",
              shadow=dive < 0.5)
    if appear < 1:
        rgba(ctx, PAL.accent, 1 - appear)
        rrect(ctx, *UI_FRAME[:2], UI_FRAME[2] - UI_FRAME[0], UI_FRAME[3] - UI_FRAME[1], 18)
        ctx.fill()
    # cursor lives in UI space → mapped through the moving camera, so it stays on its target
    cx, cy = pr.cursor_path(t, [(t0 + 0.4, 700, 300), (t0 + 1.3, 820, 420), (ev["click"] - 0.2, 1455, 832)])
    fx, fy = shot.to_frame(frame, focus, cx, cy)
    b = shot.rect_to_frame(frame, focus, BTN)
    after = prog(t, ev["click"] + 0.1, ev["click"] + 0.5) * (1 - dive)
    pr.spotlight(ctx, b, after * 0.8, W, H, dim=PAL.ground2, dim_a=0.45, radius=16)
    pr.focus_ring(ctx, b, prog(t, ev["click"] + 0.15, ev["click"] + 0.7) * (1 - dive), PAL.accent)
    pressed = pr.click_ripple(ctx, fx, fy, t, ev["click"], PAL.accent)
    if dive < 0.3:
        pr.cursor(ctx, fx, fy, 1.6, pressed=pressed)
    cap = out_expo(prog(t, ev["click"] + 0.3, ev["click"] + 0.8)) * (1 - dive)
    label(ctx, "一键渲染 · 分块可续渲 · 自动质检", UI_FRAME[0], 1010, PAL.text, cap, 26, 600, role="cjk_regular")
    pr.source_note(ctx, "界面为示意", UI_FRAME[2] - 110, 1010, PAL.mute, 0.7 * (1 - dive))


def ch_close(ctx, t, ch):
    fill_bg(ctx, PAL.accent)
    white = (1, 1, 1)
    w = pr.odometer(ctx, t, ev["number"], 900, TX, 560, 220, white, dur=1.3)
    label(ctx, "帧", TX + w + 24, 560, white, out_expo(prog(t, ev["number"] + 0.8, ev["number"] + 1.2)), 72, 700,
          role="cjk")
    draw_text(ctx, "cjk", "每一帧，都由代码决定。", TX, 700, 56, white, out_expo(prog(t, ev["number"] + 1.0, ev["number"] + 1.6)))
    u = SNAP(prog(t, ev["number"] + 1.4, ev["number"] + 2.2))
    rgba(ctx, white, u)
    ctx.rectangle(TX, 780, 360 * u, 3)
    ctx.fill()
    label(ctx, "VIDEO MASTER 2.0  ·  motionkit", TX, 830, white, u, 22, 700, tracking=0.12)


for k, (fn, name) in enumerate(((ch_open, "OPEN"), (ch_data, "DATA"), (ch_product, "PRODUCT"), (ch_close, "CLOSE"))):
    film.chapter(g.bar(2 * k), g.bar(2 * k + 2), name=name)(fn)
film.impact(ev["close"], shake=0, ca=0.004, flash=0.25, decay=0.2, flash_col=(1, 1, 1))
film.blur(default=4, windows=[(ev["bar_handoff"], ev["bar_handoff"] + 0.6, 8), (ev["ui_handoff"], ev["ui_handoff"] + 0.5, 8),
                               (ev["zoom_out"], ev["close"] + 0.1, 10)])
film.post.update(grain=0.0, vig=0.08, bloom=0.0)          # product/data: crisp, no grain

if __name__ == "__main__":
    sys.exit(film.cli())
