import { Action } from "../actions.js";
import { getCharacter } from "../character.js";
import { convertTimeToString, extractJSON, getRelativeTime } from "../utils.js";
import { calculateMaxMemoriesForTask, getRelevantMemories } from "./memory.js";
import { createChatCompletion } from "./openai.js";
import * as fs from "fs";
import colors from "colors";

import { getUnfinishedTasks, updateTasks } from "./task.js";

import { log, setLogFile } from "../logger.js";

const actionHistory = [];
const actionSetWorldCommands = [];
const actionResults = [];

const replayTimestamp = new Date();
fs.mkdirSync(`./data/${replayTimestamp.getTime()}`);
setLogFile(`./data/${replayTimestamp.getTime()}/log.txt`);

// get string input from user to describe the run
import { createInterface } from "readline";
import { Memory } from "@prisma/client";
import OpenAI from "openai";
import { exit } from "process";

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

const description = await new Promise<string>((resolve) => {
    rl.question("Please describe the run: ", (description) => {
        resolve(description);
    });
});

fs.writeFileSync(
    `./data/${replayTimestamp.getTime()}/description.txt`,
    description
);
rl.close();

async function saveActionResult(
    ws: WebSocket,
    data: {
        characterId: string;
        result: string;
        resultTime: number;
    }
) {
    actionResults.push({
        characterId: data.characterId,
        result: data.result,
        time: data.resultTime,
    });
    const historyString = JSON.stringify(actionResults, null, 2);
    fs.writeFileSync(
        `./data/${replayTimestamp.getTime()}/results.txt`,
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
    const memorySet = new Set(); // A set to store unique memories

    let tasksArray = [];

    if (tasks.length > 0) {
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];

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

    if (actionHistory.length > 0) {
        prompt += `Previous Actions:\n`;
        // print the most recent 10 actions
        for (
            let i = Math.max(0, actionHistory.length - 10);
            i < actionHistory.length;
            i++
        ) {
            const action = actionHistory[i];
            const result = actionResults[i];
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
            log("--- Prompt ---");
            log(prompt);

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

            log("--- Response ---");
            log("Updated Tasks: ");

            // use regex to select a JSON array
            const taskArray = response.content.match(/\[.*\]/s)[0];

            const tasksJSON = JSON.parse(taskArray);

            log(tasksJSON);

            updateTasks(tasksJSON);

            return;
        } catch (e) {
            log(e);
            generationAttempts++;
        }
    }
}

let count = 5;

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
    if (count === 5) {
        await updateTaskList(data);

        count = 0;
    } else {
        count++;
    }

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

    if (tasks.length > 0) {
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];

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

    if (actionHistory.length > 0) {
        prompt += `Previous Actions:\n`;
        // print the most recent 10 actions
        for (
            let i = Math.max(0, actionHistory.length - 10);
            i < actionHistory.length;
            i++
        ) {
            const action = actionHistory[i];
            const result = actionResults[i];
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
            log("--- Prompt ---");
            log(prompt);

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

            log(colors.blue("[OPENAI] Actions:"));
            log(actions);

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

            console.log(response);

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

            console.log(action);

            // Verify action schema
            const verifiedAction = Action.parse(action);

            log("--- Verified Action ---");
            log(verifiedAction);

            ws.send(JSON.stringify(verifiedAction));

            // --- History --
            actionSetWorldCommands.push({
                type: "SetWorldTime",
                data: {
                    time: Number(data.time),
                },
            });

            const setWorldCommands = JSON.stringify(
                actionSetWorldCommands,
                null,
                2
            );

            fs.writeFileSync(
                `./data/${replayTimestamp.getTime()}/setWorldCommands.txt`,
                setWorldCommands
            );

            // ----

            actionHistory.push(verifiedAction);
            const historyString = JSON.stringify(actionHistory, null, 2);

            fs.writeFileSync(
                `./data/${replayTimestamp.getTime()}/actions.txt`,
                historyString
            );

            return;
        } catch (e) {
            log(e);
            generationAttempts++;
        }
    }
}

export { getAction, saveActionResult };
