// Environment Variables
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

import { agentPlan, agentLoop } from "./ai/agent.js";

const handlers = {
    AgentPlan: agentPlan,
    AgentLoop: agentLoop,
};

console.log("Creating Thomas..");
import { createThomas } from "./character.js";

await createThomas();

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

    // Define event handlers
    ws.on("message", async (message) => {
        // Check if message is valid
        if (
            !message ||
            message == undefined ||
            message.toString().length === 0
        ) {
            console.log("No message received. Skipping...");
            return;
        }

        // Parse message
        const streamMessage = JSON.parse(message.toString()) as StreamMessage;

        // Check if parsed message is valid
        if (!streamMessage.type) {
            console.log("No type received. Skipping...");
            return;
        }

        if (!handlers[streamMessage.type]) {
            console.log("No handler found. Skipping...");
            return;
        }

        // Handle message
        await handlers[streamMessage.type](ws, streamMessage.data);
    });

    ws.on("close", () => {
        console.log(`connection (id = ${clients.get(ws).id}) closed`);
        clients.delete(ws);
    });
});

console.log(`WebSocket server listening on port ${process.env.PORT}`);

export { wss, clients };
