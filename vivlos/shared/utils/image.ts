/**
 * 图片附件处理。
 *
 * 负责把本地图片文件转换为 pi-ai 的 ImageContent 所需形态：
 * 路径校验（扩展名白名单 + 存在性 + 大小上限）→ base64 + mimeType。
 * 同时提供从粘贴文本中提取图片路径的辅助（终端拖入文件 = 粘贴路径）。
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, resolve } from "node:path";
import { err, ok, type Result } from "@vivlos/shared";

// #region 契约

export interface ImageAttachment {
	/** 绝对路径 */
	readonly path: string;
	/** 文件名（用于界面展示） */
	readonly name: string;
	readonly mimeType: string;
	/** base64 编码的图片数据 */
	readonly data: string;
	readonly sizeBytes: number;
}

export type ImageAttachmentError =
	| { readonly code: "not_found"; readonly message: string }
	| { readonly code: "unsupported_type"; readonly message: string }
	| { readonly code: "too_large"; readonly message: string }
	| { readonly code: "read_failed"; readonly message: string };

// #endregion

// #region 常量

const MIME_BY_EXT: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
};

/** 图片大小上限 4MB（对齐主流 Provider 的附件限制） */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// #endregion

// #region 路径提取

/** 判断单个字符串是否看起来是图片路径（扩展名白名单）。 */
export function looksLikeImagePath(text: string): boolean {
	const ext = extname(text).toLowerCase();
	return ext in MIME_BY_EXT;
}

/**
 * 从粘贴文本中提取候选图片路径。
 *
 * 终端拖入文件会转换为路径粘贴；不同终端可能带引号、file:// 前缀，
 * 多文件拖入通常按行分隔。逐行解析，只保留扩展名命中白名单的行。
 */
export function extractImagePaths(pasted: string): string[] {
	const paths: string[] = [];
	for (const rawLine of pasted.split(/\r?\n/)) {
		let line = rawLine.trim();
		if (!line) continue;
		// 去除包裹引号
		if (
			(line.startsWith('"') && line.endsWith('"')) ||
			(line.startsWith("'") && line.endsWith("'"))
		) {
			line = line.slice(1, -1).trim();
		}
		// 去除 file:// 前缀
		if (line.startsWith("file://")) {
			line = decodeURIComponent(line.slice("file://".length));
			// Windows 下 file:///C:/... 去掉前导斜杠
			if (/^\/[A-Za-z]:/.test(line)) line = line.slice(1);
		}
		if (!looksLikeImagePath(line)) continue;
		paths.push(line);
	}
	return paths;
}

// #endregion

// #region 附件加载

/**
 * 读取本地图片并构造附件。
 *
 * 相对路径基于 process.cwd() 解析。校验顺序：
 * 扩展名白名单 → 文件存在 → 大小上限 → 读取编码。
 */
export function loadImageAttachment(
	inputPath: string,
): Result<ImageAttachment, ImageAttachmentError> {
	const ext = extname(inputPath).toLowerCase();
	const mimeType = MIME_BY_EXT[ext];
	if (!mimeType) {
		return err({
			code: "unsupported_type",
			message: `不支持的图片格式 "${ext || inputPath}"，支持 png/jpg/jpeg/gif/webp`,
		});
	}

	const path = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
	if (!existsSync(path)) {
		return err({ code: "not_found", message: `图片文件不存在: ${path}` });
	}

	let sizeBytes: number;
	try {
		sizeBytes = statSync(path).size;
	} catch (error) {
		return err({
			code: "read_failed",
			message: `无法读取图片: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
	if (sizeBytes > MAX_IMAGE_BYTES) {
		const sizeMb = (sizeBytes / 1024 / 1024).toFixed(1);
		return err({
			code: "too_large",
			message: `图片过大（${sizeMb}MB），上限 4MB`,
		});
	}

	let data: string;
	try {
		data = readFileSync(path).toString("base64");
	} catch (error) {
		return err({
			code: "read_failed",
			message: `图片读取失败: ${error instanceof Error ? error.message : String(error)}`,
		});
	}

	return ok({
		path,
		name: basename(path),
		mimeType,
		data,
		sizeBytes,
	});
}

// #endregion
