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
            age: 25,
            occupation: "Lumberjack",
            personality: ["Brave", "Calm", "Honest"],
        },
    });

    const memories: string[] = [];

    await Promise.all(memories.map((memory) => createMemory(thomas, memory)));

    console.log("Thomas created");

    // await generatePlan(thomas);

    // console.log("Plan generated");
};

export { getCharacter, createThomas };
