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

const BLOCK_COLOR: Record<PieceType | "g", string> = {
	i: "#18cfe7",
	o: "#e2df14",
	t: "#960de6",
	l: "#e9900c",
	z: "#f03a1a",
	j: "#336ce7",
	s: "#27d444",
	g: "#818181",
};

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
				!engine.gameOver ? BLOCK_COLOR[block] : GAME_OVER_COLOR,
			);
		}
	}

	for (const [x, y] of engine.piece.blocks) {
		drawBlock(
			boardOriginX,
			boardOriginY,
			x,
			y,
			BLOCK_COLOR[engine.piece.type],
		);
	}

	for (const [x, y] of engine.ghost.blocks) {
		drawBlock(
			boardOriginX,
			boardOriginY,
			x,
			y,
			BLOCK_COLOR[engine.ghost.type] + "60",
		);
	}

	for (const [index, next] of engine.next.entries()) {
		for (const [x, y] of next.blocks) {
			drawBlock(
				boardOriginX,
				boardOriginY,
				x + PILE_WIDTH + 2,
				BOARD_HEIGHT - 5 * 3 + y + (4 - index) * 3,
				BLOCK_COLOR[next.type],
			);
		}
	}

	if (engine.hold !== null) {
		const color = !engine.holdLocked
			? BLOCK_COLOR[engine.hold.type]
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

	ctx.fillStyle = "#c91d17";
	let garbageOffset = 0;
	for (let i = engine.garbageQueue.length - 1; i >= 0; i--) {
		const garbage = engine.garbageQueue[i];
		const width = 10;
		const gap = 2;
		ctx.fillRect(
			boardOriginX - width,
			boardOriginY - (garbage + garbageOffset) * BLOCK_SIZE + gap,
			width,
			garbage * BLOCK_SIZE - gap,
		);
		garbageOffset += garbage;
	}
}

const socket = new WebSocket("/ws");
socket.addEventListener("message", msg => {
	const obj = JSON.parse(msg.data);

	switch (obj.command) {
		case "newOpponent":
			opponents[obj.id] = new Engine(0);
			break;
		case "addOpponent":
			opponents[obj.id] = Engine.deserialize(obj.state);
			break;
		case "removeOpponent":
			delete opponents[obj.id]
			break;
		case "opponentData":
			const opponent = opponents[obj.id];
			switch (obj.data.command) {
				case "inputs":
					for (const input of obj.data.inputs) {
						opponent.queueInput(input);
					}
					break;
				case "update":
					opponent.update();
					if (opponent.attack > 0) {
						engine.queueGarbage(opponent.attack);
					}
					break;
			}
	}
});

const engine = new Engine(0);
const opponents: Record<number, Engine> = {};
let previousTime = performance.now();
let residueTime = 0;

function draw() {
	const currentTime = performance.now();
	const deltaTime = currentTime - previousTime;
	residueTime += deltaTime;

	while (residueTime >= 1000 / ENGINE_FPS) {
		residueTime -= 1000 / ENGINE_FPS;
		engine.update();
		if (engine.attack > 0) {
			for (const opponent of Object.values(opponents)) {
				opponent.queueGarbage(engine.attack);
			}
		}
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({ command: "update" }));
		}
	}

	ctx.fillStyle = "#000000";
	ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

	const engines = [engine, ...Object.values(opponents)];
	for (let i = 0; i < engines.length; i++) {
		renderEngine(engines[i], i, engines.length);
	}

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

	if (ev.code === "KeyN") {
		keymap.hold = "KeyC";
		keymap.flip = "KeyA";
		keymap.rotateLeft = "KeyZ";
		keymap.rotateRight = "KeyX";
		keymap.harddrop = "Space";
		keymap.moveLeft = "ArrowLeft";
		keymap.softdrop = "ArrowDown";
		keymap.moveRight = "ArrowRight";
	}

	if (ev.code === "KeyY") {
		keymap.hold = "ShiftLeft";
		keymap.flip = "ArrowUp";
		keymap.rotateLeft = "ArrowLeft";
		keymap.rotateRight = "ArrowRight";
		keymap.harddrop = "KeyW";
		keymap.moveLeft = "KeyA";
		keymap.softdrop = "KeyS";
		keymap.moveRight = "KeyD";
	}

	if (ev.code === "KeyG") {
		keymap.hold = "ShiftLeft";
		keymap.flip = "KeyC";
		keymap.rotateLeft = "KeyZ";
		keymap.rotateRight = "KeyX";
		keymap.harddrop = "Space";
		keymap.moveLeft = "ArrowLeft";
		keymap.softdrop = "ArrowDown";
		keymap.moveRight = "ArrowRight";
	}

	const mapping: Record<string, Input> = {
		[keymap.hold]: "hold",
		[keymap.flip]: "flip",
		[keymap.rotateLeft]: "rotateLeft",
		[keymap.rotateRight]: "rotateRight",
		[keymap.harddrop]: "harddrop",
		[keymap.moveLeft]: "startMoveLeft",
		[keymap.softdrop]: "startSoftdrop",
		[keymap.moveRight]: "startMoveRight",
	};

	const inputs: Input[] = [];
	for (const [keyCode, input] of Object.entries(mapping)) {
		if (ev.code === keyCode) {
			engine.queueInput(input);
			inputs.push(input);
		}
	}

	if (socket.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify({ command: "inputs", inputs }));
	}
});

document.addEventListener("keyup", ev => {
	if (ev.repeat) {
		return;
	}

	const mapping: Record<string, Input> = {
		[keymap.moveLeft]: "stopMoveLeft",
		[keymap.softdrop]: "stopSoftdrop",
		[keymap.moveRight]: "stopMoveRight",
	};

	const inputs: Input[] = [];
	for (const [keyCode, input] of Object.entries(mapping)) {
		if (ev.code === keyCode) {
			engine.queueInput(input);
			inputs.push(input);
		}
	}

	if (socket.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify({ command: "inputs", inputs }));
	}
});
