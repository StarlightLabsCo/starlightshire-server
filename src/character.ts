import { createMemory } from "./ai/memory.js";
import { generatePlan } from "./ai/planning.js";
import { prisma } from "./db.js";

const getCharacter = async (id: string) => {
    return await prisma.character.findUnique({
        where: {
            id,
        },
    });
};

const createThomas = async () => {
    await prisma.character.deleteMany({});
    await prisma.memory.deleteMany({});

    const thomas = await prisma.character.create({
        data: {
            id: "1",
            name: "Thomas",
            age: 25,
            location: "Campfire",
            tool: "Sword",
        },
    });

    const memories: string[] = [
        "Hope Island is a small island in the middle of the ocean, it has a small beech with a elevated valley with grass, trees, and berries.",
        "Thomas and Susie crash landed on Hope Island almost 3 months ago, and have used the tools they had on the boat (axe, shovel, pickaxe, sword, bucket, etc) to gather materials (chop trees) to construct a small house on the plateau.",
        "Thomas and Susie have been extra productive and created ladders and bridges to connect the island together.",
        "Hope Island is now also connected to a smaller island to the east via a self made bridge.",
        "So far Thomas and Susie have lived off berries, plants, and small animals that are on the island, but are worried this will eventually run out.",
        "With seemingly no help on the way, Thomas and Susie decided to construct a raft boat as large as possible with as many supplies as possible to begin their journey back to civilization.  ",
        "Thomas is a kind, humble, 28 year old air force pilot, who is married to Susie, a 25 year old nurse.  They have been married for 3 years and have no children. They were on a vacation to the Bahamas when their boat crashed into a storm and they were stranded on Hope Island.",
        "Thomas has been working on the raft for 2 months now, and is almost finished. He has been working on it every day, and has been working on it for 8 hours a day.",
        "Susie is an adventureous person at heart, and always enjoyed the outdoors. She decided to become a nurse after a traumatic event in her childhood, and swore it'd never happen to anyone else.  She is very kind and caring, and is always looking out for others, but enjoys teasing and joking around with Thomas.",
        "Susie is now 3 months pregnant.",
        "To continue building the craft, thomas has to go to the other island to gather more wood. He has to go to the other island because he has already chopped most of the trees on the island he is on.",
        "Although Thomas is a good swimmer, he is worried about the sharks in the water. He has seen them before, and they are very large and scary. He is worried that if he falls in the water, he will be eaten by the sharks.",
        "Thomas constructed a dock south of the island to begin assembling the raft, however it's near a cave where skeletons have recently emerged from.",
        "Even though he works till he is exhausted, Thomas still takes time to spend time with Susie and talk about their future together while watching the sunset from the North Outlook.",
    ];

    await Promise.all(memories.map((memory) => createMemory(thomas, memory)));

    await generatePlan(thomas);
};

function characterObservation(
    ws: WebSocket,
    data: {
        characterId: string;
        observations: string[];
    }
) {
    console.log("Observations received");
    console.log(data);
}

export { getCharacter, createThomas, characterObservation };
