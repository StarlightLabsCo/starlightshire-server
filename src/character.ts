import { createMemory } from "./ai/memory.js";
import { generatePlan } from "./ai/planning.js";
import { prisma } from "./db.js";

const getCharacter = async (id: string) => {
    console.log("Getting character: " + id);

    return await prisma.character.findUnique({
        where: {
            id,
        },
    });
};

const createThomas = async () => {
    console.log("Creating Thomas");

    await prisma.character.deleteMany({});
    await prisma.memory.deleteMany({});

    const thomas = await prisma.character.create({
        data: {
            id: "A1",
            name: "Thomas Smith",
            age: 32,
            occupation: "Village Leader",
            personality: ["Brave", "Calm", "Honest"],
            tasks: {
                create: [
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
                ],
            },
        },
    });

    const memories: string[] = [];

    await Promise.all(memories.map((memory) => createMemory(thomas, memory)));

    console.log("Thomas created");

    // await generatePlan(thomas);

    // console.log("Plan generated");
};

export { getCharacter, createThomas };
