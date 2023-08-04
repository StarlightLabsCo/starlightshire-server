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
        },
    });

    const memories: string[] = [
        // "I should be asleep until 7am.",
        "It's my job to protect the village.",
        "I need to make sure everyone is safe.",
        "I do the work that no one else wants to do.",
        "I try to be as honest as possible.",
        "I'm not afraid of anything.",
        "I go to bed at 10pm.",
        "I like strawberries.",
        "The village location is 2, -58.",
        "The mine site is at 51, 17.",
        "The lumberyard is at 72, -55.1",
        "The campsite is at 7, -8.3",
        "The Nume River flows through the village.",
        "Nume Falls are north of the village, and west of the campsite.",
        "The area is surrounded by forested monutains, filled with wildlife, rivers, and lakes.",
    ];

    await Promise.all(
        memories.map((memory) => createMemory(thomas, memory, 0))
    );

    console.log("Thomas created");

    // await generatePlan(thomas);

    // console.log("Plan generated");
};

export { getCharacter, createThomas };
