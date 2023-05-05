// Available actions:
// - Move to a location
// - Attack another character
// - Chop a tree
// - Generic "do something" action & animation

import { openai } from "./openai.js";
import config from "../config.json" assert { type: "json" };
import { Character, Memory, Task } from "@prisma/client";

async function pickAction(
    character: Character,
    task: Task,
    relevantMemories: Memory[]
) {
    // Create prompt
    let prompt = "Character:\n";
    prompt += "- " + character.name + "\n";
    // prompt += "Location:\n";
    // prompt += "- " + character.location + "\n";
    prompt += "Memories:\n";
    for (let memory of relevantMemories) {
        prompt += "- " + memory.memory + "\n";
    }
    prompt += "Task:\n";
    prompt += "- " + task.task + "\n";
    prompt += "Available Actions:\n";
    prompt += "- Move to a location\n";
    prompt += "- Attack another character\n";
    prompt += "- Chop a tree\n";
    prompt += '- Generic "do something" action & animation\n';
    prompt +=
        '"Based on the above information and available actions, pick the most applicable action. You can only pick one.\n"';

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

async function executeAction(character, chosenAction) {
    return "";
}

export { pickAction, executeAction };
