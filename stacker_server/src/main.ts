import type { Input } from "stacker_engine";
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({
	port: 8080,
});

type ClientMessage =
	| { command: "inputs"; inputs: Input[] }
	| { command: "update" };

let lastId = 0;
const clients: { id: number, frames: ClientMessage[] }[] = [];

wss.on("connection", ws => {
	const currentId = lastId++;
	clients.push({ id: currentId, frames: [] });

	for (const socket of wss.clients) {
		if (socket === ws) {
			continue;
		}

		socket.send(
			JSON.stringify({
				command: "addOpponent",
				id: currentId,
			}),
		);
	}

	for (const client of clients) {
		if (client.id === currentId) {
			continue;
		}

		ws.send(
			JSON.stringify({
				command: "addOpponent",
				id: client.id,
			}),
		);
		for (const frame of client.frames) {
			ws.send(
				JSON.stringify({
					command: "opponentData",
					id: client.id,
					data: frame,
				}),
			);
		}
	}

	ws.on("message", msg => {
		const data = JSON.parse(msg.toString());
		clients.find(({ id }) => id === currentId).frames.push(data)

		for (const socket of wss.clients) {
			if (socket === ws) {
				continue;
			}

			socket.send(
				JSON.stringify({
					command: "opponentData",
					id: currentId,
					data,
				}),
			);
		}
	});
	ws.on("close", () => {
		clients.splice(clients.findIndex(({ id }) => id === currentId), 1);
		for (const socket of wss.clients) {
			if (socket === ws) {
				continue;
			}

			socket.send(
				JSON.stringify({
					command: "removeOpponent",
					id: currentId,
				}),
			);
		}
	});
});
