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
exports.cli = void 0;
const yargs_1 = __importDefault(require("yargs"));
const server_1 = require("./server");
const massager_1 = require("./massager");
const svgdom_1 = require("svgdom");
const fs = __importStar(require("fs"));
const flatten_svg_1 = require("flatten-svg");
const util_1 = require("./util");
const planning_1 = require("./planning");
const paper_size_1 = require("./paper-size");
function parseSvg(svg) {
    const window = new svgdom_1.Window;
    window.document.documentElement.innerHTML = svg;
    return window.document.documentElement;
}
function cli(argv) {
    yargs_1.default.strict()
        .option("device", {
        alias: "d",
        describe: "device to connect to",
        type: "string"
    })
        .command('$0', 'run the saxi web server', yargs => yargs
        .option("port", {
        alias: "p",
        default: Number(process.env.PORT || 9080),
        describe: "TCP port on which to listen",
        type: "number"
    })
        .option("enable-cors", {
        describe: "enable cross-origin resource sharing (CORS)",
        type: "boolean"
    })
        .option("max-payload-size", {
        describe: "maximum payload size to accept",
        default: "200 mb",
        type: "string"
    })
        .option("firmware-version", {
        describe: "print the device's firmware version and exit",
        type: "boolean"
    }), args => {
        if (args["firmware-version"]) {
            server_1.connectEBB(args.device).then((ebb) => __awaiter(this, void 0, void 0, function* () {
                if (!ebb) {
                    console.error(`No EBB connected`);
                    return process.exit(1);
                }
                const fwv = yield ebb.firmwareVersion();
                console.log(fwv);
                yield ebb.close();
            }));
        }
        else {
            server_1.startServer(args.port, args.device, args["enable-cors"], args["max-payload-size"]);
        }
    })
        .command('plot <file>', 'plot an svg, then exit', yargs => yargs
        .positional("file", {
        type: "string",
        description: "File to plot",
    })
        .option("paper-size", {
        alias: "s",
        describe: "Paper size to use",
        coerce: (value) => {
            if (Object.prototype.hasOwnProperty.call(paper_size_1.PaperSize.standard, value)) {
                return paper_size_1.PaperSize.standard[value];
            }
            else {
                const m = /^([0-9]*(?:\.[0-9]+)?)\s*x\s*([0-9]*(?:\.[0-9]+)?)\s*(cm|mm|in)$/i.exec(String(value).trim());
                if (m) {
                    return new paper_size_1.PaperSize({ x: Number(m[1]), y: Number(m[2]) });
                }
            }
            throw new Error(`Paper size should be a standard size (${Object.keys(paper_size_1.PaperSize.standard).join(", ")}) or a custom size such as "100x100mm" or "16x10in"`);
        },
        required: true
    })
        .option("landscape", {
        type: "boolean",
        description: "Place the long side of the paper on the x-axis"
    })
        .option("portrait", {
        type: "boolean",
        description: "Place the short side of the paper on the x-axis"
    })
        .option("margin", {
        describe: "Margin (in mm)",
        type: "number",
        default: planning_1.defaultPlanOptions.marginMm,
        required: false
    })
        .option("pen-down-height", {
        describe: "Pen down height (%)",
        type: "number",
        default: planning_1.defaultPlanOptions.penDownHeight,
        required: false
    })
        .option("pen-up-height", {
        describe: "Pen up height (%)",
        type: "number",
        default: planning_1.defaultPlanOptions.penUpHeight,
        required: false
    })
        .option("pen-down-acceleration", {
        describe: "Acceleration when the pen is down (in mm/s^2)",
        type: "number",
        default: planning_1.defaultPlanOptions.penDownAcceleration,
        required: false
    })
        .option("pen-down-max-velocity", {
        describe: "Maximum velocity when the pen is down (in mm/s)",
        type: "number",
        default: planning_1.defaultPlanOptions.penDownMaxVelocity,
        required: false
    })
        .option("pen-down-cornering-factor", {
        describe: "Cornering factor when the pen is down",
        type: "number",
        default: planning_1.defaultPlanOptions.penDownCorneringFactor,
        required: false
    })
        .option("pen-up-acceleration", {
        describe: "Acceleration when the pen is up (in mm/s^2)",
        type: "number",
        default: planning_1.defaultPlanOptions.penUpAcceleration,
        required: false
    })
        .option("pen-up-max-velocity", {
        describe: "Maximum velocity when the pen is up (in mm/s)",
        type: "number",
        default: planning_1.defaultPlanOptions.penUpMaxVelocity,
        required: false
    })
        .option("pen-drop-duration", {
        describe: "How long the pen takes to drop (in seconds)",
        type: "number",
        default: planning_1.defaultPlanOptions.penDropDuration,
        required: false
    })
        .option("pen-lift-duration", {
        describe: "How long the pen takes to lift (in seconds)",
        type: "number",
        default: planning_1.defaultPlanOptions.penLiftDuration,
        required: false
    })
        .option("sort-paths", {
        describe: "Re-order paths to minimize pen-up travel time",
        type: "boolean",
        default: true,
    })
        .option("fit-page", {
        describe: "Re-scale and position the image to fit on the page",
        type: "boolean",
        default: true,
    })
        .option("crop-to-margins", {
        describe: "Remove lines that fall outside the margins",
        type: "boolean",
        default: true,
    })
        .option("minimum-path-length", {
        describe: "Remove paths that are shorter than this length (in mm)",
        type: "number",
        default: planning_1.defaultPlanOptions.minimumPathLength
    })
        .option("point-join-radius", {
        describe: "Point-joining radius (in mm)",
        type: "number",
        default: planning_1.defaultPlanOptions.pointJoinRadius
    })
        .option("path-join-radius", {
        describe: "Path-joining radius (in mm)",
        type: "number",
        default: planning_1.defaultPlanOptions.pathJoinRadius
    })
        .check((args) => {
        if (args.landscape && args.portrait) {
            throw new Error("Only one of --portrait and --landscape may be specified");
        }
        return true;
    }), (args) => __awaiter(this, void 0, void 0, function* () {
        console.log("reading svg...");
        const svg = fs.readFileSync(args.file, 'utf8');
        console.log("parsing svg...");
        const parsed = parseSvg(svg);
        console.log("flattening svg...");
        const lines = flatten_svg_1.flattenSVG(parsed, {});
        console.log("generating motion plan...");
        const paperSize = args.landscape ? args['paper-size'].landscape
            : args.portrait ? args['paper-size'].portrait
                : args['paper-size'];
        const planOptions = {
            paperSize,
            marginMm: args.margin,
            selectedGroupLayers: new Set([]),
            selectedStrokeLayers: new Set([]),
            layerMode: "all",
            penUpHeight: args["pen-up-height"],
            penDownHeight: args["pen-down-height"],
            penDownAcceleration: args["pen-down-acceleration"],
            penDownMaxVelocity: args["pen-down-max-velocity"],
            penDownCorneringFactor: args["pen-down-cornering-factor"],
            penUpAcceleration: args["pen-up-acceleration"],
            penUpMaxVelocity: args["pen-up-max-velocity"],
            penDropDuration: args["pen-drop-duration"],
            penLiftDuration: args["pen-lift-duration"],
            sortPaths: args["sort-paths"],
            fitPage: args["fit-page"],
            cropToMargins: args["crop-to-margins"],
            minimumPathLength: args["minimum-path-length"],
            pathJoinRadius: args["path-join-radius"],
            pointJoinRadius: args["point-join-radius"],
        };
        const p = massager_1.replan(linesToVecs(lines), planOptions);
        console.log(`${p.motions.length} motions, estimated duration: ${util_1.formatDuration(p.duration())}`);
        console.log("connecting to plotter...");
        const ebb = yield server_1.connectEBB(args.device);
        if (!ebb) {
            console.error("Couldn't connect to device!");
            process.exit(1);
        }
        console.log("plotting...");
        ebb.executePlan(p);
        console.log("done!");
    }))
        .parse(argv);
}
exports.cli = cli;
function linesToVecs(lines) {
    return lines.map((line) => {
        const a = line.points.map(([x, y]) => ({ x, y }));
        a.stroke = line.stroke;
        a.groupId = line.groupId;
        return a;
    });
}
//# sourceMappingURL=cli.js.map