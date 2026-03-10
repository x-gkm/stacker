import { uniformInt } from "pure-rand/distribution/uniformInt";
import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";
import type { JumpableRandomGenerator } from "pure-rand/types/JumpableRandomGenerator";

export default class RNG {
	#generator: JumpableRandomGenerator

	constructor(seed: number) {
		this.#generator = xoroshiro128plus(seed);
	}

	nextInt(a: number, b: number): number {
		return uniformInt(this.#generator, a, b - 1);
	}
}