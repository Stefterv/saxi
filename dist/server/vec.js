"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vdot = exports.vadd = exports.vnorm = exports.vmul = exports.vsub = exports.vlen = exports.vlen2 = void 0;
function vlen2(a) {
    return a.x * a.x + a.y * a.y;
}
exports.vlen2 = vlen2;
function vlen(a) {
    return Math.sqrt(vlen2(a));
}
exports.vlen = vlen;
function vsub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}
exports.vsub = vsub;
function vmul(a, s) {
    return { x: a.x * s, y: a.y * s };
}
exports.vmul = vmul;
function vnorm(a) {
    return vmul(a, 1 / vlen(a));
}
exports.vnorm = vnorm;
function vadd(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}
exports.vadd = vadd;
function vdot(a, b) {
    return a.x * b.x + a.y * b.y;
}
exports.vdot = vdot;
//# sourceMappingURL=vec.js.map