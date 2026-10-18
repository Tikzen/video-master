"""A code-drawn product UI (1600×900 'screenshot' space) for the demo.
In a real product video use UIShot("assets/ui/real-screenshot.png") instead — never invent a real
product's controls. This mock is labelled as illustrative in the film."""
from motionkit.annotate import label
from motionkit.draw import circle, rgba, rrect
from motionkit.ease import out_expo, prog

UI_W, UI_H = 1600, 900
RENDER_BTN = (1360, 800, 1560, 860)        # x0, y0, x1, y1 in UI space (the camera/cursor target)
TIMELINE = (300, 560, 1560, 780)
PREVIEW = (300, 40, 1560, 520)


def make(pal, t_click):
    bg, panel, line = (0.97, 0.97, 0.96), (0.93, 0.93, 0.91), (0.82, 0.82, 0.8)
    ink, mute = pal.text, pal.mute

    def draw(ctx, t):
        rgba(ctx, bg)
        ctx.paint()
        # sidebar
        rgba(ctx, panel)
        ctx.rectangle(0, 0, 260, UI_H)
        ctx.fill()
        label(ctx, "VIDEO MASTER", 32, 60, ink, 1, 18, 800, role="display", tracking=0.08)
        for k, name in enumerate(("方案 Plan", "素材 Assets", "时间线 Timeline", "交付 Delivery")):
            on = k == 2
            if on:
                rgba(ctx, pal.accent, 0.12)
                rrect(ctx, 16, 110 + k * 56, 228, 44, 8)
                ctx.fill()
            label(ctx, name, 36, 139 + k * 56, pal.accent if on else ink, 1, 17, 600, role="cjk_regular", tracking=0.02)
        # preview monitor
        x0, y0, x1, y1 = PREVIEW
        rgba(ctx, pal.ground2)
        rrect(ctx, x0, y0, x1 - x0, y1 - y0, 12)
        ctx.fill()
        rgba(ctx, pal.accent)
        circle(ctx, (x0 + x1) / 2, (y0 + y1) / 2, 70 + 8 * (0.5 + 0.5 * __import__("math").sin(t * 3)))
        ctx.fill()
        label(ctx, "PREVIEW  00:00:%02d" % int(t % 60), x0 + 20, y1 - 20, (1, 1, 1), 0.8, 15, 600)
        # timeline tracks
        x0, y0, x1, y1 = TIMELINE
        cols = (pal.accent, pal.support, pal.support2 if "support2" in pal else pal.mute)
        for k in range(3):
            y = y0 + 20 + k * 66
            rgba(ctx, panel)
            rrect(ctx, x0, y, x1 - x0, 50, 8)
            ctx.fill()
            for j in range(6):
                rgba(ctx, cols[k], 0.85)
                rrect(ctx, x0 + 12 + j * 205 + (k * 37) % 60, y + 8, 150 - 18 * ((j + k) % 3), 34, 6)
                ctx.fill()
        ph = x0 + (x1 - x0) * ((t * 0.08) % 1.0)
        rgba(ctx, ink)
        ctx.rectangle(ph - 1.5, y0 + 6, 3, y1 - y0 - 12)
        ctx.fill()
        # render button (pressed state after the click)
        bx0, by0, bx1, by1 = RENDER_BTN
        done = out_expo(prog(t, t_click, t_click + 0.4))
        rgba(ctx, pal.accent)
        rrect(ctx, bx0, by0, bx1 - bx0, by1 - by0, 12)
        ctx.fill()
        label(ctx, "渲染 Render" if done < 0.5 else "✓ 已完成" if not _missing("✓已完成") else "已完成",
              (bx0 + bx1) / 2, by0 + 39, (1, 1, 1), 1, 20, 700, "center", role="cjk")
        rgba(ctx, line)
        ctx.set_line_width(1)
        ctx.move_to(260.5, 0)
        ctx.line_to(260.5, UI_H)
        ctx.stroke()
    return draw


def _missing(s):
    from motionkit.text import face
    return bool(face("cjk").missing(s))
