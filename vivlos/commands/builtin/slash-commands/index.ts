import type { SlashCommand } from "../../types.ts";
import { helpCommand } from "./help.ts";
import { quitCommand } from "./quit.ts";
import { clearCommand } from "./clear.ts";
import { sessionCommand } from "./session.ts";
import { modelCommand } from "./model.ts";

export const builtinSlashCommands: SlashCommand[] = [
	helpCommand,
	modelCommand,
	sessionCommand,
	clearCommand,
	quitCommand,
];
