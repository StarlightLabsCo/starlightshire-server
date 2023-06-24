import { Character } from "@prisma/client";
import { prisma } from "../db.js";

async function getTask(character: Character) {
    const tasks = await prisma.task.findMany({
        where: {
            characterId: character.id,
        },
    });

    // TODO: this doesn't work, i just put createdAt so it would build. Need to redo this
    const oldestTask = tasks.sort((a, b) => {
        return a.createdAt.getTime() - b.createdAt.getTime();
    })[0];

    // Remove the task from the list of tasks
    // TODO: rather than deleting the task, we should mark it as completed
    await prisma.task.delete({
        where: {
            id: oldestTask.id,
        },
    });

    return oldestTask;
}

export { getTask };
