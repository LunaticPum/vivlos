/**
 * 图片附件工具测试。
 *
 * 覆盖：粘贴文本路径提取、扩展名白名单、存在性、大小上限、base64 编码。
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	extractImagePaths,
	loadImageAttachment,
	looksLikeImagePath,
	MAX_IMAGE_BYTES,
} from "@vivlos/shared/utils/image.ts";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "vivlos-image-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("looksLikeImagePath", () => {
	it("白名单扩展名命中", () => {
		expect(looksLikeImagePath("a.png")).toBe(true);
		expect(looksLikeImagePath("a.JPG")).toBe(true);
		expect(looksLikeImagePath("dir/photo.jpeg")).toBe(true);
		expect(looksLikeImagePath("x.gif")).toBe(true);
		expect(looksLikeImagePath("x.webp")).toBe(true);
	});

	it("非图片扩展名不命中", () => {
		expect(looksLikeImagePath("a.txt")).toBe(false);
		expect(looksLikeImagePath("a.md")).toBe(false);
		expect(looksLikeImagePath("noext")).toBe(false);
	});
});

describe("extractImagePaths", () => {
	it("按行提取并去除引号", () => {
		const pasted = `"C:\\pics\\a.png"\nD:\\pics\\b.jpg\n不是路径的一行`;
		expect(extractImagePaths(pasted)).toEqual([
			"C:\\pics\\a.png",
			"D:\\pics\\b.jpg",
		]);
	});

	it("处理 file:// 前缀", () => {
		const pasted = "file:///C:/pics/a.png";
		expect(extractImagePaths(pasted)).toEqual(["C:/pics/a.png"]);
	});

	it("无图片路径时返回空数组", () => {
		expect(extractImagePaths("普通文本粘贴")).toEqual([]);
		expect(extractImagePaths("")).toEqual([]);
	});
});

describe("loadImageAttachment", () => {
	it("成功读取 png 并返回 base64 与 mimeType", () => {
		const path = join(root, "test.png");
		writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

		const result = loadImageAttachment(path);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.mimeType).toBe("image/png");
		expect(result.value.name).toBe("test.png");
		expect(result.value.sizeBytes).toBe(4);
		expect(Buffer.from(result.value.data, "base64")[0]).toBe(0x89);
	});

	it("不支持的扩展名返回 unsupported_type", () => {
		const path = join(root, "test.bmp");
		writeFileSync(path, "x");

		const result = loadImageAttachment(path);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("unsupported_type");
	});

	it("文件不存在返回 not_found", () => {
		const result = loadImageAttachment(join(root, "missing.png"));

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("not_found");
	});

	it("超过大小上限返回 too_large", () => {
		const path = join(root, "big.png");
		writeFileSync(path, Buffer.alloc(MAX_IMAGE_BYTES + 1));

		const result = loadImageAttachment(path);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("too_large");
	});
});
