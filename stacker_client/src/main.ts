import {
	Engine,
	ENGINE_FPS,
	PILE_HEIGHT,
	PILE_WIDTH,
	type Input,
	type PieceType,
} from "stacker_engine";

const stacker = document.querySelector("#stacker") as HTMLCanvasElement;

stacker.width = window.innerWidth;
stacker.height = window.innerHeight;

const BOARD_HEIGHT = 20;
const BLOCK_SIZE = 20;

window.addEventListener("resize", () => {
	stacker.width = window.innerWidth;
	stacker.height = window.innerHeight;
});

const ctx = stacker.getContext("2d")!;

const GHOST_LOCKED_COLOR = "#4d4d4d";
const GAME_OVER_COLOR = "#242424";

function blockColor(block: PieceType): string {
	switch (block) {
		case "i":
			return "#18cfe7";
		case "o":
			return "#e2df14";
		case "t":
			return "#960de6";
		case "l":
			return "#e9900c";
		case "z":
			return "#f03a1a";
		case "j":
			return "#336ce7";
		case "s":
			return "#27d444";
	}
}

function drawBlock(
	originX: number,
	originY: number,
	x: number,
	y: number,
	color: string,
) {
	ctx.fillStyle = color;
	ctx.fillRect(
		originX + x * BLOCK_SIZE,
		originY - (y + 1) * BLOCK_SIZE,
		BLOCK_SIZE,
		BLOCK_SIZE,
	);
}

function renderEngine(engine: Engine, nth: number, engineCount: number) {
	const totalWidth = Math.floor(
		22 * engineCount * BLOCK_SIZE - 3 * BLOCK_SIZE,
	);
	const boardOriginX = Math.floor(
		4 * BLOCK_SIZE +
			22 * nth * BLOCK_SIZE +
			(window.innerWidth - totalWidth) / 2,
	);
	const boardOriginY = Math.floor(
		(window.innerHeight - BOARD_HEIGHT * BLOCK_SIZE) / 2 +
			BOARD_HEIGHT * BLOCK_SIZE,
	);

	for (let i = 0; i < engineCount; i++) {
		ctx.strokeStyle = "#ffffff";
		ctx.strokeRect(
			boardOriginX,
			(window.innerHeight - BOARD_HEIGHT * BLOCK_SIZE) / 2,
			PILE_WIDTH * BLOCK_SIZE,
			BOARD_HEIGHT * BLOCK_SIZE,
		);
	}

	for (let i = 0; i < PILE_HEIGHT; i++) {
		for (let j = 0; j < PILE_WIDTH; j++) {
			const block = engine.pile[i]?.[j];

			if (block == null) {
				continue;
			}

			drawBlock(
				boardOriginX,
				boardOriginY,
				j,
				i,
				!engine.gameOver ? blockColor(block) : GAME_OVER_COLOR,
			);
		}
	}

	for (const [x, y] of engine.piece.blocks) {
		drawBlock(
			boardOriginX,
			boardOriginY,
			x,
			y,
			blockColor(engine.piece.type),
		);
	}

	for (const [x, y] of engine.ghost.blocks) {
		drawBlock(
			boardOriginX,
			boardOriginY,
			x,
			y,
			blockColor(engine.ghost.type) + "60",
		);
	}

	for (const [index, next] of engine.next.entries()) {
		for (const [x, y] of next.blocks) {
			drawBlock(
				boardOriginX,
				boardOriginY,
				x + PILE_WIDTH + 2,
				BOARD_HEIGHT - 5 * 3 + y + (4 - index) * 3,
				blockColor(next.type),
			);
		}
	}

	if (engine.hold !== null) {
		const color = !engine.holdLocked
			? blockColor(engine.hold.type)
			: GHOST_LOCKED_COLOR;
		for (const [x, y] of engine.hold.blocks) {
			drawBlock(
				boardOriginX,
				boardOriginY,
				x - 4,
				BOARD_HEIGHT - 3 + y,
				color,
			);
		}
	}
}

const engine = new Engine(0);
let previousTime = performance.now();
let residueTime = 0;

function draw() {
	const currentTime = performance.now();
	const deltaTime = currentTime - previousTime;
	residueTime += deltaTime;

	while (residueTime >= 1000 / ENGINE_FPS) {
		residueTime -= 1000 / ENGINE_FPS;
		engine.update();
	}

	ctx.fillStyle = "#000000";
	ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

	renderEngine(engine, 0, 1);

	previousTime = currentTime;
	requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

const keymap: Record<string, string> = {
	hold: "KeyA",
	flip: "KeyS",
	rotateLeft: "KeyD",
	rotateRight: "KeyF",
	harddrop: "Space",
	moveLeft: "KeyJ",
	softdrop: "KeyK",
	moveRight: "KeyL",
};

document.addEventListener("keydown", ev => {
	if (ev.repeat) {
		return;
	}

	if (ev.code === "KeyG") {
		keymap.hold = "ShiftLeft";
		keymap.flip =  "KeyA";
		keymap.rotateLeft = "KeyZ";
		keymap.rotateRight = "KeyX";
		keymap.harddrop = "Space";
		keymap.moveLeft = "ArrowLeft";
		keymap.softdrop = "ArrowDown";
		keymap.moveRight = "ArrowRight";
	}

	switch (ev.code) {
		case keymap.hold:
			engine.queueInput("hold");
			break;
		case keymap.flip:
			engine.queueInput("flip");
			break;
		case keymap.rotateLeft:
			engine.queueInput("rotateLeft");
			break;
		case keymap.rotateRight:
			engine.queueInput("rotateRight");
			break;
		case keymap.harddrop:
			engine.queueInput("harddrop");
			break;
		case keymap.moveLeft:
			engine.queueInput("startMoveLeft");
			break;
		case keymap.softdrop:
			engine.queueInput("startSoftdrop");
			break;
		case keymap.moveRight:
			engine.queueInput("startMoveRight");
			break;
	}
});

document.addEventListener("keyup", ev => {
	if (ev.repeat) {
		return;
	}

	switch (ev.code) {
		case keymap.moveLeft:
			engine.queueInput("stopMoveLeft");
			break;
		case keymap.softdrop:
			engine.queueInput("stopSoftdrop");
			break;
		case keymap.moveRight:
			engine.queueInput("stopMoveRight");
			break;
	}
});
