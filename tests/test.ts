import { createMemory, getRelevantMemories } from "../src/ai/memory.js";
import { generatePlan } from "../src/ai/planning.js";
import { prisma } from "../src/db.js";

async function createCharacter() {
    await prisma.character.deleteMany({});

    const character = await prisma.character.create({
        data: {
            name: "Harris Rothaermel",
            age: 24,
        },
    });

    return character;
}

async function testMemory(characterId: string) {
    await createMemory(characterId, "I woke up and went to the bathroom.");

    await createMemory(
        characterId,
        "I went downstairs and started working on my computer."
    );

    await createMemory(
        characterId,
        "I took a short walk around the block to get some fresh air."
    );

    await createMemory(characterId, "I browsed Twitter for a bit.");

    await createMemory(characterId, "I played Crab Champions with a friend.");

    await createMemory(characterId, "I got lunch at Chipotle");

    await createMemory(
        characterId,
        "I went to Stripe Sessions at Pier 48, a conference for developers of Stripe, a payment processing company."
    );

    await createMemory(
        characterId,
        "At Stripe Sessions, I went to an AI panel with some of the top AI researchers in the world."
    );

    await createMemory(
        characterId,
        "I attended the fireside chat with Sam Altman, the CEO of OpenAI."
    );

    await createMemory(characterId, "I ubered home from Stripe Sessions.");

    await createMemory(
        characterId,
        "I got dinner at The Bird, a fried chicken restaurant."
    );

    await createMemory(
        characterId,
        "I went back on my computer and worked on my project."
    );

    await createMemory(characterId, "I browsed Twitter for a bit.");

    await createMemory(characterId, "I went to bed.");

    const memories = await getRelevantMemories(
        characterId,
        "What is Harris working on?",
        5
    );
}

async function testPlanning() {
    const ch = await createCharacter();
    const memories = await testMemory(ch.id);
    const plan = await generatePlan(ch.id);

    console.log("Plan", plan);
}

testPlanning();
