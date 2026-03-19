import { GarbageRollbackEngine, type Input } from "stacker_engine";
import { type WebSocket, WebSocketServer } from "ws";

const wss = new WebSocketServer({
	port: 8080,
});

type ClientMessage = { inputs: Input[] };

class Client {
	static #clients: Record<number, Client> = [];
	static #nextId = 0;
	#ws: WebSocket;
	#id: number;
	#engine = new GarbageRollbackEngine(0);
	constructor(ws: WebSocket) {
		this.#ws = ws;
		this.#id = Client.#nextId++;
		Client.#clients[this.#id] = this;

		Client.#resetAll();

		this.#broadcast("newOpponent");
		this.#ws.on("close", () => {
			this.#broadcast("removeOpponent");
			delete Client.#clients[this.#id];
		});

		this.#ws.on("message", msg => {
			const data: ClientMessage = JSON.parse(msg.toString());
			const frameOutcome = this.#engine.update(data.inputs);
			if (frameOutcome.attack > 0) {
				this.#applyAttack(frameOutcome.attack);
			}
			this.#broadcast("opponentData", { data });
		});

		for (const client of Object.values(Client.#clients)) {
			if (client.#id === this.#id) {
				continue;
			}

			this.#send("addOpponent", {
				id: client.#id,
				state: client.#engine.serialize(),
			});
		}
	}

	static #resetAll() {
		for (const key in this.#clients) {
			if (!this.#clients.hasOwnProperty(key)) {
				continue;
			}

			this.#clients[key]!.#engine = new GarbageRollbackEngine(0);
		}
	}

	#applyAttack(lines: number) {
		for (const client of Object.values(Client.#clients)) {
			if (client.#id === this.#id) {
				continue;
			}

			client.#engine.addGarbage(this.#engine.frame, lines);
		}
	}

	#send(command: string, msg?: any) {
		this.#ws.send(JSON.stringify({ command, ...msg }));
	}

	#broadcast(command: string, msg?: any) {
		for (const client of Object.values(Client.#clients)) {
			if (client.#id === this.#id) {
				continue;
			}

			client.#send(command, { id: this.#id, ...msg });
		}
	}
}

wss.on("connection", ws => {
	new Client(ws);
});
