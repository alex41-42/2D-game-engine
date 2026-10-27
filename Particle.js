'use strict';

// Particle.cpp + Particle.h
class Particle {
    constructor(pos = new Vector2D(), radius = 1.0, locked = false, mass = 1.0) {
        // Copie par valeur (comme en C++) : jamais d'alias avec le vecteur de l'appelant
        this.pos = new Vector2D(pos.x, pos.y);
        this.old_pos = new Vector2D(pos.x, pos.y);
        this.acc = new Vector2D();
        this.radius = radius;
        this.locked = locked;
        this.mass = mass;
        this.group_id = -1; // -1 = pas de groupe rigide (ex: la chaîne principale)
    }

    apply_acceleration(a) {
        this.acc.x += a.x;
        this.acc.y += a.y;
    }

    apply_force(force) {
        this.acc.x += force.x / this.mass;
        this.acc.y += force.y / this.mass;
    }

    get_inv_mass() { return this.locked ? 0.0 : 1.0 / this.mass; }

    update(dt, friction) {
        const acc = this.acc;
        if (this.locked) {
            acc.x = 0.0;
            acc.y = 0.0;
            return;
        }

        const pos = this.pos;
        const old = this.old_pos;
        const k = 1.0 - friction;
        const dt2 = dt * dt;

        const nx = pos.x + (pos.x - old.x) * k + acc.x * dt2;
        const ny = pos.y + (pos.y - old.y) * k + acc.y * dt2;

        old.x = pos.x;
        old.y = pos.y;
        pos.x = nx;
        pos.y = ny;
        acc.x = 0.0;
        acc.y = 0.0;
    }

    constrain_to_bounds(width, height, restitution, ground_friction) {
        if (this.locked) return;

        const pos = this.pos;
        const old = this.old_pos;
        const H = height - this.radius - 1.0;
        const W = width - this.radius - 1.0;

        if (pos.y > H) {
            const vx = pos.x - old.x;
            const vy = pos.y - old.y;
            pos.y = H;
            old.y = H + vy * restitution;
            old.x = pos.x - vx * (1.0 - ground_friction);
        }

        if (pos.x > W) {
            const vx = pos.x - old.x;
            pos.x = W;
            old.x = W + vx * restitution;
        }

        if (pos.x < this.radius) {
            const vx = pos.x - old.x;
            pos.x = this.radius;
            old.x = this.radius + vx * restitution;
        }
    }
}
