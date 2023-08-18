import { Character } from "@prisma/client";

let tasks = {
    A1: [
        {
            task: "Carry out your daily dutiies",
            priority: 1,
        },
        {
            task: "Catch up with other villagers",
            priority: 2,
        },
        {
            task: "Maintain a healthy lifestyle",
            priority: 3,
        },
    ],
    A2: [
        {
            task: "Carry out your daily dutiies",
            priority: 1,
        },
        {
            task: "Catch up with other villagers",
            priority: 2,
        },
        {
            task: "Maintain a healthy lifestyle",
            priority: 3,
        },
    ],
    A3: [
        {
            task: "Carry out your daily dutiies",
            priority: 1,
        },
        {
            task: "Catch up with other villagers",
            priority: 2,
        },
        {
            task: "Maintain a healthy lifestyle",
            priority: 3,
        },
    ],
    A4: [
        {
            task: "Carry out your daily dutiies",
            priority: 1,
        },
        {
            task: "Catch up with other villagers",
            priority: 2,
        },
        {
            task: "Maintain a healthy lifestyle",
            priority: 3,
        },
    ],
    A5: [
        {
            task: "Carry out your daily dutiies",
            priority: 1,
        },
        {
            task: "Catch up with other villagers",
            priority: 2,
        },
        {
            task: "Maintain a healthy lifestyle",
            priority: 3,
        },
    ],
};

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
    characterId: string,
    updatedTasks: [
        {
            task: string;
            priority: number;
            createdAt: Date;
        }
    ]
) {
    tasks[characterId] = updatedTasks;
}

export { getUnfinishedTasks, updateTasks };
