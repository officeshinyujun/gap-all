"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var openai_1 = __importDefault(require("openai"));
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var dotenv = __importStar(require("dotenv"));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
var API_KEYS = [
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY2,
    process.env.OPENAI_API_KEY3,
].filter(function (k) { return typeof k === 'string' && k.length > 0; });
if (API_KEYS.length === 0) {
    console.error('API keys are missing in .env');
    process.exit(1);
}
var clients = API_KEYS.map(function (key) { return new openai_1.default({ apiKey: key }); });
var clientIndex = 0;
function getNextClient() {
    var client = clients[clientIndex % clients.length];
    clientIndex++;
    return client;
}
var PROMPT_PATH = path.resolve(__dirname, '..', '..', 'prompts', 'concept_highlight_v2.txt');
var DATA_DIR = path.resolve(__dirname, '..', '..', 'textbook', 'kongil_cards_moi');
var MODEL = 'gpt-4o';
var CONCURRENCY = 2;
var systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
function generateHighlight(task) {
    return __awaiter(this, void 0, void 0, function () {
        var concept, realQ, client, userContent, response, content, e_1;
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    concept = task.concept, realQ = task.realQ;
                    client = getNextClient();
                    userContent = JSON.stringify({
                        concept_name: concept.name,
                        concept_definition: ((_a = concept.card) === null || _a === void 0 ? void 0 : _a.definition) || '',
                        question_stem: ((_b = realQ.render_ready) === null || _b === void 0 ? void 0 : _b.question_stem) || realQ.stem || '',
                        stimulus: ((_c = realQ.render_ready) === null || _c === void 0 ? void 0 : _c.stimulus_data)
                            ? JSON.stringify(realQ.render_ready.stimulus_data)
                            : realQ.stimulus || '',
                        options: ((_d = realQ.render_ready) === null || _d === void 0 ? void 0 : _d.options_list) || realQ.options || [],
                        correct_answer: parseCorrectAnswer((_e = realQ.correct_answer) !== null && _e !== void 0 ? _e : realQ.answer),
                        combo_items: realQ.box_items || [],
                    });
                    _j.label = 1;
                case 1:
                    _j.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, client.chat.completions.create({
                            model: MODEL,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userContent },
                            ],
                            temperature: 0.3,
                        })];
                case 2:
                    response = _j.sent();
                    content = (_h = (_g = (_f = response.choices[0]) === null || _f === void 0 ? void 0 : _f.message) === null || _g === void 0 ? void 0 : _g.content) !== null && _h !== void 0 ? _h : '';
                    return [2 /*return*/, extractJson(content)];
                case 3:
                    e_1 = _j.sent();
                    console.error("  \u2717 [".concat(concept.name, "] API \uC624\uB958: ").concat(e_1.message));
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function parseCorrectAnswer(value) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string') {
        var map = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
        if (map[value])
            return map[value];
        var num = parseInt(value.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num >= 1 && num <= 5)
            return num;
    }
    return 1;
}
function extractJson(text) {
    var codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    var raw = codeBlock ? codeBlock[1].trim() : text.trim();
    return JSON.parse(raw);
}
function processBatch(tasks) {
    return __awaiter(this, void 0, void 0, function () {
        var results, i, batch, promises, batchResults, batchResults_1, batchResults_1_1, result, task, highlight;
        var e_2, _a;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    results = new Map();
                    i = 0;
                    _b.label = 1;
                case 1:
                    if (!(i < tasks.length)) return [3 /*break*/, 5];
                    batch = tasks.slice(i, i + CONCURRENCY);
                    promises = batch.map(function (task) { return __awaiter(_this, void 0, void 0, function () {
                        var highlight;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, generateHighlight(task)];
                                case 1:
                                    highlight = _a.sent();
                                    if (highlight) {
                                        console.log("  \u2713 ".concat(task.concept.name, " (\uB2E8\uC11C ").concat(highlight.stimulusClues.length, "\uAC1C, \uD480\uC774 ").concat(highlight.solvingFlow.length, "\uB2E8\uACC4)"));
                                        return [2 /*return*/, { task: task, highlight: highlight }];
                                    }
                                    return [2 /*return*/, null];
                            }
                        });
                    }); });
                    return [4 /*yield*/, Promise.all(promises)];
                case 2:
                    batchResults = _b.sent();
                    try {
                        for (batchResults_1 = (e_2 = void 0, __values(batchResults)), batchResults_1_1 = batchResults_1.next(); !batchResults_1_1.done; batchResults_1_1 = batchResults_1.next()) {
                            result = batchResults_1_1.value;
                            if (!result)
                                continue;
                            task = result.task, highlight = result.highlight;
                            if (!results.has(task.filePath))
                                results.set(task.filePath, []);
                            results.get(task.filePath).push({ idx: task.conceptIdx, highlight: highlight });
                        }
                    }
                    catch (e_2_1) { e_2 = { error: e_2_1 }; }
                    finally {
                        try {
                            if (batchResults_1_1 && !batchResults_1_1.done && (_a = batchResults_1.return)) _a.call(batchResults_1);
                        }
                        finally { if (e_2) throw e_2.error; }
                    }
                    if (!(i + CONCURRENCY < tasks.length)) return [3 /*break*/, 4];
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 300); })];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4:
                    i += CONCURRENCY;
                    return [3 /*break*/, 1];
                case 5: return [2 /*return*/, results];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var files, allTasks, files_1, files_1_1, file, filePath, data, i, concept, realQ, results, savedCount, results_1, results_1_1, _a, filePath, highlights, data, highlights_1, highlights_1_1, _b, idx, highlight;
        var e_3, _c, e_4, _d, e_5, _e;
        var _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    files = fs.readdirSync(DATA_DIR).filter(function (f) { return f.endsWith('.json') && !f.startsWith('_'); });
                    allTasks = [];
                    try {
                        for (files_1 = __values(files), files_1_1 = files_1.next(); !files_1_1.done; files_1_1 = files_1.next()) {
                            file = files_1_1.value;
                            filePath = path.join(DATA_DIR, file);
                            data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                            if (!data.concepts)
                                continue;
                            for (i = 0; i < data.concepts.length; i++) {
                                concept = data.concepts[i];
                                realQ = (_f = concept.realQuestion) === null || _f === void 0 ? void 0 : _f.questionData;
                                if (!realQ)
                                    continue;
                                if (concept.realQuestion.conceptHighlightV2)
                                    continue; // already processed
                                allTasks.push({ filePath: filePath, conceptIdx: i, concept: concept, realQ: realQ });
                            }
                        }
                    }
                    catch (e_3_1) { e_3 = { error: e_3_1 }; }
                    finally {
                        try {
                            if (files_1_1 && !files_1_1.done && (_c = files_1.return)) _c.call(files_1);
                        }
                        finally { if (e_3) throw e_3.error; }
                    }
                    console.log("\uCD1D ".concat(allTasks.length, "\uAC1C concept \uCC98\uB9AC \uC608\uC815 (\uBCD1\uB82C ").concat(CONCURRENCY, ", API\uD0A4 ").concat(API_KEYS.length, "\uAC1C)\n"));
                    if (allTasks.length === 0) {
                        console.log('처리할 항목 없음. 이미 모두 완료됨.');
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, processBatch(allTasks)];
                case 1:
                    results = _g.sent();
                    savedCount = 0;
                    try {
                        for (results_1 = __values(results), results_1_1 = results_1.next(); !results_1_1.done; results_1_1 = results_1.next()) {
                            _a = __read(results_1_1.value, 2), filePath = _a[0], highlights = _a[1];
                            data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                            try {
                                for (highlights_1 = (e_5 = void 0, __values(highlights)), highlights_1_1 = highlights_1.next(); !highlights_1_1.done; highlights_1_1 = highlights_1.next()) {
                                    _b = highlights_1_1.value, idx = _b.idx, highlight = _b.highlight;
                                    data.concepts[idx].realQuestion.conceptHighlightV2 = highlight;
                                    savedCount++;
                                }
                            }
                            catch (e_5_1) { e_5 = { error: e_5_1 }; }
                            finally {
                                try {
                                    if (highlights_1_1 && !highlights_1_1.done && (_e = highlights_1.return)) _e.call(highlights_1);
                                }
                                finally { if (e_5) throw e_5.error; }
                            }
                            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
                            console.log("\uD83D\uDCBE ".concat(path.basename(filePath), " \uC800\uC7A5 (").concat(highlights.length, "\uAC1C \uC5C5\uB370\uC774\uD2B8)"));
                        }
                    }
                    catch (e_4_1) { e_4 = { error: e_4_1 }; }
                    finally {
                        try {
                            if (results_1_1 && !results_1_1.done && (_d = results_1.return)) _d.call(results_1);
                        }
                        finally { if (e_4) throw e_4.error; }
                    }
                    console.log("\n========================================");
                    console.log("\uC644\uB8CC: ".concat(savedCount, "/").concat(allTasks.length, " \uC131\uACF5, ").concat(allTasks.length - savedCount, "\uAC1C \uC2E4\uD328"));
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(console.error);
