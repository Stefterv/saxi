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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectEBB = exports.standalone = exports.startServer = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const serialport_1 = __importDefault(require("serialport"));
const wake_lock_1 = require("wake-lock");
const ws_1 = __importDefault(require("ws"));
const url_1 = __importDefault(require("url"));
const ebb_1 = require("./ebb");
const planning_1 = require("./planning");
const util_1 = require("./util");
function startServer(port, device = null, enableCors = false, maxPayloadSize = "200mb") {
    const app = express_1.default();
    app.use("/", express_1.default.static(path_1.default.join(__dirname, "..", "ui")));
    if (enableCors) {
        app.use(cors_1.default());
    }
    const { rest, wss, connect } = standalone(device, maxPayloadSize);
    app.use(rest);
    const server = http_1.default.createServer(app);
    server.on("upgrade", function upgrade(request, socket, head) {
        const pathname = url_1.default.parse(request.url).pathname;
        if (pathname === "/") {
            wss.handleUpgrade(request, socket, head, function done(ws) {
                wss.emit("connection", ws, request);
            });
        }
    });
    return new Promise((resolve) => {
        server.listen(port, () => {
            connect();
            const { family, address, port } = server.address();
            const addr = `${family === "IPv6" ? `[${address}]` : address}:${port}`;
            console.log(`Server listening on http://${addr}`);
            resolve(server);
        });
    });
}
exports.startServer = startServer;
function standalone(device = null, maxPayloadSize = "200mb") {
    const app = express_1.default();
    app.use(express_1.default.json({ limit: maxPayloadSize }));
    const wss = new ws_1.default.Server({ noServer: true });
    let ebb;
    let clients = [];
    let cancelRequested = false;
    let limpRequested = false;
    let unpaused = null;
    let signalUnpause = null;
    let motionIdx = null;
    let currentPlan = null;
    let plotting = false;
    wss.on("connection", (ws) => {
        clients.push(ws);
        ws.on("message", (message) => {
            if (typeof message === "string") {
                const msg = JSON.parse(message);
                switch (msg.c) {
                    case "ping":
                        ws.send(JSON.stringify({ c: "pong" }));
                        break;
                    case "limp":
                        limpRequested = true;
                        broadcast({ c: "limped" });
                        if (ebb) {
                            ebb.disableMotors();
                        }
                        plotting = false;
                        break;
                    case "setPenHeight":
                        if (ebb) {
                            ebb.setPenHeight(msg.p.height, msg.p.rate);
                        }
                        break;
                }
            }
        });
        ws.send(JSON.stringify({ c: "dev", p: { path: ebb ? ebb.port.path : null } }));
        ws.send(JSON.stringify({ c: "pause", p: { paused: !!unpaused } }));
        if (motionIdx != null) {
            ws.send(JSON.stringify({ c: "progress", p: { motionIdx } }));
        }
        if (currentPlan != null) {
            ws.send(JSON.stringify({ c: "plan", p: { plan: currentPlan } }));
        }
        ws.on("close", () => {
            clients = clients.filter((w) => w !== ws);
        });
    });
    app.post("/plot", (req, res) => __awaiter(this, void 0, void 0, function* () {
        if (plotting) {
            console.log("Received plot request, but a plot is already in progress!");
            return res.status(400).end("Plot in progress");
        }
        plotting = true;
        try {
            const plan = planning_1.Plan.deserialize(req.body);
            currentPlan = req.body;
            console.log(`Received plan of estimated duration ${util_1.formatDuration(plan.duration())}`);
            console.log(ebb != null ? "Beginning plot..." : "Simulating plot...");
            res.status(200).end();
            const begin = Date.now();
            let wakeLock;
            try {
                wakeLock = new wake_lock_1.WakeLock("saxi plotting");
            }
            catch (e) {
                console.warn("Couldn't acquire wake lock. Ensure your machine does not sleep during plotting");
            }
            try {
                yield doPlot(ebb != null ? realPlotter : simPlotter, plan);
                const end = Date.now();
                console.log(`Plot took ${util_1.formatDuration((end - begin) / 1000)}`);
            }
            finally {
                if (wakeLock) {
                    wakeLock.release();
                }
            }
        }
        finally {
            plotting = false;
        }
    }));
    app.post("/cancel", (req, res) => {
        cancelRequested = true;
        if (unpaused) {
            signalUnpause();
        }
        unpaused = signalUnpause = null;
        res.status(200).end();
    });
    app.post("/pause", (req, res) => {
        if (!unpaused) {
            unpaused = new Promise((resolve) => {
                signalUnpause = resolve;
            });
            broadcast({ c: "pause", p: { paused: true } });
        }
        res.status(200).end();
    });
    app.post("/resume", (req, res) => {
        if (signalUnpause) {
            signalUnpause();
            signalUnpause = unpaused = null;
        }
        res.status(200).end();
    });
    function broadcast(msg) {
        clients.forEach((ws) => {
            try {
                ws.send(JSON.stringify(msg));
            }
            catch (e) {
                console.warn(e);
            }
        });
    }
    const realPlotter = {
        prePlot(initialPenHeight) {
            return __awaiter(this, void 0, void 0, function* () {
                yield ebb.enableMotors(2);
                yield ebb.setPenHeight(initialPenHeight, 1000, 1000);
            });
        },
        executeMotion(motion, _progress) {
            return __awaiter(this, void 0, void 0, function* () {
                yield ebb.executeMotion(motion);
            });
        },
        postCancel() {
            return __awaiter(this, void 0, void 0, function* () {
                yield ebb.setPenHeight(planning_1.Device.Axidraw.penPctToPos(0), 1000);
                yield ebb.command("HM,5000");
            });
        },
        postPlot() {
            return __awaiter(this, void 0, void 0, function* () {
                yield ebb.waitUntilMotorsIdle();
                yield ebb.disableMotors();
            });
        },
    };
    const simPlotter = {
        prePlot(_initialPenHeight) {
            return __awaiter(this, void 0, void 0, function* () { });
        },
        executeMotion(motion, progress) {
            return __awaiter(this, void 0, void 0, function* () {
                console.log(`Motion ${progress[0] + 1}/${progress[1]}`);
                yield new Promise((resolve) => setTimeout(resolve, motion.duration() * 1000));
            });
        },
        postCancel() {
            return __awaiter(this, void 0, void 0, function* () {
                console.log("Plot cancelled");
            });
        },
        postPlot() {
            return __awaiter(this, void 0, void 0, function* () { });
        },
    };
    function doPlot(plotter, plan) {
        return __awaiter(this, void 0, void 0, function* () {
            cancelRequested = false;
            limpRequested = false;
            unpaused = null;
            signalUnpause = null;
            motionIdx = 0;
            const firstPenMotion = plan.motions.find((x) => x instanceof planning_1.PenMotion);
            yield plotter.prePlot(firstPenMotion.initialPos);
            let penIsUp = true;
            for (const motion of plan.motions) {
                broadcast({ c: "progress", p: { motionIdx } });
                yield plotter.executeMotion(motion, [motionIdx, plan.motions.length]);
                if (motion instanceof planning_1.PenMotion) {
                    penIsUp = motion.initialPos < motion.finalPos;
                }
                if (unpaused && penIsUp) {
                    yield unpaused;
                    broadcast({ c: "pause", p: { paused: false } });
                }
                if (cancelRequested || limpRequested) {
                    break;
                }
                motionIdx += 1;
            }
            motionIdx = null;
            currentPlan = null;
            if (cancelRequested) {
                yield plotter.postCancel();
                broadcast({ c: "cancelled" });
                cancelRequested = false;
            }
            else {
                broadcast({ c: "finished" });
            }
            yield plotter.postPlot();
        });
    }
    function connect() {
        var e_1, _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                for (var _b = __asyncValues(ebbs(device)), _c; _c = yield _b.next(), !_c.done;) {
                    const d = _c.value;
                    ebb = d;
                    broadcast({ c: "dev", p: { path: ebb ? ebb.port.path : null } });
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        });
    }
    return {
        wss,
        rest: app,
        connect,
    };
}
exports.standalone = standalone;
function tryOpen(path) {
    return new Promise((resolve, reject) => {
        const port = new serialport_1.default(path);
        port.on("open", () => {
            port.removeAllListeners();
            resolve(port);
        });
        port.on("error", (e) => {
            port.removeAllListeners();
            reject(e);
        });
    });
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function waitForEbb() {
    return __awaiter(this, void 0, void 0, function* () {
        while (true) {
            const ebbs = yield ebb_1.EBB.list();
            if (ebbs.length) {
                return ebbs[0];
            }
            yield sleep(5000);
        }
    });
}
function ebbs(path) {
    return __asyncGenerator(this, arguments, function* ebbs_1() {
        while (true) {
            try {
                const com = path || (yield __await(waitForEbb()));
                console.log(`Found EBB at ${com}`);
                const port = yield __await(tryOpen(com));
                const closed = new Promise((resolve) => {
                    port.once("close", resolve);
                    port.once("error", resolve);
                });
                yield yield __await(new ebb_1.EBB(port));
                yield __await(closed);
                yield yield __await(null);
                console.error(`Lost connection to EBB, reconnecting...`);
            }
            catch (e) {
                console.error(`Error connecting to EBB: ${e.message}`);
                console.error(`Retrying in 5 seconds...`);
                yield __await(sleep(5000));
            }
        }
    });
}
function connectEBB(path) {
    return __awaiter(this, void 0, void 0, function* () {
        if (path) {
            return new ebb_1.EBB(new serialport_1.default(path));
        }
        else {
            const ebbs = yield ebb_1.EBB.list();
            if (ebbs.length) {
                return new ebb_1.EBB(new serialport_1.default(ebbs[0]));
            }
            else {
                return null;
            }
        }
    });
}
exports.connectEBB = connectEBB;
//# sourceMappingURL=server.js.map