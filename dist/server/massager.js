"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replan = void 0;
const Optimization = __importStar(require("./optimization"));
const Planning = __importStar(require("./planning"));
const planning_1 = require("./planning");
const util_1 = require("./util");
const vec_1 = require("./vec");
// CSS, and thus SVG, defines 1px = 1/96th of 1in
// https://www.w3.org/TR/css-values-4/#absolute-lengths
const svgUnitsPerInch = 96;
const mmPerInch = 25.4;
const mmPerSvgUnit = mmPerInch / svgUnitsPerInch;
function replan(inPaths, planOptions) {
    let paths = inPaths;
    // Compute scaling using _all_ the paths, so it's the same no matter what
    // layers are selected.
    if (planOptions.fitPage) {
        paths = util_1.scaleToPaper(paths, planOptions.paperSize, planOptions.marginMm);
    }
    else {
        paths = paths.map(ps => ps.map(p => vec_1.vmul(p, mmPerSvgUnit)));
        if (planOptions.cropToMargins) {
            paths = util_1.cropToMargins(paths, planOptions.paperSize, planOptions.marginMm);
        }
    }
    // Rescaling loses the stroke info, so refer back to the original paths to
    // filter based on the stroke. Rescaling doesn't change the number or order
    // of the paths.
    if (planOptions.layerMode === 'group') {
        paths = paths.filter((path, i) => planOptions.selectedGroupLayers.has(inPaths[i].groupId));
    }
    else if (planOptions.layerMode === 'stroke') {
        paths = paths.filter((path, i) => planOptions.selectedStrokeLayers.has(inPaths[i].stroke));
    }
    if (planOptions.pointJoinRadius > 0) {
        paths = paths.map((p) => util_1.dedupPoints(p, planOptions.pointJoinRadius));
    }
    if (planOptions.sortPaths) {
        console.time("sorting paths");
        paths = Optimization.optimize(paths);
        console.timeEnd("sorting paths");
    }
    if (planOptions.minimumPathLength > 0) {
        console.time("eliding short paths");
        paths = Optimization.elideShortPaths(paths, planOptions.minimumPathLength);
        console.timeEnd("eliding short paths");
    }
    if (planOptions.pathJoinRadius > 0) {
        console.time("joining nearby paths");
        paths = Optimization.joinNearby(paths, planOptions.pathJoinRadius);
        console.timeEnd("joining nearby paths");
    }
    // Convert the paths to units of "steps".
    paths = paths.map((ps) => ps.map((p) => vec_1.vmul(p, planning_1.Device.Axidraw.stepsPerMm)));
    // And finally, motion planning.
    console.time("planning pen motions");
    const plan = Planning.plan(paths, {
        penUpPos: planning_1.Device.Axidraw.penPctToPos(planOptions.penUpHeight),
        penDownPos: planning_1.Device.Axidraw.penPctToPos(planOptions.penDownHeight),
        penDownProfile: {
            acceleration: planOptions.penDownAcceleration * planning_1.Device.Axidraw.stepsPerMm,
            maximumVelocity: planOptions.penDownMaxVelocity * planning_1.Device.Axidraw.stepsPerMm,
            corneringFactor: planOptions.penDownCorneringFactor * planning_1.Device.Axidraw.stepsPerMm,
        },
        penUpProfile: {
            acceleration: planOptions.penUpAcceleration * planning_1.Device.Axidraw.stepsPerMm,
            maximumVelocity: planOptions.penUpMaxVelocity * planning_1.Device.Axidraw.stepsPerMm,
            corneringFactor: 0,
        },
        penDropDuration: planOptions.penDropDuration,
        penLiftDuration: planOptions.penLiftDuration,
    });
    console.timeEnd("planning pen motions");
    return plan;
}
exports.replan = replan;
//# sourceMappingURL=massager.js.map