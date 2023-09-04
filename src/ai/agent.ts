import * as fs from "fs";
import colors from "colors";
import OpenAI from "openai";
import { Memory } from "@prisma/client";

import { Action } from "../actions.js";
import { globalLogPath, log } from "../logger.js";
import { getCharacter } from "../seed.js";
import { getUnfinishedTasks, updateTasks } from "./task.js";
import {
    convertTimeToString,
    getHungerDescription,
    getRelativeTime,
} from "../utils.js";
import { calculateMaxMemoriesForTask, getRelevantMemories } from "./memory.js";
import { createChatCompletion } from "./openai.js";
import { instance } from "../index.js";

const actionCounter = {};
const actionHistory = {};
const actionSetWorldCommands = {};
const actionResults = {};

let occupiedAgents = {};

async function occupyAgent(
    ws: WebSocket,
    data: { characterId: string; reason: string; time: number }
) {
    occupiedAgents[data.characterId] = true;

    if (
        actionHistory[data.characterId].length !=
        actionResults[data.characterId].length
    ) {
        actionResults[data.characterId].push({
            characterId: data.characterId,
            result: data.reason,
            time: data.time,
        });
    }

    log("Occupied agent " + data.characterId, "info", data.characterId);
}

async function occupyAgents(agents: string[]) {
    agents.forEach((agent) => {
        occupiedAgents[agent] = true;
    });
}

async function deoccupyAgents(agents: string[]) {
    agents.forEach((agent) => {
        delete occupiedAgents[agent];
    });
}

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

interface EnvironmentData {
    type: string;
    health?: string;
    itemId?: string;
    x: number;
    y: number;
    distance: number;
}

const getDirection = (x: number, y: number): string => {
    const degree = Math.atan2(y, x) * (180 / Math.PI);
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
    const index = Math.round(((degree + 360) % 360) / 45);
    return directions[index];
};

const parseEnvironment = (environmentString: string): EnvironmentData => {
    const regex =
        /^(.+?)( \(Health: (.+?)\)| \(Item ID: (.+?)\))?\s?\[X: (.+?), Y: (.+?), Distance: (.+?)m\]$/;
    const match = environmentString.match(regex);
    if (match) {
        return {
            type: match[1],
            health: match[3],
            itemId: match[4],
            x: parseFloat(match[5]),
            y: parseFloat(match[6]),
            distance: parseFloat(match[7]),
        };
    }
    throw new Error("Could not parse environment string.");
};

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
    satiety: number;
    maxSatiety: number;
}) {
    // -- Get Action --
    const character = await getCharacter(instance.id, data.characterId);

    let prompt = "";
    prompt += `Character: \n`;
    prompt += `- ID: ${character.unityId}\n`;
    prompt += `- Name: ${character.name}\n`;
    prompt += `- Age: ${character.age}\n`;
    prompt += `- Occupation: ${character.occupation}\n`;
    prompt += `- Personality: ${character.personality.join(", ")}\n\n`;

    prompt += `Location: ${data.location.x}, ${data.location.y}\n\n`;

    prompt += `Time: ${convertTimeToString(data.time)}\n\n`;

    prompt += `Hunger: ${getHungerDescription(
        data.satiety,
        data.maxSatiety
    )}\n\n`;

    prompt += `Environment:\n`;
    for (let i = 0; i < data.environment.length; i++) {
        const parsedData = parseEnvironment(data.environment[i]);
        const direction = getDirection(parsedData.x, parsedData.y);
        const distance = parsedData.distance.toPrecision(2);
        let healthOrItemId = parsedData.health
            ? `(Health: ${parsedData.health})`
            : `(Item ID: ${parsedData.itemId})`;
        prompt += `- ${parsedData.type} ${healthOrItemId} [Direction: ${direction}, Distance: ${distance}m]\n`;
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

    if (tasks[character.unityId].length > 0) {
        for (let i = 0; i < tasks[character.unityId].length; i++) {
            const task = tasks[character.unityId][i];

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

    if (actionHistory[character.unityId].length > 0) {
        prompt += `Previous Actions:\n`;
        // print the most recent 10 actions
        for (
            let i = Math.max(0, actionHistory[character.unityId].length - 10);
            i < actionHistory[character.unityId].length;
            i++
        ) {
            log(`Getting action ${i}`, "info", character.unityId);
            const action = actionHistory[character.unityId][i];
            log(`Getting result ${i}`, "info", character.unityId);
            const result = actionResults[character.unityId][i];

            if (result === undefined) {
                log(
                    colors.red(
                        `Result for action ${i} is undefined. Skipping...`
                    ),
                    "info",
                    character.unityId
                );

                log(action[i], "info", character.unityId);

                continue;
            }

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
            log("--- Prompt ---", "info", character.unityId);
            log(prompt, "info", character.unityId);

            const response = await createChatCompletion(
                [
                    {
                        role: "user",
                        content: prompt,
                    },
                    {
                        role: "assistant",
                        content: "Updated Tasks:",
                    },
                ],
                undefined,
                undefined,
                "updateTaskList",
                character.id
            );

            log("--- Response ---", "info", character.unityId);
            log("Updated Tasks: ", "info", character.unityId);

            // use regex to select a JSON array
            const taskArray = response.content.match(/\[.*\]/s)[0];
            const tasksJSON = JSON.parse(taskArray);

            log(tasksJSON, "info", character.unityId);

            updateTasks(character.id, tasksJSON);

            return;
        } catch (e) {
            log(e, "error", character.unityId);
            generationAttempts++;
        }
    }
}

async function updateTaskListAfterConversation(
    characterId: string,
    memories: string[]
) {
    const character = await getCharacter(instance.id, characterId);

    const tasks = await getUnfinishedTasks(character);

    let prompt = "";
    prompt += `Character: \n`;
    prompt += `- ID: ${character.unityId}\n`;
    prompt += `- Name: ${character.name}\n`;
    prompt += `- Age: ${character.age}\n`;
    prompt += `- Occupation: ${character.occupation}\n`;
    prompt += `- Personality: ${character.personality.join(", ")}\n\n`;

    prompt += `Action items & memories from conversation just now:\n`;
    for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        prompt += `- ${memory}\n`;
    }

    let tasksArray = [];
    if (tasks[character.unityId].length > 0) {
        for (let i = 0; i < tasks[character.unityId].length; i++) {
            const task = tasks[character.unityId][i];

            const taskObj = {
                task: task.task,
                priority: task.priority,
            };

            tasksArray.push(taskObj);
        }

        prompt += `Tasks:\n${JSON.stringify(tasksArray, null, 2)}\n\n`;
    }

    prompt += `Given the available information from a conversation you just had, update your task list, placing priority on the conversation action items & memories. Replace the entire JSON array by removing completed tasks, updating existing tasks with new information and priorities, and create new tasks based on the provided info. Keep the list as concise as possible. The result must be sorted by priority, with the highest priority task at the top.`;

    let generationAttempts = 0;
    while (generationAttempts < 5) {
        try {
            log(
                "--- Conversation Task Update Prompt ---",
                "info",
                character.unityId
            );
            log(prompt, "info", character.unityId);

            const response = await createChatCompletion(
                [
                    {
                        role: "user",
                        content: prompt,
                    },
                    {
                        role: "assistant",
                        content: "Updated Tasks:",
                    },
                ],
                undefined,
                undefined,
                "updateTaskListAfterConversation",
                character.id
            );

            log("--- Response ---", "info", character.unityId);
            log("Updated Tasks: ", "info", character.unityId);

            // use regex to select a JSON array
            const taskArray = response.content.match(/\[.*\]/s)[0];
            const tasksJSON = JSON.parse(taskArray);

            // Sort the tasks by priority
            tasksJSON.sort((a, b) => {
                return a.priority - b.priority;
            });

            log(tasksJSON, "info", character.unityId);

            updateTasks(character.id, tasksJSON);

            return;
        } catch (e) {
            log(e, "error", character.unityId);
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
        satiety: number;
        maxSatiety: number;
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
        // Every 5 actions, update the task list

        await updateTaskList(data);
    }
    count++;

    // -- Get Action --
    const character = await getCharacter(instance.id, data.characterId);

    let prompt = "";
    // TODO: replace with planning.ts 's generate agent summary function or something like it(?)
    prompt += `Character: \n`;
    prompt += `- ID: ${character.unityId}\n`;
    prompt += `- Name: ${character.name}\n`;
    prompt += `- Age: ${character.age}\n`;
    prompt += `- Occupation: ${character.occupation}\n`;
    prompt += `- Personality: ${character.personality.join(", ")}\n\n`;

    prompt += `Location: ${data.location.x}, ${data.location.y}\n\n`;

    prompt += `Time: ${convertTimeToString(data.time)}\n\n`;

    prompt += `Hunger: ${getHungerDescription(
        data.satiety,
        data.maxSatiety
    )}\n\n`;

    prompt += `Environment:\n`;
    for (let i = 0; i < data.environment.length; i++) {
        const parsedData = parseEnvironment(data.environment[i]);
        const direction = getDirection(parsedData.x, parsedData.y);
        const distance = parsedData.distance.toPrecision(2);
        let healthOrItemId = parsedData.health
            ? `(Health: ${parsedData.health})`
            : `(Item ID: ${parsedData.itemId})`;
        prompt += `- ${parsedData.type} ${healthOrItemId} [Direction: ${direction}, Distance: ${distance}m]\n`;
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

    if (tasks[character.unityId].length > 0) {
        for (let i = 0; i < tasks[character.unityId].length; i++) {
            const task = tasks[character.unityId][i];

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

    if (actionHistory[character.unityId].length > 0) {
        prompt += `Previous Actions:\n`;
        // print the most recent 10 actions
        for (
            let i = Math.max(0, actionHistory[character.unityId].length - 10);
            i < actionHistory[character.unityId].length;
            i++
        ) {
            log(`Getting action ${i}`, "info", character.unityId);
            const action = actionHistory[character.unityId][i];

            log(`Getting result ${i}`, "info", character.unityId);
            const result = actionResults[character.unityId][i];

            if (result === undefined) {
                log(
                    colors.red(
                        `Result for action ${i} is undefined. Skipping...`
                    ),
                    "info",
                    character.unityId
                );

                log(action[i], "info", character.unityId);

                continue;
            }

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
            log("--- Prompt ---", "info", character.unityId);
            log(prompt, "info", character.unityId);

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

            // Log action functions
            log("--- Action Functions ---", "info", character.unityId);
            log(actions, "info", character.unityId);

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
                actions,
                undefined,
                "getAction",
                character.id
            );

            if (occupiedAgents[character.unityId]) {
                log(
                    colors.red(
                        `Agent ${character.unityId} is already occupied. Skipping...`
                    ),
                    "info",
                    character.unityId
                );
                return;
            }

            log("--- Response ---", "info", character.unityId);
            log(response, "info", character.unityId);

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

            log("--- Verified Action ---", "info", character.unityId);
            log(verifiedAction, "info", character.unityId);

            ws.send(JSON.stringify(verifiedAction));

            // Save World Time
            actionSetWorldCommands[character.unityId].push({
                type: "SetWorldTime",
                data: {
                    time: Number(data.time),
                },
            });

            const setWorldCommands = JSON.stringify(
                actionSetWorldCommands[character.unityId],
                null,
                2
            );

            fs.writeFileSync(
                `${globalLogPath}${character.unityId}_setWorldCommands.txt`,
                setWorldCommands
            );

            // Action History
            actionHistory[character.unityId].push(verifiedAction);
            const historyString = JSON.stringify(
                actionHistory[character.unityId],
                null,
                2
            );

            fs.writeFileSync(
                `${globalLogPath}${character.unityId}_actions.txt`,
                historyString
            );

            return;
        } catch (e) {
            log(e, "error", character.unityId);
            generationAttempts++;
        }
    }
}

export {
    getAction,
    saveActionResult,
    occupyAgents,
    deoccupyAgents,
    updateTaskListAfterConversation,
    occupyAgent,
};
