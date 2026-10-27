'use strict';

// Vector2D.cpp + Vector2D.h
// Les méthodes retournent un nouveau vecteur (usage hors chemins chauds).
// Les boucles de physique travaillent directement sur .x / .y pour éviter les allocations (GC).
class Vector2D {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(o) { return new Vector2D(this.x + o.x, this.y + o.y); }
    sub(o) { return new Vector2D(this.x - o.x, this.y - o.y); }
    mul(s) { return new Vector2D(this.x * s, this.y * s); }
    div(s) { const inv = 1 / s; return new Vector2D(this.x * inv, this.y * inv); }

    norm() { return Math.sqrt(this.x * this.x + this.y * this.y); }
}
