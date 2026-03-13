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
	#frames: ClientMessage[] = [];
	constructor(ws: WebSocket) {
		this.#ws = ws;
		this.#id = Client.#nextId++;
		Client.#clients[this.#id] = this;

		this.#broadcast("addOpponent");
		this.#ws.on("close", () => {
			this.#broadcast("removeOpponent");
			delete Client.#clients[this.#id];
		});

		this.#ws.on("message", msg => {
			const data: ClientMessage = JSON.parse(msg.toString());
			this.#frames.push(data);
			this.#broadcast("opponentData", { data });
		});

		for (const client of Object.values(Client.#clients)) {
			if (client.#id === this.#id) {
				continue;
			}

			this.#send("addOpponent", { id: client.#id });
			for (const data of client.#frames) {
				this.#send("opponentData", { id: client.#id, data });
			}
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
