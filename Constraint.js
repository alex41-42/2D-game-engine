'use strict';

// Constraint.cpp + Constraint.h
// p1 / p2 sont des références d'objets : stables dans un Array, pas besoin de std::deque.
class Constraint {
    constructor(p1, p2, length, width) {
        this.p1 = p1;
        this.p2 = p2;
        this.length = length;
        this.width = width;
    }

    Solve() {
        const p1 = this.p1;
        const p2 = this.p2;

        const w1 = p1.get_inv_mass();
        const w2 = p2.get_inv_mass();
        const wsum = w1 + w2;
        if (wsum === 0.0) return;

        const a = p1.pos;
        const b = p2.pos;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance === 0.0) return;

        const diff = (distance - this.length) / distance;
        const cx = dx * diff;
        const cy = dy * diff;

        const k1 = w1 / wsum;
        const k2 = w2 / wsum;
        a.x += cx * k1;
        a.y += cy * k1;
        b.x -= cx * k2;
        b.y -= cy * k2;
    }
}
