"use strict";
// 创建新文件或覆盖已有文件
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
exports.createWriteTool = createWriteTool;
var promises_1 = require("fs/promises");
var path_1 = require("path");
function createWriteTool(cwd) {
    return {
        name: "write",
        description: "Create a new file or overwrite an existing file. Automatically creates parent directories if they don't exist.",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the file (relative or absolute)",
                },
                content: {
                    type: "string",
                    description: "Content to write to the file",
                },
            },
            required: ["path", "content"],
        },
        execute: function (input) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, path, content, fullPath;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _a = input, path = _a.path, content = _a.content;
                            fullPath = (0, path_1.resolve)(cwd, path);
                            // 先校验目录是否存在，如果不存在则创建目录
                            return [4 /*yield*/, (0, promises_1.mkdir)((0, path_1.dirname)(fullPath), { recursive: true })];
                        case 1:
                            // 先校验目录是否存在，如果不存在则创建目录
                            _b.sent(); // recursive: true 如果父目录不存在，自动创建所有层级
                            // 创建完目录后，创建文件并写入字节内容，内容按照 utf-8 编码
                            return [4 /*yield*/, (0, promises_1.writeFile)(fullPath, content, "utf-8")];
                        case 2:
                            // 创建完目录后，创建文件并写入字节内容，内容按照 utf-8 编码
                            _b.sent();
                            return [2 /*return*/, "Successfully wrote ".concat(content.length, " bytes to ").concat(path)];
                    }
                });
            });
        },
    };
}
