// Available actions:
// - Move to a location
// - Attack another character
// - Chop a tree
// - Generic "do something" action & animation

import { openai } from "./openai.js";
import config from "../config.json" assert { type: "json" };
import { Character, Memory, Task } from "@prisma/client";

const actions = [
    {
        description: "Move to a location",
        format: {
            type: "MoveEvent",
            data: {
                characterId: "",
                location: "",
            },
        },
    },
    {
        description: "Use the selected tool",
        format: {
            type: "ToolEvent",
            data: {
                characterId: "",
            },
        },
    },
    {
        description: "Switch tool",
        format: {
            type: "SwitchToolEvent",
            data: {
                characterId: "",
                tool: "",
            },
        },
    },
];

const locations = [
    {
        name: "Home",
        description: "Your home",
    },
    {
        name: "Lumberyard",
        description: "A section of forest with many trees",
    },
    {
        name: "Campfire",
        description: "A campfire",
    },
    {
        name: "Bridge",
        decription: "A bridge to the east island",
    },
    {
        name: "Berries",
        description: "A field of berries",
    },
    {
        name: "East Island",
        description: "A small island to the east",
    },
    {
        name: "North Outlook",
        description: "A lookout to the north",
    },
    {
        name: "Dock",
        description: "A dock to the south",
    },
    {
        name: "Skeleton Cave",
        description: "A cave near the dock, with many dangeorus skeletons",
    },
];

let tools = [
    {
        name: "sword",
    },
    {
        name: "pickaxe",
    },
    {
        name: "axe",
    },
    {
        name: "hammer",
    },
    {
        name: "fishingrod",
    },
    {
        name: "doing",
        description: "A generic tool for doing everything else",
    },
];

async function pickAction(character: Character, task: Task, relevantMemories: Memory[]): Promise<string> {
    // Create prompt
    let prompt = "Character:\n";
    prompt += "- Name: " + character.name + "\n";
    prompt += "- ID: " + character.id + "\n";
    prompt += "- Current location: " + character.location + "\n";
    prompt += "- Selected tool: " + character.tool + "\n";
    prompt += "Memories:\n";
    for (let memory of relevantMemories) {
        prompt += "- " + memory.memory + "\n";
    }
    prompt += "Available Locations:\n";
    for (let location of locations) {
        prompt += "- " + location.name + "\n";
        prompt += "  - " + location.description + "\n";
    }
    prompt += "Available Tools:\n";
    for (let tool of tools) {
        prompt += "- " + tool.name + "\n";
        if (tool.description) {
            prompt += "  - " + tool.description + "\n";
        }
    }
    prompt += "Goal:\n";
    prompt += "- " + task.task + "\n";
    prompt += "Available Actions:\n";
    for (let action of actions) {
        prompt += "- " + action.description + "\n";
        prompt += "  - " + JSON.stringify(action.format) + "\n";
    }
    prompt +=
        "Based on the above information and available actions, give an array of the most applicable actions to accomplish the goal, and create the corresponding JSON object. Ensure the output is always in an array. If only one action is needed, do not add more. Do not create new actions. Only return a JSON parseable object, no commentary!\n";

    console.log("--- Prompt ---");
    console.log(prompt);

    // Get response
    const completion = await openai.createChatCompletion({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
    });

    // Return response
    return completion.data.choices[0].message.content;
}

export { pickAction };
