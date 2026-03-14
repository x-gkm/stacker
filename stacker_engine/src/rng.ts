import { uniformInt } from "pure-rand/distribution/uniformInt";
import { xoroshiro128plus, xoroshiro128plusFromState } from "pure-rand/generator/xoroshiro128plus";
import type { JumpableRandomGenerator } from "pure-rand/types/JumpableRandomGenerator";

export default class RNG {
	#generator: JumpableRandomGenerator;

	constructor(seedOrState: number | readonly number[]) {
		if (typeof seedOrState === "number") {
			this.#generator = xoroshiro128plus(seedOrState);
		} else {
			this.#generator = xoroshiro128plusFromState(seedOrState);
		}
	}

	nextInt(a: number, b: number): number {
		return uniformInt(this.#generator, a, b - 1);
	}

	getState(): readonly number[] {
		return this.#generator.getState()
	}
}
