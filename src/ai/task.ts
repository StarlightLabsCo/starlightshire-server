import { Character } from "@prisma/client";
import { prisma } from "../db.js";

let tasks = [
    {
        task: "Catch up with other villagers",
        priority: 1,
    },
    {
        task: "Check on the mine",
        priority: 2,
    },
    {
        task: "Store extra materials in chest",
        priority: 2,
    },
    {
        task: "Chop trees",
        priority: 3,
    },
];

async function getUnfinishedTasks(character: Character) {
    // const tasks = await prisma.task.findMany({
    //     where: {
    //         characterId: character.id,
    //     },
    //     orderBy: {
    //         priority: "asc",
    //     },
    // });

    return tasks;
}

function updateTasks(
    updatedTasks: [
        {
            task: string;
            priority: number;
            createdAt: Date;
        }
    ]
) {
    tasks = updatedTasks;
}

export { getUnfinishedTasks, updateTasks };
