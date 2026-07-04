import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const piAiSrc = resolve(__dirname, "packages/ai/src");

export default defineConfig({
	test: {
		include: ["vivlos/**/*.test.ts"],
	},
	resolve: {
		alias: [
			// ── vivlos 内部 alias（对应 tsconfig.json paths）──
			// 精确匹配子路径要在通配之前
			{
				find: "@vivlos/shared/utils/id.ts",
				replacement: resolve(__dirname, "vivlos/shared/utils/id.ts"),
			},
			{
				find: "@vivlos/shared/utils/time.ts",
				replacement: resolve(__dirname, "vivlos/shared/utils/time.ts"),
			},
			{
				find: "@vivlos/shared/utils",
				replacement: resolve(__dirname, "vivlos/shared/utils/index.ts"),
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
			// ── pi SDK alias ──
			{
				find: "@earendil-works/pi-ai/providers/all",
				replacement: resolve(piAiSrc, "providers/all.ts"),
			},
			{
				find: "@earendil-works/pi-ai/compat",
				replacement: resolve(piAiSrc, "compat.ts"),
			},
			{
				find: /^@earendil-works\/pi-ai$/,
				replacement: resolve(piAiSrc, "index.ts"),
			},
			{
				find: /^@earendil-works\/pi-agent-core$/,
				replacement: resolve(__dirname, "packages/agent/src/index.ts"),
			},
			{
				find: /^@earendil-works\/pi-tui$/,
				replacement: resolve(__dirname, "packages/tui/src/index.ts"),
			},
		],
	},
});