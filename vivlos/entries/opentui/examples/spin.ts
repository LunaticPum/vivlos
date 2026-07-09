import {
	BoxRenderable,
	createCliRenderer,
	TextRenderable,
} from "@opentui/core";
import { SpinnerRenderable } from "opentui-spinner";

const renderer = await createCliRenderer();

const container = new BoxRenderable(renderer, {
	border: true,
	flexDirection: "row",
	alignItems: "center",
});

const spinner = new SpinnerRenderable(renderer, {
	name: "bouncingBall",
});

const label = new TextRenderable(renderer, {
	content: "Loading...",
	marginLeft: 1,
});

container.add(spinner);
container.add(label);
renderer.root.add(container);
