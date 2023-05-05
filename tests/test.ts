import { Character } from "@prisma/client";
import { createMemory } from "../src/ai/memory.js";
import { generatePlan } from "../src/ai/planning.js";
import { prisma } from "../src/db.js";
import { getLatestTask } from "../src/ai/task.js";
import { agentLoop } from "../src/ai/agent.js";

async function createCharacter() {
    await prisma.character.deleteMany({});

    const character = await prisma.character.create({
        data: {
            name: "John Lin",
            age: 42,
        },
    });

    return character;
}

async function testMemory(character: Character) {
    await prisma.memory.deleteMany({});

    await createMemory(
        character,
        "John Lin is a pharmacy shopkeeper at the Willow Market and Pharmacy who loves to help people. He is always looking for ways to make the process of getting medication easier for his customers."
    );

    await createMemory(
        character,
        "John Lin is living with his wife, Mei Lin, who is a college professor, and son, Eddy Lin, who is a student studying music theory"
    );

    await createMemory(character, "John Lin loves his family very much");

    await createMemory(
        character,
        "John Lin has known the old couple next-door, Sam Moore and Jennifer Moore, for a few years"
    );

    await createMemory(
        character,
        "John Lin thinks Sam Moore is a kind and nice man;"
    );

    await createMemory(
        character,
        "John Lin knows his neighbor, Yuriko Yamamoto, well"
    );

    await createMemory(
        character,
        "John Lin knows of his neighbors, Tamara Taylor and Carmen Ortiz, but has not met them before"
    );

    await createMemory(
        character,
        "John Lin and Tom Moreno are colleagues at The Willows Market and Pharmacy; John Lin and Tom Moreno are friends and like to discuss local politics together"
    );

    await createMemory(
        character,
        "John Lin knows the Moreno family somewhat well — the husband Tom Moreno and the wife Jane Moreno"
    );
}

async function testPlanning() {
    console.log("Creating character & memory");

    const ch = await createCharacter();

    await testMemory(ch);
    await generatePlan(ch);
    await agentLoop(ch.id);
}

testPlanning();
