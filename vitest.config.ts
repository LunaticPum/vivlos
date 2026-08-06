import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	test: {
		include: ["vivlos/tests/**/*.test.ts"],
	},
	resolve: {
		alias: [
			// ── vivlos 内部 alias（对应 tsconfig.json paths）──
			// 精确匹配子路径要在通配之前
			{
				find: /^@vivlos\/shared\/utils$/,
				replacement: resolve(__dirname, "vivlos/shared/utils/index.ts"),
			},
			{
				find: /^@vivlos\/shared\/utils\/(.+)$/,
				replacement: resolve(__dirname, "vivlos/shared/utils/$1"),
			},
			{
				find: /^@vivlos\/shared$/,
				replacement: resolve(__dirname, "vivlos/shared/index.ts"),
			},
			{
				find: /^@vivlos\/shared\/(.+)$/,
				replacement: resolve(__dirname, "vivlos/shared/$1"),
			},
			{
				find: /^@vivlos\/infra$/,
				replacement: resolve(__dirname, "vivlos/infra/index.ts"),
			},
			{
				find: /^@vivlos\/infra\/(.+)$/,
				replacement: resolve(__dirname, "vivlos/infra/$1"),
			},
			{
				find: /^@vivlos\/agent$/,
				replacement: resolve(__dirname, "vivlos/agent/index.ts"),
			},
			{
				find: /^@vivlos\/agent\/(.+)$/,
				replacement: resolve(__dirname, "vivlos/agent/$1"),
			},
			{
				find: /^@vivlos\/entries$/,
				replacement: resolve(__dirname, "vivlos/entries/index.ts"),
			},
			{
				find: /^@vivlos\/entries\/(.+)$/,
				replacement: resolve(__dirname, "vivlos/entries/$1"),
			},
			// pi SDK 从 node_modules 正常解析，无需 alias
		],
	},
});
