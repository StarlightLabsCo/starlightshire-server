import { getCharacter } from "../character.js";
import { log } from "../logger.js";
import { createMemory } from "./memory.js";

async function observe(
    ws: WebSocket,
    data: {
        observerId: string;
        observation: string;
        time: number;
    }
) {
    log("--- Observations received -- ");
    log(data);

    const character = await getCharacter(data.observerId);

    if (!character) {
        log("Character not found");
        return;
    }

    await createMemory(character, data.observation, data.time);
}

export { observe };
