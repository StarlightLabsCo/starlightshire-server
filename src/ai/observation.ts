import { getCharacter } from "../character.js";
import { createMemory } from "./memory.js";

async function observe(
    ws: WebSocket,
    data: {
        observerId: string;
        observation: string;
    }
) {
    console.log("--- Observations received -- ");
    console.log(data);

    const character = await getCharacter(data.observerId);

    if (!character) {
        console.log("Character not found");
        return;
    }

    await createMemory(character, data.observation);
}

export { observe };
