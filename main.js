'use strict';

// main.cpp
// Window.cpp/.h n'est pas recodé : on utilise directement la fenêtre, le canvas et les événements du navigateur.

// -- Fenêtre native --

const WIDTH = 1200;
const HEIGHT = 600;

const canvas = document.getElementById('canvas');
canvas.width = WIDTH;
canvas.height = HEIGHT;
const draw = new Draw(canvas.getContext('2d', { alpha: false }), WIDTH, HEIGHT);

// -- initialization --

const GRAVITY = new Vector2D(0.0, 9.81);
const WIND = new Vector2D(0.0, 0.0);
const FRICTION = 0.001;
const RESTITUTION = 0.8;
const PARTICLES_RESTITUTION = 0.8;
const DT = 0.033;
const STEPS = 10;
const ITERATIONS = 5;
const PARTICLE_RADIUS = 5.0;
const PARTICLES_FRICTION = 0.1;
const GROUND_FRICTION = 0.1;
const LAUNCH_SCALE = 0.15;

const COLOR_WHITE = 0xFFFFFF;
const COLOR_BLACK = 0x000000;
const COLOR_BLUE = 0x0090FF;

const particles = [];     // Array : les références restent valides (équivalent du std::deque)
const constraints = [];

let loops = 0;
let paused = false;

const selection = [];
let hovered = null;

let creating = false;
let create_button = -1;
let create_locked = false;
const create_start = new Vector2D();
let create_target = null;

// -- Adjacence --

let adjacency = new Map();
let topology_dirty = false;

// -- FPS display --

let fps_text = 'FPS: --';
const FPS_UPDATE_INTERVAL = 15;

// -- Input (événements du navigateur, état "just pressed" latché jusqu'au prochain tick) --

const MOUSE_POS = new Vector2D();
const MOUSE_CLICKED = [false, false, false];
const MOUSE_RELEASED = [false, false, false];
const KEYS_PRESSED = new Set();
let shift_down = false;

// DOM : 0 = gauche, 1 = molette, 2 = droit  ->  moteur : 0 = gauche, 1 = droit, 2 = molette
const BUTTON_MAP = { 0: 0, 2: 1, 1: 2 };

function UpdateMouse(e) {
    const rect = canvas.getBoundingClientRect();
    MOUSE_POS.x = (e.clientX - rect.left) * (WIDTH / rect.width);
    MOUSE_POS.y = (e.clientY - rect.top) * (HEIGHT / rect.height);
    shift_down = e.shiftKey;
}

window.addEventListener('keydown', (e) => {
    shift_down = e.shiftKey;
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) KEYS_PRESSED.add(e.code);
});
window.addEventListener('keyup', (e) => { shift_down = e.shiftKey; });
window.addEventListener('blur', () => { shift_down = false; });

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    UpdateMouse(e);
    const b = BUTTON_MAP[e.button];
    if (b !== undefined) MOUSE_CLICKED[b] = true;
});
window.addEventListener('mousemove', UpdateMouse);
window.addEventListener('mouseup', (e) => {
    UpdateMouse(e);
    const b = BUTTON_MAP[e.button];
    if (b !== undefined) MOUSE_RELEASED[b] = true;
});

const justClicked = (b) => MOUSE_CLICKED[b];
const justReleased = (b) => MOUSE_RELEASED[b];

// -- Helpers --

function FindNearestParticle(list, pos) {
    let closest = null;
    let best_dist2 = Infinity;

    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const dx = p.pos.x - pos.x;
        const dy = p.pos.y - pos.y;
        const dist2 = dx * dx + dy * dy;

        if (dist2 < p.radius * p.radius && dist2 < best_dist2) {
            best_dist2 = dist2;
            closest = p;
        }
    }

    return closest;
}

// Map<Particle, Set<Particle>> : AreConnected en O(1) (le C++ faisait un any_of linéaire)
function BuildAdjacency(list) {
    const adj = new Map();
    const link = (a, b) => {
        let s = adj.get(a);
        if (s === undefined) {
            s = new Set();
            adj.set(a, s);
        }
        s.add(b);
    };
    for (let i = 0; i < list.length; i++) {
        link(list[i].p1, list[i].p2);
        link(list[i].p2, list[i].p1);
    }
    return adj;
}

function AreConnected(adj, a, b) {
    const s = adj.get(a);
    return s !== undefined && s.has(b);
}

// -- Logic : interactions (en pause) --

function Interactions() {
    if (!shift_down && !creating && (justClicked(0) || justClicked(1))) {
        creating = true;
        create_button = justClicked(1) ? 1 : 0;
        create_locked = (create_button === 1);
        create_target = hovered;
        const src = hovered ? hovered.pos : MOUSE_POS;
        create_start.x = src.x; // copie par valeur
        create_start.y = src.y;
    }

    if (creating && justReleased(create_button)) {
        const velocity = create_start.sub(MOUSE_POS).mul(LAUNCH_SCALE);

        if (create_target) {
            // particule existante : vitesse injectée via old_pos
            create_target.old_pos.x = create_target.pos.x - velocity.x;
            create_target.old_pos.y = create_target.pos.y - velocity.y;
        } else {
            const p = new Particle(create_start, PARTICLE_RADIUS, create_locked);
            p.old_pos.x = p.pos.x - velocity.x;
            p.old_pos.y = p.pos.y - velocity.y;
            particles.push(p);
        }

        creating = false;
        create_target = null;
        create_button = -1;
    }

    if (shift_down && (justClicked(0) || justClicked(1))) {
        const locked = justClicked(1);
        let picked = hovered;

        if (!picked) {
            picked = new Particle(MOUSE_POS, PARTICLE_RADIUS, locked);
            particles.push(picked);
        }
        selection.push(picked);
    } else if (!shift_down && selection.length > 0) {
        for (let i = 0; i + 1 < selection.length; i++) {
            const a = selection[i];
            const b = selection[i + 1];
            const length = b.pos.sub(a.pos).norm();
            const thickness = b.radius + a.radius;
            constraints.push(new Constraint(a, b, length, thickness));
        }
        selection.length = 0;
        topology_dirty = true;
    }
}

// -- Logic : physique --

function Physics() {
    if (topology_dirty) {
        adjacency = BuildAdjacency(constraints);
        topology_dirty = false;
    }

    const n = particles.length;

    for (let g = 0; g < STEPS; g++) {
        for (let i = 0; i < n; i++) {
            const particle = particles[i];
            particle.apply_acceleration(GRAVITY);
            particle.apply_force(WIND);
            particle.update(DT, FRICTION);
        }

        for (let h = 0; h < ITERATIONS; h++) {
            const resolve_velocity = (h === ITERATIONS - 1);

            for (let i = 0; i < constraints.length; i++) {
                constraints[i].Solve();
            }

            for (let i = 0; i < n; i++) {
                const pa = particles[i];
                for (let j = i + 1; j < n; j++) {
                    const pb = particles[j];

                    // rejet rapide AVANT la recherche d'adjacence (le test de contact est sans effet de bord)
                    const dx = pb.pos.x - pa.pos.x;
                    const dy = pb.pos.y - pa.pos.y;
                    const min_dist = pa.radius + pb.radius;
                    if (dx * dx + dy * dy >= min_dist * min_dist) continue;

                    if (AreConnected(adjacency, pa, pb)) continue; // skip : déjà géré par la contrainte

                    Collision.Solve(pa, pb, PARTICLES_RESTITUTION, PARTICLES_FRICTION, resolve_velocity);
                }
            }

            for (let i = 0; i < constraints.length; i++) {
                const constraint = constraints[i];
                const segX = constraint.p2.pos.x - constraint.p1.pos.x;
                const segY = constraint.p2.pos.y - constraint.p1.pos.y;
                const seg_len2 = segX * segX + segY * segY;
                for (let k = 0; k < n; k++) {
                    Collision.SolveSegment(particles[k], constraint, segX, segY, seg_len2, PARTICLES_RESTITUTION, PARTICLES_FRICTION, resolve_velocity);
                }
            }
        }

        for (let i = 0; i < n; i++) {
            particles[i].constrain_to_bounds(WIDTH, HEIGHT, RESTITUTION, GROUND_FRICTION);
        }
    }
}

function Tick() {
    hovered = FindNearestParticle(particles, MOUSE_POS);

    if (KEYS_PRESSED.has('Space')) paused = !paused;

    if (paused) Interactions();
    else Physics();

    // reset des états "just"
    KEYS_PRESSED.clear();
    MOUSE_CLICKED.fill(false);
    MOUSE_RELEASED.fill(false);
}

// -- Render --

function Render() {
    draw.Clear(COLOR_BLACK);

    // Contraintes : un seul draw call par série de même épaisseur
    let batch_width = -1;
    for (let i = 0; i < constraints.length; i++) {
        const c = constraints[i];
        if (c.width !== batch_width) {
            if (batch_width >= 0) draw.StrokeBatch(COLOR_WHITE, batch_width);
            draw.BeginBatch();
            batch_width = c.width;
        }
        draw.AddLine(c.p1.pos, c.p2.pos);
    }
    if (batch_width >= 0) draw.StrokeBatch(COLOR_WHITE, batch_width);

    // Particules : disque noir (efface les traits à l'intérieur) puis anneau blanc de 2 px, 2 draw calls au total
    if (particles.length > 0) {
        draw.BeginBatch();
        for (let i = 0; i < particles.length; i++) {
            draw.AddCircle(particles[i].pos, particles[i].radius - 1.0);
        }
        draw.FillBatch(COLOR_BLACK);

        draw.BeginBatch();
        for (let i = 0; i < particles.length; i++) {
            draw.AddCircle(particles[i].pos, particles[i].radius - 1.0);
        }
        draw.StrokeBatch(COLOR_WHITE, 2.0);
    }

    if (hovered) {
        draw.DrawCircle(hovered.pos, hovered.radius + 3.0, hovered.radius + 4.0, COLOR_BLUE);
    }
    if (creating) {
        const anchor = create_target ? create_target.pos : create_start;
        draw.DrawLine(anchor, MOUSE_POS, COLOR_BLUE);
        draw.DrawCircle(anchor, PARTICLE_RADIUS, PARTICLE_RADIUS + 2.0, COLOR_BLUE);
    }

    draw.DrawText(fps_text, 10, 10, COLOR_WHITE);
}

// -- Boucle : pas fixe 60 Hz (indépendant de la fréquence de l'écran, DT physique inchangé) --

const TICK_MS = 1000 / 60;
const MAX_ACC = TICK_MS * 3; // évite la spirale de rattrapage (onglet en arrière-plan, frame lente)
let last_time = performance.now();
let accumulator = 0;

function Frame(now) {
    requestAnimationFrame(Frame);

    accumulator += now - last_time;
    last_time = now;
    if (accumulator > MAX_ACC) accumulator = MAX_ACC;
    if (accumulator < TICK_MS - 1.0) return; // tolérance 1 ms contre le jitter de rAF

    const frameStart = performance.now();

    do {
        Tick();
        accumulator -= TICK_MS;
    } while (accumulator >= TICK_MS - 1.0);

    // -- Fps (temps de travail réel, comme 1 / frameDuration en C++) --
    if (loops % FPS_UPDATE_INTERVAL === 0) {
        const work_ms = performance.now() - frameStart;
        fps_text = 'FPS: ' + Math.round(1000 / Math.max(work_ms, 0.01));
    }

    Render();
    ++loops;
}

requestAnimationFrame(Frame);
