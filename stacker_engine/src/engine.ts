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
export type Cell = PieceType | null;
export type Coords = [number, number];
export type Rotation = 0 | 1 | 2 | 3;

export const PILE_WIDTH = 10;
export const PILE_HEIGHT = 40;

export const ENGINE_FPS = 60;

export class Piece {
	#type: PieceType;
	#coords: Coords;
	#direction: Rotation;
	#blocks: Coords[];

	constructor(
		type: PieceType,
		x: number = 0,
		y: number = 0,
		rotation: Rotation = 0,
	) {
		this.#type = type;
		this.#coords = [x, y];
		this.#direction = rotation;
		this.#blocks = NORTH_PIECES[type];
		for (let i = 0; i < rotation; i++) {
			this.#blocks = this.#blocks.map(([x, y]) => [y, -x]);
		}
		this.#blocks = this.#blocks.map(([bx, by]) => [bx + x, by + y]);
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

	get type(): PieceType {
		return this.#type;
	}

	get blocks(): Coords[] {
		return this.#blocks;
	}
}

export class Engine {
	#frameInputs: Input[] = [];
	#pile = new Pile();
	#generator: PieceGenerator;
	#activePiece: Piece;
	#lowestY: number;
	#ghostPiece: Piece;
	#holdPiece: Piece | null = null;
	#holdLocked = false;
	#gravityTimer: Timer;
	#softdropTimer: Timer;
	#moveLeft: boolean = false;
	#moveRight: boolean = false;
	#dasDirection: "left" | "right" | null = null;
	#dasTimer: Timer;
	#arrTimer: Timer;
	#lockTimer: Timer;
	#resetCounter: number;

	constructor(seed: number) {
		this.#generator = new PieceGenerator(seed);

		this.#activePiece = Piece.spawn(this.#generator.pull().type);
		this.#lowestY = Math.min(
			...this.#activePiece.blocks.map(([_, y]) => y),
		);
		this.#ghostPiece = this.#pile.calculateGhost(this.#activePiece);

		this.#gravityTimer = new Timer(() => {
			this.#fall();
			this.#gravityTimer.restart();
		}, 60);

		this.#softdropTimer = new Timer(() => {
			this.#fall();
			this.#softdropTimer.restart();
		}, 3);

		this.#gravityTimer.restart();

		this.#dasTimer = new Timer(() => {
			this.#arrTimer.restart();
		}, 6);

		this.#arrTimer = new Timer(() => {
			if (this.#dasDirection === null) {
				return;
			}

			this.#move(this.#dasDirection);
			this.#arrTimer.restart();
		}, 1);

		this.#lockTimer = new Timer(() => {
			this.#tryLock();
		}, 30);

		this.#resetCounter = 0;
	}

	queueInput(input: Input) {
		this.#frameInputs.push(input);
	}

	update() {
		this.#gravityTimer.tick();
		this.#softdropTimer.tick();
		this.#dasTimer.tick();
		this.#arrTimer.tick();
		this.#lockTimer.tick();
		for (const input of this.#frameInputs) {
			this.#handleInput(input);
		}
		this.#frameInputs.length = 0;
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
				this.#dasTimer.restart();
				this.#arrTimer.stop();
				break;
			case "startMoveRight":
				this.#moveRight = true;
				this.#move("right");
				this.#dasDirection = "right";
				this.#dasTimer.restart();
				this.#arrTimer.stop();
				break;
			case "stopMoveLeft":
				this.#moveLeft = false;
				if (this.#moveRight) {
					this.#dasDirection = "right";
					this.#dasTimer.restart();
				} else {
					this.#dasDirection = null;
					this.#dasTimer.stop();
				}
				this.#arrTimer.stop();
				break;
			case "stopMoveRight":
				this.#moveRight = false;
				if (this.#moveLeft) {
					this.#dasDirection = "left";
					this.#dasTimer.restart();
				} else {
					this.#dasDirection = null;
					this.#dasTimer.stop();
				}
				this.#arrTimer.stop();
				break;
			case "startSoftdrop":
				this.#fall();
				this.#gravityTimer.stop();
				this.#softdropTimer.restart();
				break;
			case "stopSoftdrop":
				this.#softdropTimer.stop();
				this.#gravityTimer.restart();
				break;
		}
	}

	#rotate(rotation: Rotation) {
		for (let i = 0; i < 5; i++) {
			const branched = this.#activePiece.changedBy(0, 0, rotation, i);
			if (!this.#pile.hasOverlap(branched.blocks)) {
				this.#setActive(branched);
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
		this.#pile.addPiece(this.#ghostPiece);
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
		this.#setActive(Piece.spawn(type));
		this.#resetCounter = 0;
		this.#lowestY = Math.min(
			...this.#activePiece.blocks.map(([_, y]) => y),
		);
	}

	#setActive(piece: Piece) {
		const prevLowestY = this.#lowestY;
		const prevPiece = this.#activePiece;

		this.#activePiece = piece;
		this.#ghostPiece = this.#pile.calculateGhost(this.#activePiece);
		this.#lowestY = Math.min(
			this.#lowestY,
			...this.#activePiece.blocks.map(([_, y]) => y),
		);

		if (this.#lowestY < prevLowestY) {
			this.#resetCounter = 0;
		}

		if (!this.#activePiece.equals(prevPiece)) {
			if (!this.#canFall()) {
				this.#lockTimer.restart();
			} else {
				this.#lockTimer.stop();
			}
		}

		this.#resetCounter++;

		if (this.#resetCounter >= 15) {
			this.#tryLock();
		}
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

class Pile {
	#rows: Cell[][] = [];

	constructor() {
		for (let i = 0; i < PILE_HEIGHT; i++) {
			this.#rows.push(this.#emptyRow());
		}
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
			}
		}
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

	get rows(): readonly (readonly Cell[])[] {
		return this.#rows;
	}
}

class PieceGenerator {
	#pieces: Piece[] = [];
	#rng: RNG;

	constructor(seed: number) {
		this.#rng = new RNG(seed);
		this.fill();
	}

	private fill() {
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
			this.fill();
		}

		return this.#pieces.shift()!;
	}

	get next(): Piece[] {
		return this.#pieces.slice(0, 5);
	}
}

class Timer {
	#fn: () => void;
	#timeout: number;
	#remaining: number = 0;

	constructor(fn: () => void, timeout: number) {
		this.#fn = fn;
		this.#timeout = timeout;
	}

	tick() {
		if (this.#remaining <= 0) {
			return;
		}
		this.#remaining--;
		if (this.#remaining <= 0) {
			this.#fn();
		}
	}

	restart() {
		this.#remaining = this.#timeout;
	}

	stop() {
		this.#remaining = 0;
	}
}
