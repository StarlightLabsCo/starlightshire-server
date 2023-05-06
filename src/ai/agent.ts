import { Memory, Task } from "@prisma/client";
import { createMemory, getRelevantMemories } from "./memory.js";
import { getTask } from "./task.js";
import { getCharacter } from "../character.js";
import { pickAction } from "./action.js";
import { generatePlan } from "./planning.js";
import { prisma } from "../db.js";

// The flow of the agent loop is as follows:
// - GeneratePlan
// - AgentLoop until plan is complete
// - Repeat

const agentPlan = async (
    ws: WebSocket,
    data: {
        characterId: string;
    }
) => {
    const characterId = data.characterId;

    const character = await getCharacter(characterId);

    await generatePlan(character);
};

const agentLoop = async (
    ws: WebSocket,
    data: {
        characterId: string;
    }
) => {
    // Get character ID
    const characterId = data.characterId;

    // Get character
    const character = await getCharacter(characterId);

    console.log("--- Agent Loop ---");

    // Get latest task
    const task = await getTask(character);

    console.log("--- Task ---");
    console.log(task);

    // Retrieve relevant memories
    const relevantMemories = await getRelevantMemories(
        character,
        task.task,
        10
    );

    // Pick action based on plan and available actions
    let tryCount = 0;
    while (tryCount < 5) {
        try {
            const chosenAction = await pickAction(
                character,
                task,
                relevantMemories as unknown as Memory[]
            );

            console.log("--- Chosen Action ---");
            console.log(chosenAction);

            // Turn to webocket event & make

            let websocketMessage = JSON.parse(chosenAction);
            ws.send(JSON.stringify(websocketMessage));

            await createMemory(
                character,
                `Task: ${task.task} -> Action: ${chosenAction}`
            );

            if (websocketMessage.type === "ToolSwitchEvent") {
                await prisma.character.update({
                    where: {
                        id: character.id,
                    },
                    data: {
                        tool: websocketMessage.data.tool,
                    },
                });
            } else if (websocketMessage.type === "MoveEvent") {
                await prisma.character.update({
                    where: {
                        id: character.id,
                    },
                    data: {
                        location: websocketMessage.data.location,
                    },
                });
            }

            // TODO: Ask LLM if the action was enough to complete the task, if not create new task and add it to top of stack

            break;
        } catch (error) {
            console.log("Action could not be parsed as JSON.");
            console.log(error);
        }

        tryCount++;
    }
};

export { agentPlan, agentLoop };
