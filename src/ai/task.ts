import { Character } from "@prisma/client";
import { prisma } from "../db.js";

async function getUnfinishedTasks(character: Character) {
    const tasks = await prisma.task.findMany({
        where: {
            characterId: character.id,
        },
        orderBy: {
            priority: "asc",
        },
    });

    return tasks;
}

export { getUnfinishedTasks };
