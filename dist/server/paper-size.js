"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaperSize = void 0;
const vec_1 = require("./vec");
function vround(v, digits = 2) {
    return { x: Number(v.x.toFixed(digits)), y: Number(v.y.toFixed(digits)) };
}
class PaperSize {
    constructor(size) {
        this.size = size;
    }
    get landscape() {
        return new PaperSize({
            x: Math.max(this.size.x, this.size.y),
            y: Math.min(this.size.x, this.size.y),
        });
    }
    get portrait() {
        return new PaperSize({
            x: Math.min(this.size.x, this.size.y),
            y: Math.max(this.size.x, this.size.y),
        });
    }
    get isLandscape() {
        return this.size.x === Math.max(this.size.x, this.size.y);
    }
}
exports.PaperSize = PaperSize;
PaperSize.standard = {
    "USLetter": new PaperSize(vround(vec_1.vmul({ x: 8.5, y: 11 }, 25.4))),
    "USLegal": new PaperSize(vround(vec_1.vmul({ x: 8.5, y: 14 }, 25.4))),
    "ArchA": new PaperSize(vround(vec_1.vmul({ x: 9, y: 12 }, 25.4))),
    "A3": new PaperSize({ x: 297, y: 420 }),
    "A4": new PaperSize({ x: 210, y: 297 }),
    "A5": new PaperSize({ x: 148, y: 210 }),
    "A6": new PaperSize({ x: 105, y: 148 }),
    "6x8": new PaperSize(vround(vec_1.vmul({ x: 6, y: 8 }, 25.4))),
    "5x7": new PaperSize(vround(vec_1.vmul({ x: 5, y: 7 }, 25.4))),
    "11x14": new PaperSize(vround(vec_1.vmul({ x: 11, y: 14 }, 25.4))),
};
//# sourceMappingURL=paper-size.js.map