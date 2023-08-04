import * as fs from "fs";
import dotenv from "dotenv";
dotenv.config();

import cliSelect from "cli-select";

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

const dataFolders = fs.readdirSync("./data");

dataFolders.sort((a, b) => {
    return parseInt(b) - parseInt(a);
});

const selectedFolder = await cliSelect({
    values: dataFolders,
    valueRenderer: (value, selected) => {
        let description = "No description.txt found";
        if (fs.existsSync(`./data/${value}/description.txt`)) {
            description = fs.readFileSync(
                `./data/${value}/description.txt`,
                "utf8"
            );
        }

        let dateText = new Date(parseInt(value)).toLocaleString();

        return description ? `${dateText} - ${description}` : dateText;
    },
});

export function loadHistory() {
    const historyString = fs.readFileSync(
        `./data/${selectedFolder.value}/actions.txt`,
        "utf8"
    );

    const history = JSON.parse(historyString);

    const setWorldCommandsString = fs.readFileSync(
        `./data/${selectedFolder.value}/setWorldCommands.txt`,
        "utf8"
    );

    const setWorldCommands = JSON.parse(setWorldCommandsString);

    return {
        history: history,
        setWorldCommands: setWorldCommands,
    };
}

wss.on("connection", async (ws) => {
    // Init Connection
    console.log("WebSocket connection established");

    const connectionMetadata: ConnectionMetadata = {
        id: randomUUID(),
    };

    clients.set(ws, connectionMetadata);

    const data = loadHistory();
    let currentActionIndex = 0;

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

        if (streamMessage.type === "GetAction") {
            ws.send(JSON.stringify(data.setWorldCommands[currentActionIndex])); // SetWorldTime
            ws.send(JSON.stringify(data.history[currentActionIndex])); // Action
        } else if (streamMessage.type === "ActionExecuted") {
            currentActionIndex++;
        }
    });
});

console.log(`WebSocket server listening on port ${process.env.PORT}`);

export { wss, clients };
