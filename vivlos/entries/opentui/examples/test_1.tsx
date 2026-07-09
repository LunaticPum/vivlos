import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import "opentui-spinner/react";

function App() {
	return (
		<box alignItems="center" flexDirection="row">
			<spinner name="sand" color="cyan" />
			<text marginLeft={1}>Loading...</text>
		</box>
	);
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
