import { Memory, Task } from "@prisma/client";
import { createMemory, getRelevantMemories } from "./memory.js";
import { getLatestTask } from "./task.js";
import { getCharacter } from "../character.js";
import { pickAction } from "./action.js";

// Agent Loop
const agentLoop = async (characterId: string) => {
    console.log("--- Agent Loop ---");

    // Get character
    const character = await getCharacter(characterId);

    // Get latest task
    const task = await getLatestTask(character);

    console.log("--- Task ---");
    console.log(task);

    // Retrieve relevant memories
    const relevantMemories = await getRelevantMemories(
        character,
        task.task,
        15
    );

    console.log("--- Relevant Memories ---");
    console.log(relevantMemories);

    // Pick action based on plan and available actions
    const chosenAction = await pickAction(
        character,
        task,
        relevantMemories as unknown as Memory[]
    );

    console.log("--- Chosen Action ---");
    console.log(chosenAction);

    // // Execute action
    // const result = await executeAction(character, chosenAction);

    // // Save action to memory
    // createMemory(character, chosenAction);

    // // Call agentLoop again
    // agentLoop(characterId);
};

// The flow of the agent loop is as follows:
// - GeneratePlan
// - AgentLoop until plan is complete
// - Repeat

export { agentLoop };
