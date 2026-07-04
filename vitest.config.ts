import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const piAiSrc = resolve(__dirname, "packages/ai/src");

export default defineConfig({
	test: {
		include: ["vivlos/**/*.test.ts"],
	},
	resolve: {
		alias: [
			// 精确匹配子路径要在通配之前
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