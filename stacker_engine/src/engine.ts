import RNG from "./rng.js";

export type Input =
	| "hold"
	| "flip"
	| "rotateLeft"
	| "rotateRight"
	| "harddrop"
	| "startMoveLeft"
	| "stopMoveLeft"
	| "startSoftdrop"
	| "stopSoftdrop"
	| "startMoveRight"
	| "stopMoveRight";
export type PieceType = "i" | "o" | "t" | "l" | "z" | "j" | "s";
export type Cell = PieceType | "g" | null;
export type Coords = [number, number];
export type Rotation = 0 | 1 | 2 | 3;

export const PILE_WIDTH = 10;
export const PILE_HEIGHT = 40;
export const BOARD_HEIGHT = 20;

export const ENGINE_FPS = 60;

export const DEFAULT_CONFIG: Config = {
	das: 6,
	arr: 0,
	gravity: 60,
	softdrop: 1,
	lock: 30,
	garbageEntry: 20,
};

type Config = {
	das: number;
	arr: number;
	gravity: number;
	softdrop: number;
	lock: number;
	garbageEntry: number;
};

type SerializedPiece = {
	type: PieceType;
	x: number;
	y: number;
	direction: Rotation;
};

export class Piece {
	#type: PieceType;
	#coords: Coords;
	#direction: Rotation;
	#blocks: Coords[];

	constructor(
		type: PieceType,
		x: number = 0,
		y: number = 0,
		direction: Rotation = 0,
	) {
		this.#type = type;
		this.#coords = [x, y];
		this.#direction = direction;
		this.#blocks = NORTH_PIECES[type];
		for (let i = 0; i < direction; i++) {
			this.#blocks = this.#blocks.map(([x, y]) => [y, -x]);
		}
		this.#blocks = this.#blocks.map(([bx, by]) => [bx + x, by + y]);
	}

	static deserialize(state: SerializedPiece): Piece {
		return new Piece(state.type, state.x, state.y, state.direction);
	}

	serialize(): SerializedPiece {
		return {
			type: this.#type,
			x: this.#coords[0],
			y: this.#coords[1],
			direction: this.#direction,
		};
	}

	changedBy(
		dx: number,
		dy: number,
		rotation: Rotation = 0,
		nthTry: number = 0,
	): Piece {
		const newDirection = ((this.#direction + rotation) % 4) as Rotation;
		const [fromX, fromY] = kickOffset(this.#type, this.#direction, nthTry);
		const [toX, toY] = kickOffset(this.#type, newDirection, nthTry);
		const offsetX = fromX - toX;
		const offsetY = fromY - toY;
		const [x, y] = this.#coords;

		return new Piece(
			this.#type,
			x + offsetX + dx,
			y + offsetY + dy,
			newDirection,
		);
	}

	static spawn(type: PieceType) {
		return new Piece(type, 4, 21);
	}

	equals(other: Piece): boolean {
		if (this.#blocks.length !== other.#blocks.length) {
			return false;
		}

		for (let i = 0; i < this.#blocks.length; i++) {
			let found = false;
			for (let j = 0; j < other.#blocks.length; j++) {
				if (
					this.#blocks[i]![0] === other.#blocks[j]![0] &&
					this.#blocks[i]![1] === other.#blocks[j]![1]
				) {
					found = true;
					break;
				}
			}
			if (!found) {
				return false;
			}
		}
		return true;
	}

	lowestY(): number {
		return Math.min(...this.#blocks.map(([_, y]) => y));
	}

	get type(): PieceType {
		return this.#type;
	}

	get blocks(): Coords[] {
		return this.#blocks;
	}

	get x(): number {
		return this.#coords[0];
	}

	get y(): number {
		return this.#coords[1];
	}
}

export type PendingGarbage = { lines: number, remaining: number };
type Garbage = { height: number; column: number };

export type FrameOutcome = {
	linesCleared: number;
	tspin: boolean;
	cancelled: number;
	attack: number;
};

export type SerializedEngine = {
	config: Config;
	frame: number;
	pile: SerializedPile;
	generator: SerializedPieceGenerator;
	activePiece: SerializedPiece;
	lowestY: number;
	ghostPiece: SerializedPiece;
	holdPiece: PieceType | null;
	holdLocked: boolean;
	gravityTimer: SerializedTimer;
	softdropTimer: SerializedTimer;
	moveLeft: boolean;
	moveRight: boolean;
	dasDirection: "left" | "right" | null;
	dasTimer: SerializedTimer;
	lockTimer: SerializedTimer;
	resetCounter: number;
	gameOver: boolean;
	garbageRngState: number[];
	garbageQueue: PendingGarbage[];
	frameOutcome: FrameOutcome;
	backToBack: number | null;
	combo: number | null;
	lastInputWasRotate: boolean;
};

export class Engine {
	#config: Config;
	#frame = 0;
	#pile = new Pile();
	#generator: PieceGenerator;
	#activePiece: Piece;
	#lowestY: number;
	#ghostPiece: Piece;
	#holdPiece: Piece | null = null;
	#holdLocked = false;
	#gravityTimer = new Timer();
	#softdropTimer = new Timer();
	#moveLeft = false;
	#moveRight = false;
	#dasDirection: "left" | "right" | null = null;
	#dasTimer = new Timer();
	#lockTimer = new Timer();
	#resetCounter: number;
	#gameOver = false;
	#garbageRng: RNG;
	#garbageQueue: PendingGarbage[] = [];
	#frameOutcome: FrameOutcome = { linesCleared: 0, tspin: false, cancelled: 0, attack: 0 };
	#backToBack: number | null = null;
	#combo: number | null = null;
	#lastInputWasRotate = false;

	constructor(seed: number, config: Config = DEFAULT_CONFIG) {
		this.#config = config;

		this.#generator = new PieceGenerator(seed);

		this.#activePiece = Piece.spawn(this.#generator.pull().type);
		this.#lowestY = this.#activePiece.lowestY();
		this.#ghostPiece = this.#pile.calculateGhost(this.#activePiece);

		this.#gravityTimer.set(config.gravity);

		this.#resetCounter = 0;

		this.#garbageRng = new RNG(seed);
	}

	serialize(): SerializedEngine {
		return {
			config: this.#config,
			frame: this.#frame,
			pile: this.#pile.serialize(),
			generator: this.#generator.serialize(),
			activePiece: this.#activePiece.serialize(),
			lowestY: this.#lowestY,
			ghostPiece: this.#ghostPiece.serialize(),
			holdPiece: this.#holdPiece?.type ?? null,
			holdLocked: this.#holdLocked,
			gravityTimer: this.#gravityTimer.serialize(),
			softdropTimer: this.#softdropTimer.serialize(),
			moveLeft: this.#moveLeft,
			moveRight: this.#moveRight,
			dasDirection: this.#dasDirection,
			dasTimer: this.#dasTimer.serialize(),
			lockTimer: this.#lockTimer.serialize(),
			resetCounter: this.#resetCounter,
			gameOver: this.#gameOver,
			garbageRngState: this.#garbageRng.getState().slice(),
			garbageQueue: structuredClone(this.#garbageQueue),
			frameOutcome: structuredClone(this.#frameOutcome),
			backToBack: this.#backToBack,
			combo: this.combo,
			lastInputWasRotate: this.#lastInputWasRotate,
		};
	}

	deserializeInPlace(state: SerializedEngine) {
		this.#config = state.config;
		this.#frame = state.frame;
		this.#pile = Pile.deserialize(state.pile);
		this.#generator = PieceGenerator.deserialize(state.generator);
		this.#activePiece = Piece.deserialize(state.activePiece);
		this.#lowestY = state.lowestY;
		this.#ghostPiece = Piece.deserialize(state.ghostPiece);
		this.#holdPiece = state.holdPiece ? new Piece(state.holdPiece) : null;
		this.#holdLocked = state.holdLocked;
		this.#gravityTimer = Timer.deserialize(state.gravityTimer);
		this.#softdropTimer = Timer.deserialize(state.softdropTimer);
		this.#moveLeft = state.moveLeft;
		this.#moveRight = state.moveRight;
		this.#dasDirection = state.dasDirection;
		this.#dasTimer = Timer.deserialize(state.dasTimer);
		this.#lockTimer = Timer.deserialize(state.lockTimer);
		this.#resetCounter = state.resetCounter;
		this.#gameOver = state.gameOver;
		this.#garbageRng = new RNG(state.garbageRngState);
		this.#garbageQueue = state.garbageQueue;
		this.#frameOutcome = state.frameOutcome;
		this.#backToBack = state.backToBack;
		this.#combo = state.combo;
		this.#lastInputWasRotate = state.lastInputWasRotate;
	}

	static deserialize(state: SerializedEngine): Engine {
		const engine = new Engine(0);

		engine.deserializeInPlace(state);

		return engine;
	}

	queueGarbage(lines: number) {
		this.#garbageQueue.push({ lines, remaining: this.#config.garbageEntry });
	}

	update(inputs: Input[]): FrameOutcome {
		this.#frameOutcome.linesCleared = 0;
		this.#frameOutcome.tspin = false;
		this.#frameOutcome.cancelled = 0;
		this.#frameOutcome.attack = 0;

		if (this.#gameOver) {
			return this.#frameOutcome;
		}

		this.#frame++;

		if (this.#gravityTimer.tick()) {
			this.#fall();
			this.#gravityTimer.set(this.#config.gravity);
		}

		if (this.#softdropTimer.tick()) {
			this.#fall();
			this.#softdropTimer.set(this.#config.softdrop);
		}

		if (this.#dasTimer.tick() && this.#dasDirection !== null) {
			this.#move(this.#dasDirection);
			if (this.#config.arr !== 0) {
				this.#dasTimer.set(this.#config.arr);
			} else {
				this.#dasTimer.set(1);
				while (true) {
					const branched = this.#activePiece.changedBy(
						this.#dasDirection === "right" ? 1 : -1,
						0,
					);
					if (this.#pile.hasOverlap(branched.blocks)) {
						break;
					}
					this.#setActive(branched);
				}
			}
		}

		if (this.#lockTimer.tick()) {
			this.#tryLock();
		}

		for (const garbage of this.#garbageQueue) {
			if (garbage.remaining <= 0) {
				continue;
			}

			garbage.remaining -= 1;
		}

		for (const input of inputs) {
			this.#handleInput(input);
		}

		return this.#frameOutcome;
	}

	#handleInput(input: Input) {
		switch (input) {
			case "hold":
				if (this.#holdLocked) {
					break;
				}
				this.#holdLocked = true;
				const newActive =
					this.#holdPiece !== null
						? this.#holdPiece
						: this.#generator.pull();
				this.#holdPiece = new Piece(this.#activePiece.type);
				this.#spawn(newActive.type);
				break;
			case "rotateRight":
				this.#rotate(1);
				break;
			case "flip":
				this.#rotate(2);
				break;
			case "rotateLeft":
				this.#rotate(3);
				break;
			case "harddrop":
				this.#lockGhost();
				break;
			case "startMoveLeft":
				this.#moveLeft = true;
				this.#move("left");
				this.#dasDirection = "left";
				this.#dasTimer.set(this.#config.das);
				break;
			case "startMoveRight":
				this.#moveRight = true;
				this.#move("right");
				this.#dasDirection = "right";
				this.#dasTimer.set(this.#config.das);
				break;
			case "stopMoveLeft":
				this.#moveLeft = false;
				if (this.#moveRight) {
					this.#dasDirection = "right";
					this.#dasTimer.set(this.#config.das);
				} else {
					this.#dasDirection = null;
					this.#dasTimer.stop();
				}
				break;
			case "stopMoveRight":
				this.#moveRight = false;
				if (this.#moveLeft) {
					this.#dasDirection = "left";
					this.#dasTimer.set(this.#config.das);
				} else {
					this.#dasDirection = null;
					this.#dasTimer.stop();
				}
				break;
			case "startSoftdrop":
				this.#fall();
				this.#gravityTimer.stop();
				this.#softdropTimer.set(this.#config.softdrop);
				break;
			case "stopSoftdrop":
				this.#softdropTimer.stop();
				this.#gravityTimer.set(this.#config.gravity);
				break;
		}
	}

	#rotate(rotation: Rotation) {
		for (let i = 0; i < 5; i++) {
			const branched = this.#activePiece.changedBy(0, 0, rotation, i);
			if (!this.#pile.hasOverlap(branched.blocks)) {
				this.#setActive(branched);
				this.#lastInputWasRotate = true;
				break;
			}
		}
	}

	#tryLock() {
		if (this.#canFall()) {
			this.#fall();
		} else {
			this.#lockGhost();
		}
	}

	#lockGhost() {
		if (this.#ghostPiece.lowestY() >= BOARD_HEIGHT) {
			this.#gameOver = true;
			return;
		}

		const tspin = this.#ghostPiece.type === 't' && this.#lastInputWasRotate && this.#pile.checkTspin(this.#ghostPiece);
		this.#frameOutcome.tspin = tspin;

		this.#pile.addPiece(this.#ghostPiece);
		const linesCleared = this.#pile.clearLines();
		this.#frameOutcome.linesCleared = linesCleared;
		if (linesCleared === 4 || (linesCleared > 0 && tspin)) {
			if (typeof this.#backToBack === "number") {
				this.#backToBack++;
			} else {
				this.#backToBack = 0;
			}
		} else if (linesCleared != 0) {
			this.#backToBack = null;
		}

		if (linesCleared > 0) {
			if (typeof this.#combo === "number") {
				this.#combo++;
			} else {
				this.#combo = 0;
			}
		} else {
			this.#combo = null;
		}

		const attack = calculateAttack({ backToBack: this.#backToBack ?? 0, combo: this.#combo ?? 0, linesCleared, tspin });

		if (linesCleared > 0) {
			let maxLinesToCancel = attack;
			for (const garbage of this.#garbageQueue) {
				const cancelled = Math.min(garbage.lines, maxLinesToCancel);
				garbage.lines -= cancelled;
				maxLinesToCancel -= cancelled;
				this.#frameOutcome.cancelled += cancelled;
			}
			this.#garbageQueue = this.#garbageQueue.filter(garbage => garbage.lines > 0);
		} else {
			for (const garbage of this.#garbageQueue) {
				if (garbage.remaining > 0) {
					continue;
				}

				this.#pile.addGarbage({
					height: garbage.lines,
					column: this.#garbageRng.nextInt(0, 10),
				});
			}
			this.#garbageQueue = this.#garbageQueue.filter(garbage => garbage.remaining > 0);
		}
		this.#frameOutcome.attack = attack - this.#frameOutcome.cancelled;
		this.#spawn();
		this.#holdLocked = false;
	}

	#canFall(): boolean {
		const branched = this.#activePiece.changedBy(0, -1);
		return !this.#pile.hasOverlap(branched.blocks);
	}

	#fall() {
		if (this.#canFall()) {
			this.#setActive(this.#activePiece.changedBy(0, -1));
		}
	}

	#move(towards: "left" | "right") {
		const branched = this.#activePiece.changedBy(
			towards === "right" ? 1 : -1,
			0,
		);
		if (!this.#pile.hasOverlap(branched.blocks)) {
			this.#setActive(branched);
		}
	}

	#spawn(type?: PieceType) {
		if (type === undefined) {
			type = this.#generator.pull().type;
		}
		this.#resetCounter = 0;
		this.#setActive(Piece.spawn(type));
		if (this.#pile.hasOverlap(this.#activePiece.blocks)) {
			this.#gameOver = true;
			return;
		}
		this.#lowestY = this.#activePiece.lowestY();
	}

	#setActive(piece: Piece) {
		const prevLowestY = this.#lowestY;
		const prevPiece = this.#activePiece;

		this.#activePiece = piece;
		this.#ghostPiece = this.#pile.calculateGhost(this.#activePiece);
		this.#lowestY = Math.min(this.#lowestY, this.#activePiece.lowestY());

		if (this.#lowestY < prevLowestY) {
			this.#resetCounter = 0;
		}

		if (!this.#activePiece.equals(prevPiece)) {
			if (!this.#canFall()) {
				this.#lockTimer.set(this.#config.lock);
			} else {
				this.#lockTimer.stop();
			}
		}

		if (this.#resetCounter >= 15) {
			this.#tryLock();
		}

		this.#resetCounter++;

		this.#lastInputWasRotate = false; // Will be set to true by #rotate.
	}

	get frame(): number {
		return this.#frame;
	}

	get gameOver(): boolean {
		return this.#gameOver;
	}

	get pile(): readonly (readonly Cell[])[] {
		return this.#pile.rows;
	}

	get piece(): Piece {
		return this.#activePiece;
	}

	get ghost(): Piece {
		return this.#ghostPiece;
	}

	get hold(): Piece | null {
		return this.#holdPiece;
	}

	get holdLocked(): boolean {
		return this.#holdLocked;
	}

	get next(): Piece[] {
		return this.#generator.next;
	}

	get garbageQueue(): PendingGarbage[] {
		return this.#garbageQueue;
	}

	get backToBack(): number {
		return this.#backToBack ?? 0;
	}

	get combo(): number {
		return this.#combo ?? 0;
	}
}

type SerializedGarbageRollbackEngine = SerializedEngine & {
	rollbackEngine: SerializedEngine;
	rollbackInputs: Input[][];
	pendingGarbage: Record<number, number>;
};

export class GarbageRollbackEngine extends Engine {
	#rollbackEngine: Engine;
	#rollbackInputs: Input[][] = [];
	#pendingGarbage: Record<number, number> = {};
	constructor(seed: number) {
		super(seed);
		this.#rollbackEngine = new Engine(seed);
	}

	update(inputs: Input[]): FrameOutcome {
		if (this.#pendingGarbage[this.frame] !== undefined) {
			// someone hit us in the future, apply it now.
			this.queueGarbage(this.#pendingGarbage[this.frame]!);
		}
		this.#rollbackInputs.push(inputs.slice());
		if (this.#rollbackInputs.length > 60) {
			this.#rollbackEngine.update(this.#rollbackInputs.shift()!);
			if (
				this.#pendingGarbage[this.#rollbackEngine.frame] !== undefined
			) {
				// the past entry must be applied and deleted.
				this.#rollbackEngine.queueGarbage(
					this.#pendingGarbage[this.#rollbackEngine.frame]!,
				);
				delete this.#pendingGarbage[this.#rollbackEngine.frame];
			}
		}
		return super.update(inputs);
	}

	serialize(): SerializedGarbageRollbackEngine {
		return {
			...super.serialize(),
			rollbackEngine: this.#rollbackEngine.serialize(),
			rollbackInputs: structuredClone(this.#rollbackInputs),
			pendingGarbage: structuredClone(this.#pendingGarbage),
		};
	}

	static deserialize(
		state: SerializedGarbageRollbackEngine,
	): GarbageRollbackEngine {
		const engine = new GarbageRollbackEngine(0);

		engine.deserializeInPlace(state);
		engine.#rollbackEngine = Engine.deserialize(state.rollbackEngine);
		engine.#rollbackInputs = state.rollbackInputs;
		engine.#pendingGarbage = state.pendingGarbage;

		return engine;
	}

	addGarbage(frame: number, attack: number) {
		console.log(`current frame: ${this.frame}, incoming frame: ${frame}`);
		this.#pendingGarbage[frame] = attack;

		if (frame > this.frame) {
			return;
		}

		// if there are any pending garbages in the past, rollback.

		const rolling = Engine.deserialize(this.#rollbackEngine.serialize());
		const inputs = structuredClone(this.#rollbackInputs);
		while (inputs.length > 0) {
			rolling.update(inputs.shift()!);
			if (this.#pendingGarbage[rolling.frame] !== undefined) {
				// apply the garbage.
				rolling.queueGarbage(this.#pendingGarbage[rolling.frame]!);
			}
		}
		this.deserializeInPlace(rolling.serialize());
	}
}

function calculateAttack({
	backToBack,
	combo,
	linesCleared,
	tspin,
}: {
	backToBack: number;
	combo: number;
	linesCleared: number;
	tspin: boolean;
}): number {
	if (linesCleared <= 0) {
		return 0;
	}

	let result = 0;

	switch (linesCleared) {
		case 1:
			result = 0;
			break;
		case 2:
			result = 1;
			break;
		case 3:
			result = 2;
			break;
		case 4:
			result = 4;
			break;
	}

	if (tspin) {
		result = linesCleared * 2;
	}

	if (backToBack > 0) {
		result += 1;
	}

	if (combo > 1) {
		result += Math.floor(Math.sqrt(combo));
	}

	return result;
}

const NORTH_PIECES: Record<PieceType, Coords[]> = {
	i: [
		[-1, 0],
		[0, 0],
		[1, 0],
		[2, 0],
	],
	o: [
		[0, 0],
		[1, 0],
		[0, 1],
		[1, 1],
	],
	t: [
		[0, 0],
		[1, 0],
		[-1, 0],
		[0, 1],
	],
	l: [
		[0, 0],
		[1, 0],
		[-1, 0],
		[1, 1],
	],
	z: [
		[0, 0],
		[1, 0],
		[0, 1],
		[-1, 1],
	],
	j: [
		[0, 0],
		[1, 0],
		[-1, 0],
		[-1, 1],
	],
	s: [
		[0, 0],
		[-1, 0],
		[0, 1],
		[1, 1],
	],
};

function kickOffset(type: PieceType, rotation: Rotation, n: number): Coords {
	if (n < 0 || n > 5) {
		throw new Error("n has to be in the range [0, 5]");
	}

	let table: Coords[];
	switch (`${type}_${rotation}` as const) {
		case "o_0":
			return [0, 0];
		case "o_1":
			return [0, -1];
		case "o_2":
			return [-1, -1];
		case "o_3":
			return [-1, 0];

		case "i_0":
			table = [
				[0, 0],
				[-1, 0],
				[2, 0],
				[-1, 0],
				[2, 0],
			];
			break;

		case "i_1":
			table = [
				[-1, 0],
				[0, 0],
				[0, 0],
				[0, 1],
				[0, -2],
			];
			break;

		case "i_2":
			table = [
				[-1, 1],
				[1, 1],
				[-2, 1],
				[1, 0],
				[-2, 0],
			];
			break;

		case "i_3":
			table = [
				[0, 1],
				[0, 1],
				[0, 1],
				[0, -1],
				[0, 2],
			];
			break;

		case "t_0":
		case "l_0":
		case "z_0":
		case "j_0":
		case "s_0":
			table = [
				[0, 0],
				[0, 0],
				[0, 0],
				[0, 0],
				[0, 0],
			];
			break;

		case "t_1":
		case "l_1":
		case "z_1":
		case "j_1":
		case "s_1":
			table = [
				[0, 0],
				[1, 0],
				[1, -1],
				[0, 2],
				[1, 2],
			];
			break;

		case "t_2":
		case "l_2":
		case "z_2":
		case "j_2":
		case "s_2":
			table = [
				[0, 0],
				[0, 0],
				[0, 0],
				[0, 0],
				[0, 0],
			];
			break;

		case "t_3":
		case "l_3":
		case "z_3":
		case "j_3":
		case "s_3":
			table = [
				[0, 0],
				[-1, 0],
				[-1, -1],
				[0, 2],
				[-1, 2],
			];
			break;
	}

	return table[n]!;
}

type SerializedPile = {
	rows: Cell[][];
};

class Pile {
	#rows: Cell[][] = [];

	constructor() {
		for (let i = 0; i < PILE_HEIGHT; i++) {
			this.#rows.push(this.#emptyRow());
		}
	}

	static deserialize(state: SerializedPile): Pile {
		const pile = new Pile();

		pile.#rows = state.rows;

		return pile;
	}

	serialize(): SerializedPile {
		return {
			rows: structuredClone(this.#rows),
		};
	}

	#emptyRow() {
		const row = [];
		for (let j = 0; j < PILE_WIDTH; j++) {
			row.push(null);
		}
		return row;
	}

	hasOverlap(blocks: Coords[]): boolean {
		for (const [x, y] of blocks) {
			if (
				x < 0 ||
				x >= PILE_WIDTH ||
				y < 0 ||
				y >= PILE_HEIGHT ||
				this.#rows[y]?.[x] != null
			) {
				return true;
			}
		}
		return false;
	}

	addPiece(piece: Piece) {
		for (const [x, y] of piece.blocks) {
			this.#rows[y]![x] = piece.type;
		}
	}

	clearLines(): number {
		let count = 0;
		for (let i = PILE_HEIGHT - 1; i >= 0; i--) {
			let full = true;
			for (let j = 0; j < PILE_WIDTH; j++) {
				if (this.#rows[i]?.[j] === null) {
					full = false;
				}
			}
			if (full) {
				this.#rows.splice(i, 1);
				this.#rows.push(this.#emptyRow());
				count++;
			}
		}
		return count;
	}

	calculateGhost(piece: Piece): Piece {
		while (true) {
			const branched = piece.changedBy(0, -1);
			if (this.hasOverlap(branched.blocks)) {
				return piece;
			}
			piece = branched;
		}
	}

	addGarbage(garbage: Garbage) {
		for (let i = 0; i < garbage.height; i++) {
			this.#rows.pop();

			const row: Cell[] = [];
			for (let j = 0; j < PILE_WIDTH; j++) {
				row.push(j === garbage.column ? null : "g");
			}
			this.#rows.unshift(row);
		}
	}

	checkTspin(piece: Piece): boolean {
		const offsets = [
			[1, 1],
			[1, -1],
			[-1, 1],
			[-1, -1],
		] as const;

		let count = 0;

		for (const [x, y] of offsets) {
			if (this.hasOverlap([[piece.x + x, piece.y + y]])) {
				count += 1;
			}
		}

		return count >= 3;
	}

	get rows(): readonly (readonly Cell[])[] {
		return this.#rows;
	}
}

type SerializedPieceGenerator = {
	pieces: PieceType[];
	rngState: number[];
};

class PieceGenerator {
	#pieces: Piece[] = [];
	#rng: RNG;

	constructor(seed: number) {
		this.#rng = new RNG(seed);
		this.#fill();
	}

	static deserialize(state: SerializedPieceGenerator): PieceGenerator {
		const generator = new PieceGenerator(0);
		generator.#pieces = state.pieces.map(type => new Piece(type));
		generator.#rng = new RNG(state.rngState);
		return generator;
	}

	serialize(): SerializedPieceGenerator {
		return {
			pieces: this.#pieces.map(({ type }) => type),
			rngState: this.#rng.getState().slice(),
		};
	}

	#fill() {
		const types: PieceType[] = ["i", "o", "t", "l", "z", "j", "s"];
		const bag = types.map(type => new Piece(type));

		while (bag.length > 0) {
			const index = this.#rng.nextInt(0, bag.length);
			const choosen = bag.splice(index, 1)[0]!;
			this.#pieces.push(choosen);
		}
	}

	pull(): Piece {
		if (this.#pieces.length < 5) {
			this.#fill();
		}

		return this.#pieces.shift()!;
	}

	get next(): Piece[] {
		return this.#pieces.slice(0, 5);
	}
}

type SerializedTimer = {
	remaining: number;
};

class Timer {
	#remaining: number = 0;

	constructor() {}

	static deserialize(state: SerializedTimer): Timer {
		const timer = new Timer();

		timer.#remaining = state.remaining;

		return timer;
	}

	serialize(): SerializedTimer {
		return {
			remaining: this.#remaining,
		};
	}

	tick(): boolean {
		if (this.#remaining <= 0) {
			return false;
		}
		this.#remaining--;
		if (this.#remaining <= 0) {
			return true;
		}
		return false;
	}

	set(remaining: number) {
		this.#remaining = remaining;
	}

	stop() {
		this.#remaining = 0;
	}
}
