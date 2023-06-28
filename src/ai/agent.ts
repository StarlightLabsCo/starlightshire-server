import { Action } from "../actions.js";
import { getCharacter } from "../character.js";
import { extractJSON } from "../utils.js";
import { calculateMaxMemoriesForTask, getRelevantMemories } from "./memory.js";
import { createChatCompletion } from "./openai.js";
import * as fs from "fs";

import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import { getUnfinishedTasks } from "./task.js";

TimeAgo.addDefaultLocale(en);

const timeAgo = new TimeAgo("en-US");

const history = [];

async function getAction(
    ws: WebSocket,
    data: {
        characterId: string;
        location: {
            x: number;
            y: number;
        };
        availableActions: string[];
        inventory: string[];
        environment: string[];
        hitbox: string[];
    }
) {
    const character = await getCharacter(data.characterId);

    let prompt = "";
    // TODO: replace with planning.ts 's generate agent summary function or something like it(?)
    prompt += `Character: \n`;
    prompt += `- ID: ${character.id}\n`;
    prompt += `- Name: ${character.name}\n`;
    prompt += `- Age: ${character.age}\n`;
    prompt += `- Occupation: ${character.occupation}\n`;
    prompt += `- Personality: ${character.personality.join(", ")}\n\n`;

    prompt += `Location: ${data.location.x}, ${data.location.y}\n\n`;
    prompt += `Environment:\n`;
    for (let i = 0; i < data.environment.length; i++) {
        const environment = data.environment[i];
        prompt += `- ${environment}\n`;
    }
    prompt += "\n";

    if (data.inventory.length > 0) {
        prompt += `Inventory (` + data.inventory.length + `/10)`;
        if (data.inventory.length === 10) {
            prompt += ` [FULL]`;
        }
        prompt += `:\n`;

        // Count the number of each item in the inventory
        const itemCounts = {};
        for (let i = 0; i < data.inventory.length; i++) {
            const item = data.inventory[i];
            if (itemCounts[item] === undefined) {
                itemCounts[item] = 0;
            }
            itemCounts[item]++;
        }

        // Print the items in the inventory
        for (const [item, count] of Object.entries(itemCounts)) {
            prompt += `- ${item} x ${count}\n`;
        }
        prompt += "\n";
    }

    const tasks = await getUnfinishedTasks(character);
    const allMemories = [];
    const memorySet = new Set(); // A set to store unique memories

    if (tasks.length > 0) {
        prompt += `Tasks:\n`;
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            prompt += `- ${task.task} [Priority: ${
                task.priority
            }] [${timeAgo.format(task.createdAt)}]\n`;

            const maxMemoriesForTask = calculateMaxMemoriesForTask(
                task.priority
            );

            const memories = await getRelevantMemories(
                character,
                task.task,
                maxMemoriesForTask
            );

            for (let j = 0; j < memories.length; j++) {
                const memory = memories[j];
                const memoryKey = memory.memory + memory.createdAt;
                if (!memorySet.has(memoryKey)) {
                    memorySet.add(memoryKey);
                    allMemories.push(memory);
                }
            }
        }
        prompt += "\n";
    }

    if (allMemories.length > 0) {
        prompt += `Memories:\n`;
        for (let i = 0; i < allMemories.length; i++) {
            const memory = allMemories[i];
            prompt += `- ${memory.memory} [${timeAgo.format(
                memory.createdAt
            )}]\n`;
        }
        prompt += "\n";
    }

    prompt += `Available Actions:\n`;

    // Turn the available actions string array into a set to remove duplicates
    const availableActionsSet = new Set(data.availableActions);
    data.availableActions = Array.from(availableActionsSet);
    for (let i = 0; i < data.availableActions.length; i++) {
        const action = data.availableActions[i];
        prompt += `- ${action}\n\n`;
    }
    prompt += "\n";

    if (data.hitbox.length > 0) {
        prompt += `Hitbox (what you would hit with a swing based action):\n`;
        for (let i = 0; i < data.hitbox.length; i++) {
            const hitbox = data.hitbox[i];
            prompt += `- ${hitbox}\n`;
        }
        prompt += "\n";
    }

    if (history.length > 0) {
        prompt += `Previous Actions:\n`;
        // print the most recent 5 actions
        for (let i = Math.max(0, history.length - 5); i < history.length; i++) {
            const action = history[i];
            prompt += `- [${action.type}]: ${JSON.stringify(action.data)}\n`;
        }
        prompt += "\n";
    }

    prompt += `Given the available actions and the assigned task, which should Thomas take? Respond in JSON: { type: [ActionType], data: {characterId optional parameters}}. Please note that if an action is in the available items list, you can execute it immediately, without needing to change or move. (e.g. if PickUpItem is in available actions, you can pick up that item by creating a PickUpItem json object.) First you should list your reasoning and create a plan, and then using that plan, select an action and create a JSON object for that action with the necessary info. The JSON object must be immediately after "Action: " as we're using regex to parse it.\n\n`;

    let generationAttempts = 0;
    while (generationAttempts < 10) {
        try {
            console.log("--- Prompt ---");
            console.log(prompt);

            const response = await createChatCompletion([
                {
                    role: "user",
                    content: prompt,
                },
                {
                    role: "assistant",
                    content: "Plan:",
                },
            ]);

            console.log("--- Response ---");
            console.log("Plan: ");
            console.log(response);

            const actionJSON = extractJSON(response);

            if (actionJSON === null) {
                throw new Error("No valid JSON object found in response");
            }
            // Verify action schema
            const verifiedAction = Action.parse(actionJSON);

            console.log("--- Verified Action ---");
            console.log(verifiedAction);

            ws.send(JSON.stringify(verifiedAction));

            // --- History --
            history.push(verifiedAction);
            const historyString = JSON.stringify(history, null, 2);

            fs.writeFileSync("history.txt", historyString);

            return;
        } catch (e) {
            console.log(e);
            generationAttempts++;
        }
    }
}

export { getAction };
