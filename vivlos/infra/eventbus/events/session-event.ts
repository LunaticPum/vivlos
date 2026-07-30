/** Session 状态转换与元数据事件。 */

import type { Message } from "@earendil-works/pi-ai";
import type { SessionMeta } from "@vivlos/infra/storage/session/index.ts";

export interface SessionStateSnapshot {
	readonly current: {
		readonly id: string;
		readonly name: string | null;
		readonly pending: boolean;
		readonly messages: readonly Message[];
	};
	readonly sessions: readonly SessionMeta[];
}

export type SessionEvent =
	| { readonly type: "session:state_requested" }
	| {
			readonly type: "session:state";
			readonly state: SessionStateSnapshot;
	  }
	| {
			readonly type: "session:created";
			readonly sessionId: string;
	  }
	| {
			readonly type: "session:activated";
			readonly sessionId: string;
	  }
	| {
			readonly type: "session:switched";
			readonly sessionId: string;
	  }
	| {
			readonly type: "session:deleted";
			readonly sessionId: string;
	  }
	| {
			readonly type: "session:renamed";
			readonly sessionId: string;
			readonly name: string;
			readonly source: "auto" | "user";
	  };
