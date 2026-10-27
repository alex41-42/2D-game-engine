'use strict';

// Draw.cpp + Draw.h
// Surcouche autour des primitives natives du Canvas 2D (plus de framebuffer manuel).
// Les couleurs acceptent un nombre (0xRRGGBB) ou une chaîne CSS.
class Draw {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.m_width = width;
        this.m_height = height;
        this.m_colors = new Map(); // cache nombre -> chaîne CSS

        ctx.lineCap = 'round';   // capsule = même forme que le test distance-segment du C++
        ctx.lineJoin = 'round';
        ctx.textBaseline = 'top';
        ctx.font = '16px Consolas, monospace';
    }

    Css(color) {
        if (typeof color === 'string') return color;
        let s = this.m_colors.get(color);
        if (s === undefined) {
            s = '#' + color.toString(16).padStart(6, '0');
            this.m_colors.set(color, s);
        }
        return s;
    }

    Clear(color) {
        this.ctx.fillStyle = this.Css(color);
        this.ctx.fillRect(0, 0, this.m_width, this.m_height);
    }

    DrawPixel(p, color) {
        this.ctx.fillStyle = this.Css(color);
        this.ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
    }

    DrawLine(p1, p2, color, width = 1.0) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = this.Css(color);
        ctx.lineWidth = Math.max(width, 1.0);
        ctx.stroke();
    }

    // Anneau entre rIn et rOut
    DrawCircle(p, rIn, rOut, color) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (rIn + rOut) * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = this.Css(color);
        ctx.lineWidth = rOut - rIn;
        ctx.stroke();
    }

    FillCircle(p, r, color) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r < 0 ? 0 : r, 0, Math.PI * 2);
        ctx.fillStyle = this.Css(color);
        ctx.fill();
    }

    DrawText(text, x, y, color) {
        this.ctx.fillStyle = this.Css(color);
        this.ctx.fillText(text, x, y);
    }

    // -- Batch : un seul tracé / un seul draw call pour N formes de même style --

    BeginBatch() {
        this.ctx.beginPath();
    }

    AddLine(p1, p2) {
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
    }

    AddCircle(p, r) {
        const rr = r < 0 ? 0 : r;
        this.ctx.moveTo(p.x + rr, p.y); // évite le trait de liaison entre deux arcs
        this.ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    }

    StrokeBatch(color, width = 1.0) {
        this.ctx.strokeStyle = this.Css(color);
        this.ctx.lineWidth = Math.max(width, 1.0);
        this.ctx.stroke();
    }

    FillBatch(color) {
        this.ctx.fillStyle = this.Css(color);
        this.ctx.fill();
    }
}
