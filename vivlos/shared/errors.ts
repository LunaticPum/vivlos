/** 全部 vivlos error 的基类 */
export class VivlosError extends Error {
	constructor(
		message: string,
		public readonly cause?: Error,
	) {
		super(message, { cause });
		this.name = "VivlosError";
	}

	/** 格式化为结构化日志行（供 MarkdownLogWriter 使用） */
	toLogLine(): string {
		const lines: string[] = [`[${this.name}] ${this.message}`];
		if (this.cause) {
			lines.push(`  cause: ${this.cause.name}: ${this.cause.message}`);
		}
		return lines.join("\n");
	}
}

export class ConfigError extends VivlosError {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

export class LLMError extends VivlosError {
	constructor(
		message: string,
		public readonly provider: string,
		cause?: Error,
	) {
		super(message, cause);
		this.name = "LLMError";
	}

	toLogLine(): string {
		return `${super.toLogLine()}\n  provider: ${this.provider}`;
	}
}

export class ToolError extends VivlosError {
	constructor(
		message: string,
		public readonly toolName: string,
		cause?: Error,
	) {
		super(message, cause);
		this.name = "ToolError";
	}

	toLogLine(): string {
		return `${super.toLogLine()}\n  tool: ${this.toolName}`;
	}
}

export class SessionError extends VivlosError {
	constructor(message: string, cause?: Error) {
		super(message, cause);
		this.name = "SessionError";
	}
}