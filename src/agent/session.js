"use strict";
// 封装 AgentLoop，提供更简单的 prompt() 接口 API，管理 system prormpt
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentSession = void 0;
var loop_ts_1 = require("./loop.ts");
var AgentSession = /** @class */ (function () {
    function AgentSession(options) {
        var _a;
        this.systemInjected = false; // 控制 「 system prompt 只注入一次 」 的行为，确保 system prompt 在整个会话生命周期只出现一次
        // 如果没有显式传入指定的系统提示词，则默认的系统提示词为指定 agent 为编程 agent 助手
        this.systemPrompt =
            (_a = options.systemPrompt) !== null && _a !== void 0 ? _a : "\n    You are a helpful coding agent with access to file system tools.\n    When you need to read, write, edit files or execute shell commands,\n    use the appropriate tools. Otherwise, answer directly.\n    ";
        this.loop = new loop_ts_1.AgentLoop({
            provider: options.provider,
            registry: options.registry,
            model: options.model,
        });
    }
    AgentSession.prototype.prompt = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var messages, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.systemInjected) {
                            messages = this.loop["messages"];
                            messages.unshift({ role: "system", content: this.systemPrompt }); // unshift：在数组头部插入一个或多个元素，system prompt 一般作为消息列表中的第一条消息
                            this.systemInjected = true;
                        }
                        return [4 /*yield*/, this.loop.run(input)];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response.content];
                }
            });
        });
    };
    return AgentSession;
}());
exports.AgentSession = AgentSession;
