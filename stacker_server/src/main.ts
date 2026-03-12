import * as engine from "stacker_engine";
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({
	port: 8080,
});

wss.on("connection", ws => {
	const seed = Date.now() ^ (Math.random() * 0x100000000);

	for (const client of wss.clients) {
		client.send(JSON.stringify({ seed }));
	}

	ws.on("message", msg => {
		for (const client of wss.clients) {
			if (client === ws) {
				continue;
			}

			client.send(msg.toString());
		}
	});
});
