'use strict';

// Collision.cpp + Collision.h
// Même algorithme que le C++ : correction géométrique sur pos ET old_pos (vitesse implicite conservée),
// impulsions de restitution / friction uniquement sur old_pos, et seulement si resolve_velocity.
class Collision {
    static BIAS = 0.9; // sous-correction (empiriquement meilleure que >= 1.0)

    static Solve(a, b, restitution, friction, resolve_velocity) {
        const w1 = a.get_inv_mass();
        const w2 = b.get_inv_mass();
        const wsum = w1 + w2;
        if (wsum === 0.0) return;

        const ap = a.pos, ao = a.old_pos;
        const bp = b.pos, bo = b.old_pos;

        const dx = bp.x - ap.x;
        const dy = bp.y - ap.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const min_dist = a.radius + b.radius;
        if (dist === 0.0 || dist >= min_dist) return;

        const inv = 1.0 / dist;
        const nx = dx * inv;
        const ny = dy * inv;
        const overlap = (min_dist - dist) * Collision.BIAS;

        // -- 1) correction géométrique : pos ET old_pos ensemble --
        const ka = -(overlap * (w1 / wsum));
        const kb = overlap * (w2 / wsum);
        const cax = nx * ka, cay = ny * ka;
        const cbx = nx * kb, cby = ny * kb;

        ap.x += cax; ap.y += cay; ao.x += cax; ao.y += cay;
        bp.x += cbx; bp.y += cby; bo.x += cbx; bo.y += cby;

        if (!resolve_velocity) return;

        // -- 2) restitution (normale) --
        let rvx = (bp.x - bo.x) - (ap.x - ao.x);
        let rvy = (bp.y - bo.y) - (ap.y - ao.y);
        const vn = rvx * nx + rvy * ny;
        if (vn > 0.0) return;

        const jn = -(1.0 + restitution) * vn / wsum;
        const inx = nx * jn, iny = ny * jn;

        ao.x += inx * w1; ao.y += iny * w1;
        bo.x -= inx * w2; bo.y -= iny * w2;

        // -- 3) friction (tangentielle) --
        rvx = (bp.x - bo.x) - (ap.x - ao.x);
        rvy = (bp.y - bo.y) - (ap.y - ao.y);

        const tx = -ny, ty = nx;
        const vt = rvx * tx + rvy * ty;
        if (Math.abs(vt) < 1e-6) return;

        let jt = -vt / wsum;
        const maxFriction = friction * Math.abs(jn);
        jt = jt < -maxFriction ? -maxFriction : (jt > maxFriction ? maxFriction : jt);

        const itx = tx * jt, ity = ty * jt;
        ao.x += itx * w1; ao.y += ity * w1;
        bo.x -= itx * w2; bo.y -= ity * w2;
    }

    // segX / segY / seg_len2 : calculés une fois par contrainte par l'appelant (comme en C++)
    static SolveSegment(p, c, segX, segY, seg_len2, restitution, friction, resolve_velocity) {
        const s1 = c.p1;
        const s2 = c.p2;
        if (p === s1 || p === s2) return;
        if (p.group_id !== -1 && p.group_id === s1.group_id && p.group_id === s2.group_id) return;

        const pp = p.pos, po = p.old_pos;
        const s1p = s1.pos, s1o = s1.old_pos;
        const s2p = s2.pos, s2o = s2.old_pos;

        let t = 0.0;
        if (seg_len2 > 1e-6) {
            t = ((pp.x - s1p.x) * segX + (pp.y - s1p.y) * segY) / seg_len2;
            t = t < 0.0 ? 0.0 : (t > 1.0 ? 1.0 : t);
        }

        const dx = pp.x - (s1p.x + segX * t);
        const dy = pp.y - (s1p.y + segY * t);
        const dist2 = dx * dx + dy * dy;
        const min_dist = p.radius + c.width * 0.5;
        // dist2 === 0 : centre exactement sur le segment -> normale indéfinie (NaN en C++), on ignore
        if (dist2 >= min_dist * min_dist || dist2 === 0.0) return;

        const dist = Math.sqrt(dist2);
        const inv = 1.0 / dist;
        const nx = dx * inv;
        const ny = dy * inv;
        const overlap = (min_dist - dist) * Collision.BIAS;

        const w1 = 1.0 - t;
        const w2 = t;

        const wp = p.get_inv_mass();
        const inv1 = s1.get_inv_mass();
        const inv2 = s2.get_inv_mass();

        const wsum = wp + inv1 * w1 * w1 + inv2 * w2 * w2;
        if (wsum === 0.0) return;

        // -- 1) correction géométrique : pos ET old_pos ensemble --
        const lambda = overlap / wsum;
        const kp = lambda * wp;
        const k1 = -lambda * inv1 * w1;
        const k2 = -lambda * inv2 * w2;

        const cpx = nx * kp, cpy = ny * kp;
        const c1x = nx * k1, c1y = ny * k1;
        const c2x = nx * k2, c2y = ny * k2;

        pp.x += cpx; pp.y += cpy; po.x += cpx; po.y += cpy;
        s1p.x += c1x; s1p.y += c1y; s1o.x += c1x; s1o.y += c1y;
        s2p.x += c2x; s2p.y += c2y; s2o.x += c2x; s2o.y += c2y;

        if (!resolve_velocity) return;

        // -- 2) restitution --
        let rvx = (pp.x - po.x) - ((s1p.x - s1o.x) * w1 + (s2p.x - s2o.x) * w2);
        let rvy = (pp.y - po.y) - ((s1p.y - s1o.y) * w1 + (s2p.y - s2o.y) * w2);
        const vn = rvx * nx + rvy * ny;
        if (vn >= 0.0) return;

        const jn = -(1.0 + restitution) * vn / wsum;
        const inx = nx * jn, iny = ny * jn;

        const a1 = inv1 * w1;
        const a2 = inv2 * w2;

        po.x -= inx * wp; po.y -= iny * wp;
        s1o.x += inx * a1; s1o.y += iny * a1;
        s2o.x += inx * a2; s2o.y += iny * a2;

        // -- 3) friction --
        rvx = (pp.x - po.x) - ((s1p.x - s1o.x) * w1 + (s2p.x - s2o.x) * w2);
        rvy = (pp.y - po.y) - ((s1p.y - s1o.y) * w1 + (s2p.y - s2o.y) * w2);

        const tx = -ny, ty = nx;
        const vt = rvx * tx + rvy * ty;
        if (Math.abs(vt) < 1e-6) return;

        let jt = -vt / wsum;
        const maxFriction = friction * Math.abs(jn);
        jt = jt < -maxFriction ? -maxFriction : (jt > maxFriction ? maxFriction : jt);

        const itx = tx * jt, ity = ty * jt;
        po.x -= itx * wp; po.y -= ity * wp;
        s1o.x += itx * a1; s1o.y += ity * a1;
        s2o.x += itx * a2; s2o.y += ity * a2;
    }
}
