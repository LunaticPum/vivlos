import "dotenv/config";
import { ok } from "@vivlos/shared";

async function main(): Promise<void> {
	console.log("vivlos agent starting...");
	console.log("P0 scaffold ready.");
	console.log(ok("it work!"));
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
