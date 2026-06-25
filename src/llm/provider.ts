import type { ChatOptions, ChatEvent } from "../types.ts";

export interface LLMProvider {
	chat(options: ChatOptions): AsyncIterable<ChatEvent>; // AsyncIterable<...> 异步可遍历，即内部遍历的对象可以结合 await 等待获取
}
