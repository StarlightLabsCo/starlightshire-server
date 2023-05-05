import { Character } from "@prisma/client";
import { prisma } from "../db.js";

async function getLatestTask(character: Character) {
    const tasks = await prisma.task.findMany({
        where: {
            characterId: character.id,
        },
    });

    const oldestTask = tasks.sort((a, b) => {
        return a.gameDateStart.getTime() - b.gameDateStart.getTime();
    })[0];

    return oldestTask;
}

export { getLatestTask };
