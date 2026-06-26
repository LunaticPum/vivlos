"use strict";
// 执行 shell 命令并返回输出结果
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
exports.createBashTool = createBashTool;
var child_process_1 = require("child_process");
var MAX_OUTPUT_LENGTH = 100000; // 最大输出字符数
function createBashTool(cwd) {
    return {
        name: "bash",
        description: "Execute a shell command. Returns stdout and stderr output.",
        parameters: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "Shell command to execute",
                },
                timeout: {
                    type: "number",
                    description: "Timeout in seconds. Command will be killed if it exceeds this limit.",
                },
            },
            required: ["command"],
        },
        execute: function (input, signal) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, command, timeout;
                return __generator(this, function (_b) {
                    _a = input, command = _a.command, timeout = _a.timeout;
                    return [2 /*return*/, new Promise(function (resolve, reject) {
                            // spawn(command, args, options) 开启子进程执行 shell 命令
                            var child = (0, child_process_1.spawn)(command, [], {
                                cwd: cwd, // 子进程的工作目录
                                shell: true, // 通过系统 shell 来解释命令
                                stdio: ["ignore", "pipe", "pipe"], // 标准输入输出的配置，分别对应 stdin / stdout / stderr，这里 "ignore" 表示主进程不会给子进程输入任何东西
                            });
                            var stdout = "";
                            var stderr = "";
                            // 主进程接收子进程通过管道传输的二进制流并拼接为字符串
                            child.stdout.on("data", function (data) {
                                stdout += data.toString();
                            });
                            child.stderr.on("data", function (data) {
                                stderr += data.toString();
                            });
                            // 超时处理
                            var timeoutId;
                            if (timeout) {
                                timeoutId = setTimeout(function () {
                                    // 超时则杀死子进程，并拒绝接收该任务的后续结果
                                    child.kill();
                                    reject(new Error("Command timed out after ".concat(timeout, "s")));
                                }, timeout * 1000);
                            }
                            // 外部中止信号
                            var onAbort = function () {
                                child.kill();
                                reject(new Error("Command aborted"));
                            };
                            signal === null || signal === void 0 ? void 0 : signal.addEventListener("abort", onAbort, { once: true }); // 用户按了 Ctrl + c 则发起一个 abort 事件；once: true表示该监听器是一次性监听器
                            // 命令执行结束
                            child.on("close", function (exitCode) {
                                // 退出进程前及时关闭资源
                                if (timeoutId)
                                    clearTimeout(timeoutId);
                                if (signal)
                                    signal.removeEventListener("abort", onAbort);
                                // 两种管道输出都要做超限截断，避免出现上下文被大量注入
                                var output = stdout.slice(0, MAX_OUTPUT_LENGTH);
                                var errorOutput = stderr.slice(0, MAX_OUTPUT_LENGTH);
                                // 如果出现截断，对截断输出的文本内容尾部添加截断解释，以防歧义
                                if (stdout.length > MAX_OUTPUT_LENGTH) {
                                    output += "\n... (output truncated, ".concat(stdout.length - MAX_OUTPUT_LENGTH, " more bytes)");
                                }
                                if (stderr.length > MAX_OUTPUT_LENGTH) {
                                    errorOutput += "\n... (errorOutput truncated, ".concat(stderr.length - MAX_OUTPUT_LENGTH, " more bytes)");
                                }
                                var result = "Exit code: ".concat(exitCode);
                                if (output)
                                    result += "\n\nStdout:\n".concat(output);
                                if (errorOutput)
                                    result += "\n\nStderr:\n".concat(errorOutput);
                                // 将结果传回调用方
                                resolve(result);
                            });
                            child.on("error", function (err) {
                                if (timeoutId)
                                    clearTimeout(timeoutId);
                                if (signal)
                                    signal.removeEventListener("abort", onAbort);
                                reject(err);
                            });
                        })];
                });
            });
        },
    };
}
