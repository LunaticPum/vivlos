"use strict";
// Agent 核心循环——调 LLM → 执行工具 → 继续，直到 LLM 直接回答
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentLoop = void 0;
var AgentLoop = /** @class */ (function () {
    function AgentLoop(options) {
        this.messages = [];
        this.options = options;
    }
    /**
     * ReAct Loop
     */
    AgentLoop.prototype.run = function (userInput, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var allToolCalls, usage, toolCalls, finalContent, _a, _b, _c, event_1, e_1_1, _i, toolCalls_1, tc, result;
            var _d, e_1, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        // 1. 追加用户 prompt 到对话历史消息中
                        this.messages.push({
                            role: "user",
                            content: userInput,
                        });
                        allToolCalls = [];
                        _g.label = 1;
                    case 1:
                        if (!true) return [3 /*break*/, 19];
                        toolCalls = [];
                        finalContent = "";
                        _g.label = 2;
                    case 2:
                        _g.trys.push([2, 7, 8, 13]);
                        _a = true, _b = (e_1 = void 0, __asyncValues(this.options.provider.chat({
                            model: this.options.model,
                            message: this.messages,
                            tools: this.options.registry.getAll(),
                            signal: signal,
                        })));
                        _g.label = 3;
                    case 3: return [4 /*yield*/, _b.next()];
                    case 4:
                        if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3 /*break*/, 6];
                        _f = _c.value;
                        _a = false;
                        event_1 = _f;
                        switch (event_1.type) {
                            case "text_delta":
                                finalContent += event_1.delta;
                                break;
                            case "tool_calls":
                                toolCalls.push.apply(toolCalls, event_1.delta);
                                break;
                            case "done":
                                usage = event_1.usage;
                                break;
                            case "error":
                                throw event_1.error;
                        }
                        _g.label = 5;
                    case 5:
                        _a = true;
                        return [3 /*break*/, 3];
                    case 6: return [3 /*break*/, 13];
                    case 7:
                        e_1_1 = _g.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 13];
                    case 8:
                        _g.trys.push([8, , 11, 12]);
                        if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 10];
                        return [4 /*yield*/, _e.call(_b)];
                    case 9:
                        _g.sent();
                        _g.label = 10;
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 12: return [7 /*endfinally*/];
                    case 13:
                        if (!(toolCalls.length > 0)) return [3 /*break*/, 18];
                        // 追加 LLM Reasoning 响应到对话历史消息中
                        this.messages.push({
                            role: "assistant",
                            content: finalContent,
                            tool_calls: toolCalls,
                        });
                        _i = 0, toolCalls_1 = toolCalls;
                        _g.label = 14;
                    case 14:
                        if (!(_i < toolCalls_1.length)) return [3 /*break*/, 17];
                        tc = toolCalls_1[_i];
                        return [4 /*yield*/, this.options.registry.execute(tc.name, tc.arguments, signal)];
                    case 15:
                        result = _g.sent();
                        this.messages.push({
                            role: "tool",
                            content: result,
                            tool_call_id: tc.id,
                        });
                        _g.label = 16;
                    case 16:
                        _i++;
                        return [3 /*break*/, 14];
                    case 17:
                        allToolCalls.push.apply(allToolCalls, toolCalls); // 记录每轮循环调用的 tool
                        return [3 /*break*/, 1]; // 进入下一次 loop
                    case 18: 
                    // 2c. 没有工具调用，说明该轮 llm Reasoning 之后认为无须 Acting，循环结束
                    return [2 /*return*/, { content: finalContent, usage: usage, toolCalls: allToolCalls }];
                    case 19: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 获取当前对话的历史消息（只读）
     */
    AgentLoop.prototype.getMessage = function () {
        return this.messages;
    };
    return AgentLoop;
}());
exports.AgentLoop = AgentLoop;
