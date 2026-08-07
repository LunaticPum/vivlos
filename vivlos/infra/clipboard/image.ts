/**
 * 剪贴板图片读取（Windows）。
 *
 * 截图键（Win+Shift+S / PrintScreen）复制到剪贴板的是位图数据而非文件路径，
 * 终端的 Ctrl+V 只能传递文本，无法把位图送进应用。
 * 因此通过 PowerShell 读取剪贴板位图，保存为临时 PNG 后返回路径，
 * 由上层按普通图片附件流程处理。
 */

import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { err, ok, type Result } from "@vivlos/shared";

export type ClipboardImageError =
	| { readonly code: "unsupported_platform"; readonly message: string }
	| { readonly code: "empty_clipboard"; readonly message: string }
	| { readonly code: "read_failed"; readonly message: string };

const TIMEOUT_MS = 8000;

/**
 * 读取剪贴板中的位图并保存为 PNG。
 *
 * @param targetDir 保存目录（建议 .vivlos/temp/，启动时会清理）
 * @returns 成功时返回保存后的文件绝对路径
 */
export async function grabClipboardImage(
	targetDir: string,
): Promise<Result<string, ClipboardImageError>> {
	if (process.platform !== "win32") {
		return err({
			code: "unsupported_platform",
			message: "剪贴板图片读取当前仅支持 Windows",
		});
	}

	const fileName = `vivlos-clipboard-${Date.now()}.png`;
	const targetPath = join(targetDir, fileName);
	// PowerShell 单引号内嵌路径，避免双引号转义问题
	const script = [
		"Add-Type -AssemblyName System.Windows.Forms;",
		"$img = [System.Windows.Forms.Clipboard]::GetImage();",
		"if ($null -ne $img) {",
		`  $img.Save('${targetPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);`,
		`  Write-Output '${targetPath.replace(/'/g, "''")}'`,
		"}",
	].join("\n");

	const output = await new Promise<string>((resolve, reject) => {
		execFile(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
			{ timeout: TIMEOUT_MS, windowsHide: true },
			(error, stdout) => {
				if (error) reject(error);
				else resolve(stdout);
			},
		);
	});

	const printed = output.trim();
	if (!printed || !existsSync(targetPath)) {
		return err({
			code: "empty_clipboard",
			message: "剪贴板中没有图片（先用截图键截图再试）",
		});
	}

	// 内容去重：同一张截图反复 Ctrl+G 时复用已有文件，不重复生成
	const duplicate = findDuplicate(targetDir, targetPath);
	if (duplicate) {
		try {
			unlinkSync(targetPath);
		} catch {
			// 删除失败不影响复用
		}
		return ok(duplicate);
	}
	return ok(targetPath);
}

// #region 去重

function hashFile(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** 在目录中查找与 newFile 内容相同的已有剪贴板图片。 */
function findDuplicate(targetDir: string, newFile: string): string | null {
	let newHash: string;
	try {
		newHash = hashFile(newFile);
	} catch {
		return null;
	}
	let entries: string[];
	try {
		entries = readdirSync(targetDir);
	} catch {
		return null;
	}
	for (const name of entries) {
		if (!name.startsWith("vivlos-clipboard-") || !name.endsWith(".png")) continue;
		const candidate = join(targetDir, name);
		if (candidate === newFile) continue;
		try {
			if (hashFile(candidate) === newHash) return candidate;
		} catch {
			// 跳过不可读文件
		}
	}
	return null;
}

// #endregion
