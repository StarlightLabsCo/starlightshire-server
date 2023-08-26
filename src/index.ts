// Environment Variables
import dotenv from "dotenv";
dotenv.config();

// CLI
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

// Webs Sockets
import { WebSocketServer } from "ws";

let wss;
let clients;

import { randomUUID } from "crypto";

export type ConnectionMetadata = {
    id: string;
};

export type StreamMessage = {
    type: string;
    data: any;
};

// Starlight
import { resetDb } from "./db.js";
import { initLogging, log } from "./logger.js";
import { createCharacters } from "./character.js";
import { getAction, saveActionResult } from "./ai/agent.js";
import { observe } from "./ai/observation.js";
import { startConversation, playerConversation } from "./ai/converstation.js";

const handlers = {
    GetAction: getAction,
    ActionExecuted: saveActionResult,
    Observation: observe,
    StartConversation: startConversation,
    PlayerConversation: playerConversation,
};

async function main() {
    await resetDb();

    const argv = await yargs(hideBin(process.argv)).option("m", {
        description: "Message for the run",
        type: "string",
    }).argv;

    await initLogging(argv.m as string | undefined);

    createCharacters();

    if (!process.env.PORT) {
        console.error("PORT environment variable not set");
        process.exit(1);
    }

    wss = new WebSocketServer({ port: process.env.PORT as any as number });
    clients = new Map();

    wss.on("connection", async (ws) => {
        log("[Main] WebSocket connection established");

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

        ws.on("message", async (message) => {
            // Check if message is valid
            if (
                !message ||
                message == undefined ||
                message.toString().length === 0
            ) {
                log("[Main] No message received. Skipping...");
                return;
            }

            // Parse message
            const streamMessage = JSON.parse(
                message.toString()
            ) as StreamMessage;

            // Check if parsed message is valid
            if (!streamMessage.type) {
                log("[Main] No type received. Skipping...");
                return;
            }

            if (!handlers[streamMessage.type]) {
                log("[Main] No handler found. Skipping...");
                return;
            }

            // Handle message
            await handlers[streamMessage.type](ws, streamMessage.data);
        });

        ws.on("close", () => {
            log(`[Main] connection (id = ${clients.get(ws).id}) closed`);
            clients.delete(ws);
        });
    });

    log(`[Main] WebSocket server listening on port ${process.env.PORT}`);
}

export { wss, clients };

main();
