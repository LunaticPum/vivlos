"use strict";
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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
var openai_1 = require("openai");
var OpenAIProvider = /** @class */ (function () {
    function OpenAIProvider(baseURL) {
        var apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("请设置 OPENAI_API_KEY 环境变量");
        }
        this.client = new openai_1.default({
            apiKey: apiKey,
            baseURL: baseURL !== null && baseURL !== void 0 ? baseURL : "https://api.openai.com/v1",
        });
    }
    /**
     * 以流式方式调用 LLM，逐块返回响应事件
     * @param options 调用参数（模型、消息、工具列表、取消信号等）
     * @yields ChatEvent 流式事件：文本增量、工具调用、完成通知或错误
     */
    OpenAIProvider.prototype.chat = function (options) {
        return __asyncGenerator(this, arguments, function chat_1() {
            var openaiMessage, tools, stream, toolCallAccumulator, _a, stream_1, stream_1_1, chunk, delta, _i, _b, tc_delta, finishReason, calls, e_1_1, err_1;
            var _c, e_1, _d, _e;
            var _f, _g, _h, _j, _k;
            return __generator(this, function (_l) {
                switch (_l.label) {
                    case 0:
                        _l.trys.push([0, 22, , 25]);
                        openaiMessage = options.message.map(toOpenAIMessage);
                        tools = (_f = options.tools) === null || _f === void 0 ? void 0 : _f.map(function (t) { return ({
                            type: "function",
                            function: {
                                name: t.name,
                                description: t.description,
                                parameters: t.parameters,
                            },
                        }); });
                        return [4 /*yield*/, __await(this.client.chat.completions.create({
                                model: options.model,
                                messages: openaiMessage,
                                tools: tools,
                                stream: true,
                            }))];
                    case 1:
                        stream = _l.sent();
                        toolCallAccumulator = new ToolCallAccumulator();
                        _l.label = 2;
                    case 2:
                        _l.trys.push([2, 15, 16, 21]);
                        _a = true, stream_1 = __asyncValues(stream);
                        _l.label = 3;
                    case 3: return [4 /*yield*/, __await(stream_1.next())];
                    case 4:
                        if (!(stream_1_1 = _l.sent(), _c = stream_1_1.done, !_c)) return [3 /*break*/, 14];
                        _e = stream_1_1.value;
                        _a = false;
                        chunk = _e;
                        delta = (_h = (_g = chunk.choices) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.delta;
                        if (!delta)
                            return [3 /*break*/, 13];
                        if (!delta.content) return [3 /*break*/, 7];
                        return [4 /*yield*/, __await({ type: "text_delta", delta: delta.content })];
                    case 5: return [4 /*yield*/, _l.sent()];
                    case 6:
                        _l.sent();
                        _l.label = 7;
                    case 7:
                        // 事件B: LLM 输出工具调用内容
                        if (delta.tool_calls) {
                            for (_i = 0, _b = delta.tool_calls; _i < _b.length; _i++) {
                                tc_delta = _b[_i];
                                toolCallAccumulator.add(tc_delta);
                            }
                        }
                        if (!((_k = (_j = chunk.choices) === null || _j === void 0 ? void 0 : _j[0]) === null || _k === void 0 ? void 0 : _k.finish_reason)) return [3 /*break*/, 13];
                        finishReason = chunk.choices[0].finish_reason;
                        if (!(finishReason == "tool_calls")) return [3 /*break*/, 10];
                        calls = toolCallAccumulator.getCalls();
                        if (!(calls.length > 0)) return [3 /*break*/, 10];
                        return [4 /*yield*/, __await({ type: "tool_calls", delta: calls })];
                    case 8: return [4 /*yield*/, _l.sent()];
                    case 9:
                        _l.sent();
                        _l.label = 10;
                    case 10: return [4 /*yield*/, __await({
                            type: "done",
                            usage: chunk.usage
                                ? {
                                    promptTokens: chunk.usage.prompt_tokens,
                                    completionTokens: chunk.usage.completion_tokens,
                                    totalTokens: chunk.usage.total_tokens,
                                }
                                : undefined,
                        })];
                    case 11: 
                    // 其他完成讯息原因 -> 通讯一般结束
                    return [4 /*yield*/, _l.sent()];
                    case 12:
                        // 其他完成讯息原因 -> 通讯一般结束
                        _l.sent();
                        _l.label = 13;
                    case 13:
                        _a = true;
                        return [3 /*break*/, 3];
                    case 14: return [3 /*break*/, 21];
                    case 15:
                        e_1_1 = _l.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 21];
                    case 16:
                        _l.trys.push([16, , 19, 20]);
                        if (!(!_a && !_c && (_d = stream_1.return))) return [3 /*break*/, 18];
                        return [4 /*yield*/, __await(_d.call(stream_1))];
                    case 17:
                        _l.sent();
                        _l.label = 18;
                    case 18: return [3 /*break*/, 20];
                    case 19:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 20: return [7 /*endfinally*/];
                    case 21: return [3 /*break*/, 25];
                    case 22:
                        err_1 = _l.sent();
                        return [4 /*yield*/, __await({
                                type: "error",
                                error: err_1 instanceof Error ? err_1 : new Error(String(err_1)),
                            })];
                    case 23: 
                    // try {} 可能抛出多种结果，统一转为 Error 对象抛出去
                    return [4 /*yield*/, _l.sent()];
                    case 24:
                        // try {} 可能抛出多种结果，统一转为 Error 对象抛出去
                        _l.sent();
                        return [3 /*break*/, 25];
                    case 25: return [2 /*return*/];
                }
            });
        });
    };
    return OpenAIProvider;
}());
exports.OpenAIProvider = OpenAIProvider;
function toOpenAIMessage(msg) {
    var _a;
    switch (msg.role) {
        case "user":
            return { role: msg.role, content: msg.content };
        case "system":
            return { role: msg.role, content: msg.content };
        case "assistant":
            return {
                role: msg.role,
                content: msg.content,
                tool_calls: (_a = msg.tool_calls) === null || _a === void 0 ? void 0 : _a.map(function (tc) { return ({
                    id: tc.id,
                    type: "function",
                    function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.arguments),
                    },
                }); }),
            };
        case "tool":
            return {
                role: msg.role,
                content: msg.content,
                tool_call_id: msg.tool_call_id,
            };
    }
}
var ToolCallAccumulator = /** @class */ (function () {
    function ToolCallAccumulator() {
        this.accum = new Map();
    }
    ToolCallAccumulator.prototype.add = function (tc) {
        var _a, _b, _c;
        var index = tc.index;
        // 获取某次 toolCall 消息的历史增量消息
        var existing = (_a = this.accum.get(index)) !== null && _a !== void 0 ? _a : {
            id: "",
            name: "",
            arguments: "",
        };
        // 拼接最新的chunk中携带的 toolCall 增量消息
        if (tc.id)
            existing.id += tc.id;
        if ((_b = tc.function) === null || _b === void 0 ? void 0 : _b.name)
            existing.name += tc.function.name;
        if ((_c = tc.function) === null || _c === void 0 ? void 0 : _c.arguments)
            existing.arguments += tc.function.arguments;
        // 更新某次 toolCall 的消息
        this.accum.set(index, existing);
    };
    ToolCallAccumulator.prototype.getCalls = function () {
        var result = [];
        for (var _i = 0, _a = this.accum; _i < _a.length; _i++) {
            var _b = _a[_i], index = _b[0], acc = _b[1];
            result.push({
                id: acc.id || "call_".concat(index),
                name: acc.name,
                arguments: JSON.parse(acc.arguments || "{}"),
            });
        }
        return result;
    };
    return ToolCallAccumulator;
}());
