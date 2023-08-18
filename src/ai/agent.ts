import * as fs from "fs";
import colors from "colors";
import OpenAI from "openai";
import { Memory } from "@prisma/client";

import { Action } from "../actions.js";
import { globalLogPath, log } from "../logger.js";
import { getCharacter } from "../character.js";
import { getUnfinishedTasks, updateTasks } from "./task.js";
import { convertTimeToString, getRelativeTime } from "../utils.js";
import { calculateMaxMemoriesForTask, getRelevantMemories } from "./memory.js";
import { createChatCompletion } from "./openai.js";

const actionCounter = {};
const actionHistory = {};
const actionSetWorldCommands = {};
const actionResults = {};

let occupiedAgents = {};

async function saveActionResult(
    ws: WebSocket,
    data: {
        characterId: string;
        result: string;
        resultTime: number;
    }
) {
    if (actionResults[data.characterId] === undefined)
        actionResults[data.characterId] = [];

    actionResults[data.characterId].push({
        characterId: data.characterId,
        result: data.result,
        time: data.resultTime,
    });

    const historyString = JSON.stringify(
        actionResults[data.characterId],
        null,
        2
    );

    fs.writeFileSync(
        `${globalLogPath}${data.characterId}_results.txt`,
        historyString
    );
}

async function updateTaskList(data: {
    characterId: string;
    location: {
        x: number;
        y: number;
    };
    availableActions: string[];
    inventory: string[];
    environment: string[];
    hitbox: string[];
    time: number;
}) {
    // -- Get Action --
    const character = await getCharacter(data.characterId);

    let prompt = "";
    prompt += `Character: \n`;
    prompt += `- ID: ${character.id}\n`;
    prompt += `- Name: ${character.name}\n`;
    prompt += `- Age: ${character.age}\n`;
    prompt += `- Occupation: ${character.occupation}\n`;
    prompt += `- Personality: ${character.personality.join(", ")}\n\n`;

    prompt += `Location: ${data.location.x}, ${data.location.y}\n\n`;

    prompt += `Time: ${convertTimeToString(data.time)}\n\n`;

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
    const memorySet = new Set();

    let tasksArray = [];

    if (tasks[character.id].length > 0) {
        for (let i = 0; i < tasks[character.id].length; i++) {
            const task = tasks[character.id][i];

            const taskObj = {
                task: task.task,
                priority: task.priority,
            };

            tasksArray.push(taskObj);

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
                const memoryKey = memory.memory + memory.time;
                if (!memorySet.has(memoryKey)) {
                    memorySet.add(memoryKey);
                    allMemories.push(memory);
                }
            }
        }

        prompt += `Tasks:\n${JSON.stringify(tasksArray, null, 2)}\n\n`;
    }

    allMemories.sort((a, b) => {
        return a.createdAt - b.createdAt;
    });

    let numMemories = allMemories.length > 15 ? 15 : allMemories.length;

    if (allMemories.length > 0) {
        prompt += `Memories:\n`;
        for (let i = 0; i < numMemories; i++) {
            const memory = allMemories[i];
            prompt += `- ${memory.memory} [${getRelativeTime(
                memory.time,
                data.time
            )}]\n`;
        }
        prompt += "\n";
    }

    prompt += `Available Actions:\n`;

    // Turn the available actions string array into a set to remove duplicates
    const availableActionsSet = new Set(data.availableActions);
    data.availableActions = Array.from(availableActionsSet);
    for (let i = 0; i < data.availableActions.length; i++) {
        const action = JSON.parse(data.availableActions[i]);
        prompt += `- ${action.name}: ${action.description}\n`;
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

    if (actionHistory[character.id].length > 0) {
        prompt += `Previous Actions:\n`;
        // print the most recent 10 actions
        for (
            let i = Math.max(0, actionHistory[character.id].length - 10);
            i < actionHistory[character.id].length;
            i++
        ) {
            const action = actionHistory[character.id][i];
            const result = actionResults[character.id][i];
            prompt += `- [${action.type}]: ${result.result} [${getRelativeTime(
                result.time,
                data.time
            )}]\n`;
        }
        prompt += "\n";
    }

    prompt += `Given the available information, update your task list. Take into consideration the time of day, environment, personality of the character, and more. Replace the entire JSON array by removing completed tasks, updating existing tasks with new information and priorities, and create new tasks based on the provided info. Keep the list as concise as possible. Remember focus on the time of day to adjust priorities.`;

    let generationAttempts = 0;
    while (generationAttempts < 10) {
        try {
            log("--- Prompt ---", "info", character.id);
            log(prompt, "info", character.id);

            const response = await createChatCompletion([
                {
                    role: "user",
                    content: prompt,
                },
                {
                    role: "assistant",
                    content: "Updated Tasks:",
                },
            ]);

            log("--- Response ---", "info", character.id);
            log("Updated Tasks: ", "info", character.id);

            // use regex to select a JSON array
            const taskArray = response.content.match(/\[.*\]/s)[0];
            const tasksJSON = JSON.parse(taskArray);

            log(tasksJSON, "info", character.id);

            updateTasks(character.id, tasksJSON);

            return;
        } catch (e) {
            log(e, "error", character.id);
            generationAttempts++;
        }
    }
}

let count = 3;

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
        time: number;
    }
) {
    // init action history
    if (actionHistory[data.characterId] === undefined) {
        actionHistory[data.characterId] = [];
    }

    if (actionSetWorldCommands[data.characterId] === undefined) {
        actionSetWorldCommands[data.characterId] = [];
    }

    if (actionResults[data.characterId] === undefined) {
        actionResults[data.characterId] = [];
    }

    if (actionCounter[data.characterId] === undefined) {
        actionCounter[data.characterId] = 1;
        await updateTaskList(data);
    }

    if (actionCounter[data.characterId] % 5 == 0) {
        await updateTaskList(data);
    }
    count++;

    // -- Get Action --
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

    prompt += `Time: ${convertTimeToString(data.time)}\n\n`;

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
    const allMemories = [] as Memory[];
    const memorySet = new Set(); // A set to store unique memories

    let tasksArray = []; // An array to store task objects

    if (tasks[character.id].length > 0) {
        for (let i = 0; i < tasks[character.id].length; i++) {
            const task = tasks[character.id][i];

            const taskObj = {
                task: task.task,
                priority: task.priority,
            };

            tasksArray.push(taskObj); // Add each task object to the array

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
                const memoryKey = memory.memory + memory.time;
                if (!memorySet.has(memoryKey)) {
                    memorySet.add(memoryKey);
                    allMemories.push(memory as unknown as Memory);
                }
            }
        }

        prompt += `Tasks:\n${JSON.stringify(tasksArray, null, 2)}\n\n`;
    }

    allMemories.sort((a, b) => {
        return a.time - b.time;
    });

    let numMemories = allMemories.length > 10 ? 10 : allMemories.length;

    if (allMemories.length > 0) {
        prompt += `Memories:\n`;
        for (
            let i = allMemories.length - 1;
            i > allMemories.length - 1 - numMemories;
            i--
        ) {
            const memory = allMemories[i];
            prompt += `- ${memory.memory} [${getRelativeTime(
                memory.time,
                data.time
            )}]\n`;
        }
        prompt += "\n";
    }

    if (data.hitbox.length > 0) {
        prompt += `Hitbox (what you would hit with a swing based action):\n`;
        for (let i = 0; i < data.hitbox.length; i++) {
            const hitbox = data.hitbox[i];
            prompt += `- ${hitbox}\n`;
        }
        prompt += "\n";
    }

    if (actionHistory[character.id].length > 0) {
        prompt += `Previous Actions:\n`;
        // print the most recent 10 actions
        for (
            let i = Math.max(0, actionHistory[character.id].length - 10);
            i < actionHistory[character.id].length;
            i++
        ) {
            const action = actionHistory[character.id][i];
            const result = actionResults[character.id][i];
            prompt += `- [${action.type}]: ${result.result} [${getRelativeTime(
                result.time,
                data.time
            )}]\n`;
        }
        prompt += "\n";
    }

    prompt += `Given the available information, pick the best available action function to accomplish your tasks.\n\n`;

    let generationAttempts = 0;
    while (generationAttempts < 10) {
        try {
            log("--- Prompt ---", "info", character.id);
            log(prompt, "info", character.id);

            // Turn the available actions string array into a set to remove duplicates
            const availableActionsSet = new Set(data.availableActions);
            data.availableActions = Array.from(availableActionsSet);

            let actions: OpenAI.Chat.Completions.CompletionCreateParams.CreateChatCompletionRequestNonStreaming.Function[] =
                [];

            for (let i = 0; i < data.availableActions.length; i++) {
                let action = JSON.parse(data.availableActions[i]);

                actions.push({
                    name: action.name,
                    description: action.description,
                    parameters: JSON.parse(action.parameters),
                });
            }
            prompt += "\n";

            const response = await createChatCompletion(
                [
                    {
                        role: "system",
                        content:
                            "You must select a function to call, and you can only call functions that have been provided. Do not provide any additional explanation.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                actions
            );

            // log("--- Actions ---", "info", character.id);
            // log(actions, "info", character.id);

            if (occupiedAgents[character.id]) {
                log(
                    colors.red(
                        `Agent ${character.id} is already occupied. Skipping...`
                    ),
                    "info",
                    character.id
                );
                return;
            }

            log("--- Response ---", "info", character.id);
            log(response, "info", character.id);

            let type = response.function_call.name;
            if (type.startsWith("drop")) {
                type = "drop";
            } else if (type.startsWith("add")) {
                type = "add_to_chest";
            } else if (type.startsWith("remove")) {
                type = "remove_from_chest";
            }

            const action = {
                type,
                data: JSON.parse(response.function_call.arguments),
            };

            // Verify action schema
            const verifiedAction = Action.parse(action);

            log("--- Verified Action ---", "info", character.id);
            log(verifiedAction, "info", character.id);

            ws.send(JSON.stringify(verifiedAction));

            // Save World Time
            actionSetWorldCommands[character.id].push({
                type: "SetWorldTime",
                data: {
                    time: Number(data.time),
                },
            });

            const setWorldCommands = JSON.stringify(
                actionSetWorldCommands[character.id],
                null,
                2
            );

            fs.writeFileSync(
                `${globalLogPath}${character.id}_setWorldCommands.txt`,
                setWorldCommands
            );

            // Action History
            actionHistory[character.id].push(verifiedAction);
            const historyString = JSON.stringify(
                actionHistory[character.id],
                null,
                2
            );

            fs.writeFileSync(
                `${globalLogPath}${character.id}_actions.txt`,
                historyString
            );

            return;
        } catch (e) {
            log(e, "error", character.id);
            generationAttempts++;
        }
    }
}

export { getAction, saveActionResult, occupiedAgents };
