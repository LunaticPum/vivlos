/** 全部 vivlos error 的基类 */
export class VivlosError extends Error {
	constructor(
		message: string,
		public readonly cause?: Error,
	) {
		super(message, { cause });
		this.name = "VivlosError";
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
}

export class SessionError extends VivlosError {
	constructor(message: string, cause?: Error) {
		super(message, cause);
		this.name = "SessionError";
	}
}
