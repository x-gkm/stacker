import { Engine, type Input } from "stacker_engine";
import { type WebSocket, WebSocketServer } from "ws";

const wss = new WebSocketServer({
	port: 8080,
});

type ClientMessage =
	| { command: "inputs"; inputs: Input[] }
	| { command: "update" };

class Client {
	static #clients: Record<number, Client> = [];
	static #nextId = 0;
	#ws: WebSocket;
	#id: number;
	#engine = new Engine(0);
	constructor(ws: WebSocket) {
		this.#ws = ws;
		this.#id = Client.#nextId++;
		Client.#clients[this.#id] = this;

		this.#broadcast("newOpponent");
		this.#ws.on("close", () => {
			this.#broadcast("removeOpponent");
			delete Client.#clients[this.#id];
		});

		this.#ws.on("message", msg => {
			const data: ClientMessage = JSON.parse(msg.toString());
			switch (data.command) {
				case "inputs":
					for (const input of data.inputs) {
						this.#engine.queueInput(input);
					}
					break;
				case "update":
					this.#engine.update();
					if (this.#engine.attack > 0) {
						this.#applyAttack();
					}
					break;
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

	#applyAttack() {
		for (const client of Object.values(Client.#clients)) {
			if (client.#id === this.#id) {
				continue;
			}

			client.#engine.queueGarbage(this.#engine.attack);
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
