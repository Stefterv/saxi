"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plan = exports.Plan = exports.XYMotion = exports.PenMotion = exports.Block = exports.AxidrawFast = exports.Device = exports.defaultPlanOptions = void 0;
/**
 * Cribbed from https://github.com/fogleman/axi/blob/master/axi/planner.py
 */
const epsilon = 1e-9;
const paper_size_1 = require("./paper-size");
const vec_1 = require("./vec");
exports.defaultPlanOptions = {
    penUpHeight: 50,
    penDownHeight: 60,
    pointJoinRadius: 0,
    pathJoinRadius: 0.5,
    paperSize: paper_size_1.PaperSize.standard.ArchA.landscape,
    marginMm: 20,
    selectedGroupLayers: new Set(),
    selectedStrokeLayers: new Set(),
    layerMode: 'stroke',
    penDownAcceleration: 200,
    penDownMaxVelocity: 50,
    penDownCorneringFactor: 0.127,
    penUpAcceleration: 400,
    penUpMaxVelocity: 200,
    penDropDuration: 0.12,
    penLiftDuration: 0.12,
    sortPaths: true,
    fitPage: true,
    cropToMargins: true,
    minimumPathLength: 0,
};
exports.Device = {
    Axidraw: {
        stepsPerMm: 5,
        // Practical min/max that you might ever want the pen servo to go on the AxiDraw (v2)
        // Units: 83ns resolution pwm output.
        // Defaults: penup at 12000 (1ms), pendown at 16000 (1.33ms).
        penServoMin: 7500,
        penServoMax: 28000,
        penPctToPos(pct) {
            const t = pct / 100.0;
            return Math.round(this.penServoMin * t + this.penServoMax * (1 - t));
        }
    }
};
exports.AxidrawFast = {
    penDownProfile: {
        acceleration: 200 * exports.Device.Axidraw.stepsPerMm,
        maximumVelocity: 50 * exports.Device.Axidraw.stepsPerMm,
        corneringFactor: 0.127 * exports.Device.Axidraw.stepsPerMm
    },
    penUpProfile: {
        acceleration: 400 * exports.Device.Axidraw.stepsPerMm,
        maximumVelocity: 200 * exports.Device.Axidraw.stepsPerMm,
        corneringFactor: 0
    },
    penUpPos: exports.Device.Axidraw.penPctToPos(50),
    penDownPos: exports.Device.Axidraw.penPctToPos(60),
    penDropDuration: 0.12,
    penLiftDuration: 0.12,
};
class Block {
    constructor(accel, duration, vInitial, p1, p2) {
        if (!(vInitial >= 0)) {
            throw new Error(`vInitial must be >= 0, but was ${vInitial}`);
        }
        if (!(vInitial + accel * duration >= -epsilon)) {
            throw new Error(`vFinal must be >= 0, but vInitial=${vInitial}, duration=${duration}, accel=${accel}`);
        }
        this.accel = accel;
        this.duration = duration;
        this.vInitial = vInitial;
        this.p1 = p1;
        this.p2 = p2;
        this.distance = vec_1.vlen(vec_1.vsub(p1, p2));
    }
    static deserialize(o) {
        return new Block(o.accel, o.duration, o.vInitial, o.p1, o.p2);
    }
    get vFinal() { return Math.max(0, this.vInitial + this.accel * this.duration); }
    instant(tU, dt = 0, ds = 0) {
        const t = Math.max(0, Math.min(this.duration, tU));
        const a = this.accel;
        const v = this.vInitial + this.accel * t;
        const s = Math.max(0, Math.min(this.distance, this.vInitial * t + a * t * t / 2));
        const p = vec_1.vadd(this.p1, vec_1.vmul(vec_1.vnorm(vec_1.vsub(this.p2, this.p1)), s));
        return { t: t + dt, p, s: s + ds, v, a };
    }
    serialize() {
        return {
            accel: this.accel,
            duration: this.duration,
            vInitial: this.vInitial,
            p1: this.p1,
            p2: this.p2,
        };
    }
}
exports.Block = Block;
class PenMotion {
    constructor(initialPos, finalPos, duration) {
        this.initialPos = initialPos;
        this.finalPos = finalPos;
        this.pDuration = duration;
    }
    static deserialize(o) {
        return new PenMotion(o.initialPos, o.finalPos, o.duration);
    }
    duration() {
        return this.pDuration;
    }
    serialize() {
        return {
            t: "PenMotion",
            initialPos: this.initialPos,
            finalPos: this.finalPos,
            duration: this.pDuration,
        };
    }
}
exports.PenMotion = PenMotion;
function scanLeft(a, z, op) {
    const b = [];
    let acc = z;
    b.push(acc);
    for (const x of a) {
        acc = op(acc, x);
        b.push(acc);
    }
    return b;
}
function sortedIndex(array, obj) {
    let low = 0;
    let high = array.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (array[mid] < obj) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
class XYMotion {
    constructor(blocks) {
        this.blocks = blocks;
        this.ts = scanLeft(blocks.map((b) => b.duration), 0, (a, b) => a + b).slice(0, -1);
        this.ss = scanLeft(blocks.map((b) => b.distance), 0, (a, b) => a + b).slice(0, -1);
    }
    static deserialize(o) {
        return new XYMotion(o.blocks.map(Block.deserialize));
    }
    get p1() {
        return this.blocks[0].p1;
    }
    get p2() {
        return this.blocks[this.blocks.length - 1].p2;
    }
    duration() {
        return this.blocks.map((b) => b.duration).reduce((a, b) => a + b, 0);
    }
    instant(t) {
        const idx = sortedIndex(this.ts, t);
        const blockIdx = this.ts[idx] === t ? idx : idx - 1;
        const block = this.blocks[blockIdx];
        return block.instant(t - this.ts[blockIdx], this.ts[blockIdx], this.ss[blockIdx]);
    }
    serialize() {
        return {
            t: "XYMotion",
            blocks: this.blocks.map((b) => b.serialize())
        };
    }
}
exports.XYMotion = XYMotion;
class Plan {
    constructor(motions) {
        this.motions = motions;
    }
    static deserialize(o) {
        return new Plan(o.motions.map((m) => {
            switch (m.t) {
                case "XYMotion": return XYMotion.deserialize(m);
                case "PenMotion": return PenMotion.deserialize(m);
            }
        }));
    }
    duration() {
        return this.motions.map((m) => m.duration()).reduce((a, b) => a + b, 0);
    }
    motion(i) { return this.motions[i]; }
    withPenHeights(penUpHeight, penDownHeight) {
        let penMotionIndex = 0;
        return new Plan(this.motions.map((motion, j) => {
            if (motion instanceof XYMotion) {
                return motion;
            }
            else if (motion instanceof PenMotion) {
                // Uuuugh this is really hacky. We should instead store the
                // pen-up/pen-down heights in a single place and reference them from
                // the PenMotions. Then we can change them in just one place.
                if (j === this.motions.length - 3) {
                    return new PenMotion(penDownHeight, exports.Device.Axidraw.penPctToPos(0), motion.duration());
                }
                else if (j === this.motions.length - 1) {
                    return new PenMotion(exports.Device.Axidraw.penPctToPos(0), penUpHeight, motion.duration());
                }
                return (penMotionIndex++ % 2 === 0
                    ? new PenMotion(penUpHeight, penDownHeight, motion.duration())
                    : new PenMotion(penDownHeight, penUpHeight, motion.duration()));
            }
        }));
    }
    serialize() {
        return {
            motions: this.motions.map((m) => m.serialize())
        };
    }
}
exports.Plan = Plan;
class Segment {
    constructor(p1, p2) {
        this.maxEntryVelocity = 0;
        this.entryVelocity = 0;
        this.p1 = p1;
        this.p2 = p2;
        this.blocks = [];
    }
    length() { return vec_1.vlen(vec_1.vsub(this.p2, this.p1)); }
    direction() { return vec_1.vnorm(vec_1.vsub(this.p2, this.p1)); }
}
function cornerVelocity(seg1, seg2, vMax, accel, cornerFactor) {
    // https://onehossshay.wordpress.com/2011/09/24/improving_grbl_cornering_algorithm/
    const cosine = -vec_1.vdot(seg1.direction(), seg2.direction());
    // assert(!cosine.isNaN, s"cosine was NaN: $seg1, $seg2, ${seg1.direction}, ${seg2.direction}")
    if (Math.abs(cosine - 1) < epsilon) {
        return 0;
    }
    const sine = Math.sqrt((1 - cosine) / 2);
    if (Math.abs(sine - 1) < epsilon) {
        return vMax;
    }
    const v = Math.sqrt((accel * cornerFactor * sine) / (1 - sine));
    // assert(!v.isNaN, s"v was NaN: $accel, $cornerFactor, $sine")
    return Math.min(v, vMax);
}
/** Compute a triangular velocity profile with piecewise constant acceleration.
 *
 * The maximum velocity is derived from the acceleration and the distance to be travelled.
 *
 * @param distance Distance to travel (equal to |p3-p1|).
 * @param initialVel Starting velocity, unit length per unit time.
 * @param finalVel Final velocity, unit length per unit time.
 * @param accel Magnitude of acceleration, unit length per unit time per unit time.
 * @param p1 Starting point.
 * @param p3 Ending point.
 * @return
 */
function computeTriangle(distance, initialVel, finalVel, accel, p1, p3) {
    const acceleratingDistance = (2 * accel * distance + finalVel * finalVel - initialVel * initialVel) / (4 * accel);
    const deceleratingDistance = distance - acceleratingDistance;
    const vMax = Math.sqrt(initialVel * initialVel + 2 * accel * acceleratingDistance);
    const t1 = (vMax - initialVel) / accel;
    const t2 = (finalVel - vMax) / -accel;
    const p2 = vec_1.vadd(p1, vec_1.vmul(vec_1.vnorm(vec_1.vsub(p3, p1)), acceleratingDistance));
    return { s1: acceleratingDistance, s2: deceleratingDistance, t1, t2, vMax, p1, p2, p3 };
}
function computeTrapezoid(distance, initialVel, maxVel, finalVel, accel, p1, p4) {
    const t1 = (maxVel - initialVel) / accel;
    const s1 = (maxVel + initialVel) / 2 * t1;
    const t3 = (finalVel - maxVel) / -accel;
    const s3 = (finalVel + maxVel) / 2 * t3;
    const s2 = distance - s1 - s3;
    const t2 = s2 / maxVel;
    const dir = vec_1.vnorm(vec_1.vsub(p4, p1));
    const p2 = vec_1.vadd(p1, vec_1.vmul(dir, s1));
    const p3 = vec_1.vadd(p1, vec_1.vmul(dir, (distance - s3)));
    return { s1, s2, s3, t1, t2, t3, p1, p2, p3, p4 };
}
function dedupPoints(points, epsilon) {
    if (epsilon === 0) {
        return points;
    }
    const dedupedPoints = [];
    dedupedPoints.push(points[0]);
    for (const p of points.slice(1)) {
        if (vec_1.vlen(vec_1.vsub(p, dedupedPoints[dedupedPoints.length - 1])) > epsilon) {
            dedupedPoints.push(p);
        }
    }
    return dedupedPoints;
}
/**
 * Plan a path, using a constant acceleration profile.
 * This function plans only a single x/y motion of the tool,
 * i.e. between a single pen-down/pen-up pair.
 *
 * @param points Sequence of points to pass through
 * @param profile Tooling profile to use
 * @return A plan of action
 */
function constantAccelerationPlan(points, profile) {
    const dedupedPoints = dedupPoints(points, epsilon);
    if (dedupedPoints.length === 1) {
        return new XYMotion([new Block(0, 0, 0, dedupedPoints[0], dedupedPoints[0])]);
    }
    const segments = dedupedPoints.slice(1).map((a, i) => new Segment(dedupedPoints[i], a));
    const accel = profile.acceleration;
    const vMax = profile.maximumVelocity;
    const cornerFactor = profile.corneringFactor;
    // Calculate the maximum entry velocity for each segment based on the angle between it
    // and the previous segment.
    segments.slice(1).forEach((seg2, i) => {
        const seg1 = segments[i];
        seg2.maxEntryVelocity = cornerVelocity(seg1, seg2, vMax, accel, cornerFactor);
    });
    // This is to force the velocity to zero at the end of the path.
    const lastPoint = dedupedPoints[dedupedPoints.length - 1];
    segments.push(new Segment(lastPoint, lastPoint));
    let i = 0;
    while (i < segments.length - 1) {
        const segment = segments[i];
        const nextSegment = segments[i + 1];
        const distance = segment.length();
        const vInitial = segment.entryVelocity;
        const vExit = nextSegment.maxEntryVelocity;
        const p1 = segment.p1;
        const p2 = segment.p2;
        const m = computeTriangle(distance, vInitial, vExit, accel, p1, p2);
        if (m.s1 < -epsilon) {
            // We'd have to start decelerating _before we started on this segment_. backtrack.
            // In order enter this segment slow enough to be leaving it at vExit, we need to
            // compute a maximum entry velocity s.t. we can slow down in the distance we have.
            // TODO: verify this equation.
            segment.maxEntryVelocity = Math.sqrt(vExit * vExit + 2 * accel * distance);
            i -= 1;
        }
        else if (m.s2 <= 0) {
            // No deceleration.
            // TODO: shouldn't we check vMax here and maybe do trapezoid? should the next case below come first?
            const vFinal = Math.sqrt(vInitial * vInitial + 2 * accel * distance);
            const t = (vFinal - vInitial) / accel;
            segment.blocks = [
                new Block(accel, t, vInitial, p1, p2)
            ];
            nextSegment.entryVelocity = vFinal;
            i += 1;
        }
        else if (m.vMax > vMax) {
            // Triangle profile would exceed maximum velocity, so top out at vMax.
            const z = computeTrapezoid(distance, vInitial, vMax, vExit, accel, p1, p2);
            segment.blocks = [
                new Block(accel, z.t1, vInitial, z.p1, z.p2),
                new Block(0, z.t2, vMax, z.p2, z.p3),
                new Block(-accel, z.t3, vMax, z.p3, z.p4)
            ];
            nextSegment.entryVelocity = vExit;
            i += 1;
        }
        else {
            // Accelerate, then decelerate.
            segment.blocks = [
                new Block(accel, m.t1, vInitial, m.p1, m.p2),
                new Block(-accel, m.t2, m.vMax, m.p2, m.p3)
            ];
            nextSegment.entryVelocity = vExit;
            i += 1;
        }
    }
    const blocks = [];
    segments.forEach((s) => {
        s.blocks.forEach((b) => {
            if (b.duration > epsilon) {
                blocks.push(b);
            }
        });
    });
    return new XYMotion(blocks);
}
function plan(paths, profile) {
    const motions = [];
    let curPos = { x: 0, y: 0 };
    // for each path: move to the initial point, put the pen down, draw the path,
    // then pick the pen up.
    paths.forEach((p, i) => {
        const m = constantAccelerationPlan(p, profile.penDownProfile);
        const penUpPos = i === paths.length - 1 ? exports.Device.Axidraw.penPctToPos(0) : profile.penUpPos;
        motions.push(constantAccelerationPlan([curPos, m.p1], profile.penUpProfile), new PenMotion(profile.penUpPos, profile.penDownPos, profile.penDropDuration), m, new PenMotion(profile.penDownPos, penUpPos, profile.penLiftDuration));
        curPos = m.p2;
    });
    // finally, move back to (0, 0).
    motions.push(constantAccelerationPlan([curPos, { x: 0, y: 0 }], profile.penUpProfile));
    motions.push(new PenMotion(exports.Device.Axidraw.penPctToPos(0), profile.penUpPos, profile.penDropDuration));
    return new Plan(motions);
}
exports.plan = plan;
//# sourceMappingURL=planning.js.map