import { Character } from "@prisma/client";
import { prisma } from "../db.js";

let tasks = [
    {
        task: "Chop wood",
        priority: 1,
    },
    {
        task: "Store wood in chest",
        priority: 2,
    },
    {
        task: "Cook dinner",
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
