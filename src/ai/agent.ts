import { Action } from "../actions.js";
import { getCharacter } from "../character.js";
import { extractJSON } from "../utils.js";
import { calculateMaxMemoriesForTask, getRelevantMemories } from "./memory.js";
import { createChatCompletion } from "./openai.js";
import * as fs from "fs";

import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import { getUnfinishedTasks, updateTasks } from "./task.js";

TimeAgo.addDefaultLocale(en);

const timeAgo = new TimeAgo("en-US");

const actionHistory = [];
const actionResults = [];

const replayTimestamp = new Date();
fs.mkdirSync(`./data/${replayTimestamp.getTime()}`);

// get string input from user to describe the run
import { createInterface } from "readline";

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
    }
) {
    actionResults.push({
        characterId: data.characterId,
        result: data.result,
        timestamp: new Date(),
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
                // createdAt: timeAgo.format(task.createdAt),
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
                const memoryKey = memory.memory + memory.createdAt;
                if (!memorySet.has(memoryKey)) {
                    memorySet.add(memoryKey);
                    allMemories.push(memory);
                }
            }
        }

        prompt += `Tasks:\n${JSON.stringify(tasksArray, null, 2)}\n\n`;
    }

    allMemories.sort((a, b) => {
        return a.createdAt.getTime() - b.createdAt.getTime();
    });

    let numMemories = allMemories.length > 10 ? 10 : allMemories.length;

    if (allMemories.length > 0) {
        prompt += `Memories:\n`;
        for (let i = 0; i < numMemories; i++) {
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
            prompt += `- [${action.type}]: ${result.result} [${timeAgo.format(
                result.timestamp
            )}]\n`;
        }
        prompt += "\n";
    }

    prompt += `Given the available information, update your task list. Replace the entire JSON array by removing completed tasks, updating existing tasks with new information and priorities, and create new tasks based on the provided info. Keep the list as concise as possible.`;

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
                    content: "Updated Tasks:",
                },
            ]);

            console.log("--- Response ---");
            console.log("Updated Tasks: ");

            // use regex to select a JSON array
            const taskArray = response.match(/\[.*\]/s)[0];

            const tasksJSON = JSON.parse(taskArray);

            console.log(tasksJSON);

            updateTasks(tasksJSON);

            return;
        } catch (e) {
            console.log(e);
            generationAttempts++;
        }
    }
}

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
    await updateTaskList(data);

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

    let tasksArray = []; // An array to store task objects

    if (tasks.length > 0) {
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];

            const taskObj = {
                task: task.task,
                priority: task.priority,
                // createdAt: timeAgo.format(task.createdAt),
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
                const memoryKey = memory.memory + memory.createdAt;
                if (!memorySet.has(memoryKey)) {
                    memorySet.add(memoryKey);
                    allMemories.push(memory);
                }
            }
        }

        prompt += `Tasks:\n${JSON.stringify(tasksArray, null, 2)}\n\n`;
    }

    allMemories.sort((a, b) => {
        return a.createdAt.getTime() - b.createdAt.getTime();
    });

    let numMemories = allMemories.length > 10 ? 10 : allMemories.length;

    if (allMemories.length > 0) {
        prompt += `Memories:\n`;
        for (let i = 0; i < numMemories; i++) {
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
            prompt += `- [${action.type}]: ${result.result} [${timeAgo.format(
                result.timestamp
            )}]\n`;
        }
        prompt += "\n";
    }

    prompt += `Given the available information, update your task list, and pick the best available action to accomplish the highest priority task. Respond in JSON: { type: [ActionType], data: {characterId optional parameters}}. Please note that if an action is in the available items list, you can execute it immediately, without needing to change or move. First you should list your reasoning and create a plan, and then using that plan, select an action and create a JSON object for that action with the necessary info. The JSON object must be immediately after "Action: " as we're using regex to parse it.\n\n`;

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
            actionHistory.push(verifiedAction);
            const historyString = JSON.stringify(actionHistory, null, 2);

            fs.writeFileSync(
                `./data/${replayTimestamp.getTime()}/actions.txt`,
                historyString
            );

            return;
        } catch (e) {
            console.log(e);
            generationAttempts++;
        }
    }
}

export { getAction, saveActionResult };
