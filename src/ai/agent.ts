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
    const relevantMemories = await getRelevantMemories(character, task.task, 10);

    // Pick action based on plan and available actions
    let tryCount = 0;
    while (tryCount < 5) {
        try {
            const chosenActions = await pickAction(character, task, relevantMemories as unknown as Memory[]);

            console.log("--- Chosen Actions ---");
            console.log(chosenActions);

            const actionsObject = JSON.parse(chosenActions);

            if (actionsObject.length) {
                // Iterate over actions and send them to the websocket listener
                for (let action of actionsObject) {
                    ws.send(JSON.stringify(action));

                    await createMemory(character, `Task: ${task.task} -> Action: ${action}`);

                    if (action.type === "ToolSwitchEvent") {
                        await prisma.character.update({
                            where: {
                                id: character.id,
                            },
                            data: {
                                tool: action.data.tool,
                            },
                        });
                    } else if (action.type === "MoveEvent") {
                        await prisma.character.update({
                            where: {
                                id: character.id,
                            },
                            data: {
                                location: action.data.location,
                            },
                        });
                    }
                }
            }

            break;
        } catch (error) {
            console.log("Action could not be parsed as JSON.");
            console.log(error);
        }

        tryCount++;
    }
};

export { agentPlan, agentLoop };
