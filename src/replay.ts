import * as fs from "fs";
import dotenv from "dotenv";
dotenv.config();

// Webs Sockets
import { WebSocketServer } from "ws";

if (!process.env.PORT) {
    console.error("PORT environment variable not set");
    process.exit(1);
}
const wss = new WebSocketServer({ port: process.env.PORT as any as number });
const clients = new Map();

import { randomUUID } from "crypto";

export type ConnectionMetadata = {
    id: string;
};

export type StreamMessage = {
    type: string;
    data: any;
};

export function loadHistory() {
    const historyString = fs.readFileSync("history.txt", "utf8");
    const history = JSON.parse(historyString);
    return history;
}

wss.on("connection", async (ws) => {
    // Init Connection
    console.log("WebSocket connection established");

    const connectionMetadata: ConnectionMetadata = {
        id: randomUUID(),
    };

    clients.set(ws, connectionMetadata);

    ws.send(
        JSON.stringify({
            type: "ConnectionEstablished",
            data: connectionMetadata.id,
        })
    );

    const history = loadHistory();

    for (const action of history) {
        console.log("--- Replaying Action ---");
        console.log(action);
        ws.send(JSON.stringify(action));
    }
});

console.log(`WebSocket server listening on port ${process.env.PORT}`);

export { wss, clients };
