"use strict";
// CLI 入口——组装所有模块，接收用户输入并运行 Agent
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
require("dotenv/config");
var openai_ts_1 = require("./llm/openai.ts");
var registry_ts_1 = require("./tools/registry.ts");
var read_ts_1 = require("./tools/read.ts");
var write_ts_1 = require("./tools/write.ts");
var edit_ts_1 = require("./tools/edit.ts");
var bash_ts_1 = require("./tools/bash.ts");
var session_ts_1 = require("./agent/session.ts");
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var cwd, provider, registry, session, input, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cwd = process.cwd();
                    provider = new openai_ts_1.OpenAIProvider("https://api.deepseek.com");
                    registry = new registry_ts_1.ToolRegistry();
                    registry.register((0, read_ts_1.createReadTool)(cwd));
                    registry.register((0, write_ts_1.createWriteTool)(cwd));
                    registry.register((0, edit_ts_1.createEditTool)(cwd));
                    registry.register((0, bash_ts_1.createBashTool)(cwd));
                    session = new session_ts_1.AgentSession({
                        provider: provider,
                        registry: registry,
                        model: "deepseek-v4-flash",
                    });
                    input = process.argv.slice(2).join(" ");
                    if (!input) {
                        console.error("使用方式: npx tsx src/index.ts <提问消息>");
                        process.exit(1); // 退出码非零，表示进程异常退出，如果退出码 = 2，则表示进程被系统 SIGINT 信号中断（用户按 ctrl + c）
                    }
                    console.log("\n\u5C11\u5973\u7948\u7977\u4E2D...");
                    return [4 /*yield*/, session.prompt(input)];
                case 1:
                    response = _a.sent();
                    console.log(response);
                    return [2 /*return*/];
            }
        });
    });
}
// 全局未捕获异常兜底处理
main().catch(function (err) {
    console.error("错误:", err instanceof Error ? err.message : String(err));
    process.exit(1);
});
