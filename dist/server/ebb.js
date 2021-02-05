"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EBB = void 0;
const serialport_1 = __importDefault(require("serialport"));
const planning_1 = require("./planning");
const vec_1 = require("./vec");
/** Split d into its fractional and integral parts */
function modf(d) {
    const intPart = Math.floor(d);
    const fracPart = d - intPart;
    return [fracPart, intPart];
}
function isEBB(p) {
    return p.manufacturer === "SchmalzHaus" || p.manufacturer === "SchmalzHaus LLC" || (p.vendorId == "04D8" && p.productId == "FD92");
}
class EBB {
    constructor(port) {
        this.microsteppingMode = 0;
        /** Accumulated XY error, used to correct for movements with sub-step resolution */
        this.error = { x: 0, y: 0 };
        this.cachedSupportsLM = undefined;
        this.port = port;
        this.parser = this.port.pipe(new serialport_1.default.parsers.Regex({ regex: /[\r\n]+/ }));
        this.commandQueue = [];
        this.parser.on("data", (chunk) => {
            if (this.commandQueue.length) {
                if (chunk[0] === "!".charCodeAt(0)) {
                    return this.commandQueue.shift().reject(new Error(chunk.toString("ascii")));
                }
                try {
                    const d = this.commandQueue[0].next(chunk);
                    if (d.done) {
                        return this.commandQueue.shift().resolve(d.value);
                    }
                }
                catch (e) {
                    return this.commandQueue.shift().reject(e);
                }
            }
            else {
                console.log(`unexpected data: ${chunk}`);
            }
        });
    }
    /** List connected EBBs */
    static list() {
        return __awaiter(this, void 0, void 0, function* () {
            const ports = yield serialport_1.default.list();
            return ports.filter(isEBB).map((p) => p.path);
        });
    }
    get stepMultiplier() {
        switch (this.microsteppingMode) {
            case 5: return 1;
            case 4: return 2;
            case 3: return 4;
            case 2: return 8;
            case 1: return 16;
            default:
                throw new Error(`Invalid microstepping mode: ${this.microsteppingMode}`);
        }
    }
    close() {
        return new Promise((resolve, reject) => {
            this.port.close((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    /** Send a raw command to the EBB and expect a single line in return, without an "OK" line to terminate. */
    query(cmd) {
        return this.run(function* () {
            this.port.write(`${cmd}\r`);
            const result = (yield).toString("ascii");
            return result;
        });
    }
    /** Send a raw command to the EBB and expect multiple lines in return, with an "OK" line to terminate. */
    queryM(cmd) {
        return this.run(function* () {
            this.port.write(`${cmd}\r`);
            const result = [];
            while (true) {
                const line = (yield).toString("ascii");
                if (line === "OK") {
                    break;
                }
                result.push(line);
            }
            return result;
        });
    }
    /** Send a raw command to the EBB and expect a single "OK" line in return. */
    command(cmd) {
        return this.run(function* () {
            this.port.write(`${cmd}\r`);
            const ok = (yield).toString("ascii");
            if (ok !== "OK") {
                throw new Error(`Expected OK, got ${ok}`);
            }
        });
    }
    enableMotors(microsteppingMode) {
        if (!(1 <= microsteppingMode && microsteppingMode <= 5)) {
            throw new Error(`Microstepping mode must be between 1 and 5, but was ${microsteppingMode}`);
        }
        this.microsteppingMode = microsteppingMode;
        return this.command(`EM,${microsteppingMode},${microsteppingMode}`);
    }
    disableMotors() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.command("R");
            console.log("Emergency Stop!");
            return this.close();
        });
    }
    setPenHeight(height, rate, delay = 0) {
        return this.command(`S2,${height},4,${rate},${delay}`);
    }
    lowlevelMove(stepsAxis1, initialStepsPerSecAxis1, finalStepsPerSecAxis1, stepsAxis2, initialStepsPerSecAxis2, finalStepsPerSecAxis2) {
        const [initialRate1, deltaR1] = this.axisRate(stepsAxis1, initialStepsPerSecAxis1, finalStepsPerSecAxis1);
        const [initialRate2, deltaR2] = this.axisRate(stepsAxis2, initialStepsPerSecAxis2, finalStepsPerSecAxis2);
        return this.command(`LM,${initialRate1},${stepsAxis1},${deltaR1},${initialRate2},${stepsAxis2},${deltaR2}`);
    }
    /**
     * Use the low-level move command "LM" to perform a constant-acceleration stepper move.
     *
     * Available with EBB firmware 2.5.3 and higher.
     *
     * @param xSteps Number of steps to move in the X direction
     * @param ySteps Number of steps to move in the Y direction
     * @param initialRate Initial step rate, in steps per second
     * @param finalRate Final step rate, in steps per second
     */
    moveWithAcceleration(xSteps, ySteps, initialRate, finalRate) {
        if (!(xSteps !== 0 || ySteps !== 0)) {
            throw new Error("Must move on at least one axis");
        }
        if (!(initialRate >= 0 && finalRate >= 0)) {
            throw new Error(`Rates must be positive, were ${initialRate},${finalRate}`);
        }
        if (!(initialRate > 0 || finalRate > 0)) {
            throw new Error("Must have non-zero velocity during motion");
        }
        const stepsAxis1 = xSteps + ySteps;
        const stepsAxis2 = xSteps - ySteps;
        const norm = Math.sqrt(Math.pow(xSteps, 2) + Math.pow(ySteps, 2));
        const normX = xSteps / norm;
        const normY = ySteps / norm;
        const initialRateX = initialRate * normX;
        const initialRateY = initialRate * normY;
        const finalRateX = finalRate * normX;
        const finalRateY = finalRate * normY;
        const initialRateAxis1 = Math.abs(initialRateX + initialRateY);
        const initialRateAxis2 = Math.abs(initialRateX - initialRateY);
        const finalRateAxis1 = Math.abs(finalRateX + finalRateY);
        const finalRateAxis2 = Math.abs(finalRateX - finalRateY);
        return this.lowlevelMove(stepsAxis1, initialRateAxis1, finalRateAxis1, stepsAxis2, initialRateAxis2, finalRateAxis2);
    }
    /**
     * Use the high-level move command "XM" to perform a constant-velocity stepper move.
     *
     * @param duration Duration of the move, in seconds
     * @param x Number of microsteps to move in the X direction
     * @param y Number of microsteps to move in the Y direction
     */
    moveAtConstantRate(duration, x, y) {
        return this.command(`XM,${Math.floor(duration * 1000)},${x},${y}`);
    }
    waitUntilMotorsIdle() {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                const [, commandStatus, _motor1Status, _motor2Status, fifoStatus] = (yield this.query("QM")).split(",");
                if (commandStatus === "0" && fifoStatus === "0") {
                    break;
                }
            }
        });
    }
    executeBlockWithLM(block) {
        return __awaiter(this, void 0, void 0, function* () {
            const [errX, stepsX] = modf((block.p2.x - block.p1.x) * this.stepMultiplier + this.error.x);
            const [errY, stepsY] = modf((block.p2.y - block.p1.y) * this.stepMultiplier + this.error.y);
            this.error.x = errX;
            this.error.y = errY;
            if (stepsX !== 0 || stepsY !== 0) {
                yield this.moveWithAcceleration(stepsX, stepsY, block.vInitial * this.stepMultiplier, block.vFinal * this.stepMultiplier);
            }
        });
    }
    /**
     * Execute a constant-acceleration motion plan using the low-level LM command.
     *
     * Note that the LM command is only available starting from EBB firmware version 2.5.3.
     */
    executeXYMotionWithLM(plan) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const block of plan.blocks) {
                yield this.executeBlockWithLM(block);
            }
        });
    }
    /**
     * Execute a constant-acceleration motion plan using the high-level XM command.
     *
     * This is less accurate than using LM, since acceleration will only be adjusted every timestepMs milliseconds,
     * where LM can adjust the acceleration at a much higher rate, as it executes on-board the EBB.
     */
    executeXYMotionWithXM(plan, timestepMs = 15) {
        return __awaiter(this, void 0, void 0, function* () {
            const timestepSec = timestepMs / 1000;
            let t = 0;
            while (t < plan.duration()) {
                const i1 = plan.instant(t);
                const i2 = plan.instant(t + timestepSec);
                const d = vec_1.vsub(i2.p, i1.p);
                const [ex, sx] = modf(d.x * this.stepMultiplier + this.error.x);
                const [ey, sy] = modf(d.y * this.stepMultiplier + this.error.y);
                this.error.x = ex;
                this.error.y = ey;
                yield this.moveAtConstantRate(timestepSec, sx, sy);
                t += timestepSec;
            }
        });
    }
    /** Execute a constant-acceleration motion plan, starting and ending with zero velocity. */
    executeXYMotion(plan) {
        return __awaiter(this, void 0, void 0, function* () {
            if (yield this.supportsLM()) {
                yield this.executeXYMotionWithLM(plan);
            }
            else {
                yield this.executeXYMotionWithXM(plan);
            }
        });
    }
    executePenMotion(pm) {
        // rate is in units of clocks per 24ms.
        // so to fit the entire motion in |pm.duration|,
        // dur = diff / rate
        // [time] = [clocks] / ([clocks]/[time])
        // [time] = [clocks] * [clocks]^-1 * [time]
        // [time] = [time]
        // ✔
        // so rate = diff / dur
        // dur is in [sec]
        // but rate needs to be in [clocks] / [24ms]
        // duration in units of 24ms is duration * [24ms] / [1s]
        return this.setPenHeight(pm.finalPos, 0, Math.round(pm.duration() * 1000 + 0));
    }
    executeMotion(m) {
        if (m instanceof planning_1.XYMotion) {
            return this.executeXYMotion(m);
        }
        else if (m instanceof planning_1.PenMotion) {
            return this.executePenMotion(m);
        }
        else {
            throw new Error(`Unknown motion type: ${m.constructor.name}`);
        }
    }
    executePlan(plan, microsteppingMode = 2) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.enableMotors(microsteppingMode);
            for (const m of plan.motions) {
                yield this.executeMotion(m);
            }
        });
    }
    /**
     * Query voltages for board & steppers. Useful to check whether stepper power is plugged in.
     *
     * @return Tuple of (RA0_VOLTAGE, V+_VOLTAGE, VIN_VOLTAGE)
     */
    queryVoltages() {
        return __awaiter(this, void 0, void 0, function* () {
            const [ra0Voltage, vPlusVoltage] = (yield this.queryM("QC"))[0].split(/,/).map(Number);
            return [
                ra0Voltage / 1023.0 * 3.3,
                vPlusVoltage / 1023.0 * 3.3,
                vPlusVoltage / 1023.0 * 3.3 * 9.2 + 0.3
            ];
        });
    }
    /**
     * Query the firmware version running on the EBB.
     *
     * @return The version string, e.g. "Version: EBBv13_and_above EB Firmware Version 2.5.3"
     */
    firmwareVersion() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.query("V");
        });
    }
    areSteppersPowered() {
        return __awaiter(this, void 0, void 0, function* () {
            const [, , vInVoltage] = yield this.queryVoltages();
            return vInVoltage > 6;
        });
    }
    queryButton() {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.queryM("QB"))[0] === "1";
        });
    }
    /**
     * @return true iff the EBB firmware supports the LM command.
     */
    supportsLM() {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof this.cachedSupportsLM === "undefined") {
                const fwvWords = (yield this.firmwareVersion()).split(" ");
                const [major, minor, patch] = fwvWords[fwvWords.length - 1].split("\\.").map(Number);
                this.cachedSupportsLM = (major > 2 ||
                    (major === 2 && minor > 5) ||
                    (major === 2 && minor === 5 && patch >= 3));
            }
            return this.cachedSupportsLM;
        });
    }
    /**
     * Helper method for computing axis rates for the LM command.
     *
     * See http://evil-mad.github.io/EggBot/ebb.html#LM
     *
     * @param steps Number of steps being taken
     * @param initialStepsPerSec Initial movement rate, in steps per second
     * @param finalStepsPerSec Final movement rate, in steps per second
     * @return A tuple of (initialAxisRate, deltaR) that can be passed to the LM command
     */
    axisRate(steps, initialStepsPerSec, finalStepsPerSec) {
        const initialRate = Math.round(initialStepsPerSec * ((1 << 31) / 25000));
        const finalRate = Math.round(finalStepsPerSec * ((1 << 31) / 25000));
        const moveTime = 2 * Math.abs(steps) / (initialStepsPerSec + finalStepsPerSec);
        const deltaR = Math.round((finalRate - initialRate) / (moveTime * 25000));
        return [initialRate, deltaR];
    }
    run(g) {
        const cmd = g.call(this);
        const d = cmd.next();
        if (d.done) {
            return Promise.resolve(d.value);
        }
        this.commandQueue.push(cmd);
        return new Promise((resolve, reject) => {
            cmd.resolve = resolve;
            cmd.reject = reject;
        });
    }
}
exports.EBB = EBB;
//# sourceMappingURL=ebb.js.map