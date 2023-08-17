import { Character } from "@prisma/client";

let tasks = [
    {
        task: "Carry out your daily dutiies",
        priority: 1,
    },
    {
        task: "Catch up with other villagers",
        priority: 2,
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
