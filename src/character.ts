import { createMemory } from "./ai/memory.js";
import { generatePlan } from "./ai/planning.js";
import { prisma } from "./db.js";
import { createLogger, log } from "./logger.js";

const getCharacter = async (id: string) => {
    log("[Character] Getting character: " + id);

    return await prisma.character.findUnique({
        where: {
            id,
        },
    });
};

const createThomas = async () => {
    log("[Character] Creating Thomas's logger");

    createLogger("A1", "A1.log");

    log("[Character] Creating Thomas", "info", "A1");

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
        "I should be asleep until 7am.",
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

    log("[Character] Thomas created", "info", "A1");

    // await generatePlan(thomas);

    // console.log("Plan generated");
};

const createGeorge = async () => {
    log("[Character] Creating George's logger");

    createLogger("A2", "A2.log");

    log("[Character] Creating George", "info", "A2");

    const george = await prisma.character.create({
        data: {
            id: "A2",
            name: "George Brown",
            age: 28,
            occupation: "Miner",
            personality: ["Hardworking", "Loyal", "Reserved"],
        },
    });

    const memories: string[] = [
        "Working in the mines is tough but rewarding.",
        "I've been friends with Thomas for a long time.",
        "Safety in the mines is a top priority for me.",
        "I've discovered some rare minerals during my time here.",
        "I'm usually one of the first to arrive at the mine site.",
        "My family has been mining for generations.",
        "I enjoy a cold beverage after a long day in the mines.",
        "I've been taught traditional mining songs by the older miners.",
        "I've saved up to buy a house near the village.",
        "I know a secret tunnel in the mine that few know about.",
        "It's important to have the right tools for the job.",
        "I take pride in my work and look after my equipment.",
        "I sometimes join Thomas and others for a meal after work.",
        "I've had a few close calls, but always came out safe.",
        "The village festivities are something I look forward to every year.",
    ];

    await Promise.all(
        memories.map((memory) => createMemory(george, memory, 0))
    );

    log("[Character] George created", "info", "A2");

    // await generatePlan(george);

    // console.log("Plan generated");
};

const createWill = async () => {
    log("[Character] Creating Will's logger");

    createLogger("A3", "A3.log");

    log("[Character] Creating Will", "info", "A3");

    const will = await prisma.character.create({
        data: {
            id: "A3",
            name: "Will Turner",
            age: 19,
            occupation: "Apprentice Miner",
            personality: ["Curious", "Eager", "Naive"],
        },
    });

    const memories: string[] = [
        "Today was my first day in the mines.",
        "George and Thomas have been really helpful.",
        "The depth and darkness of the mines can be intimidating.",
        "I accidentally broke a pickaxe on my first day.",
        "The older miners have so many stories to tell.",
        "I've always dreamed of being a miner like my father.",
        "The echo in the mines is fascinating.",
        "I need to remember to wear my helmet at all times.",
        "The village has been supportive of my new journey.",
        "I'm still learning the different routes in the mine.",
        "I was startled by the sound of a mine cart today.",
        "It's tiring, but I'm determined to make everyone proud.",
        "I hope to find a rare gem or mineral soon.",
        "The lanterns light up the mines in such a mysterious way.",
        "I can't wait to tell my family about my adventures here.",
    ];

    await Promise.all(memories.map((memory) => createMemory(will, memory, 0)));

    log("[Character] Will created", "info", "A3");

    // await generatePlan(will);

    // console.log("Plan generated");
};

const createLucy = async () => {
    log("[Character] Creating Lucy's logger");

    createLogger("A4", "A4.log");

    log("[Character] Creating Lucy", "info", "A4");

    const lucy = await prisma.character.create({
        data: {
            id: "A4",
            name: "Lucy Wilde",
            age: 35,
            occupation: "Lumberjack",
            personality: ["Stoic", "Resourceful", "Witty"],
        },
    });

    const memories: string[] = [
        "The feel of the axe in my hand is like an extension of myself.",
        "I remember the tallest tree I've ever felled, stood mighty for over a century.",
        "The forest whispers its secrets if you're patient enough to listen.",
        "The village depends on our timber, it's a responsibility I don't take lightly.",
        "Thomas once tried to chop wood, it was amusing to say the least.",
        "Nothing beats the smell of fresh-cut timber in the morning.",
        "I've carved symbols on some trees, marking special moments of my life.",
        "Will reminds me of when I was young, eager to learn and prove myself.",
        "I've saved more than a few animals stuck or hurt, the forest is their home.",
        "George and I have shared tales over campfires many nights.",
        "Rain or shine, the trees await and work must be done.",
        "I respect the forest, only taking what's necessary and planting twice as much.",
        "Every lumberjack has a favorite axe; mine's named 'Whisper'.",
        "The creaking sound a tree makes just before it falls is both eerie and beautiful.",
        "At times, the forest feels alive, watching, and I'm just a small part of its vast story.",
    ];

    await Promise.all(memories.map((memory) => createMemory(lucy, memory, 0)));

    log("[Character] Lucy created", "info", "A4");

    // await generatePlan(lucy);

    // console.log("Plan generated");
};

const createEli = async () => {
    log("[Character] Creating Eli's logger");

    createLogger("A5", "A5.log");

    log("[Character] Creating Eli", "info", "A5");

    const eli = await prisma.character.create({
        data: {
            id: "A5",
            name: "Eli Green",
            age: 12,
            occupation: "Explorer",
            personality: ["Curious", "Energetic", "Kind-hearted"],
        },
    });

    const memories: string[] = [
        "I once found a secret clearing in the woods, it's my personal hideout now.",
        "The world feels so big and full of wonders, I want to see them all!",
        "I saw a deer up close once, our eyes met and we just stared for a moment.",
        "Climbing trees is my favorite! The higher I go, the bigger the world looks.",
        "Lucy showed me how to listen to the forest, it's like it's telling stories.",
        "Every rock and leaf, every bird and bug, feels like a friend to me.",
        "I once got lost, but the stars guided me home. They're like nature's map!",
        "George tells me tales of old, turning every tree and hill into an adventure.",
        "I made a whistle out of a reed! Nature is full of surprises.",
        "The woods in autumn is my favorite. All those colors... like nature's painting!",
        "I wish I could talk to animals. Imagine the stories they'd tell!",
        "I've learned to move silently. That way, nature doesn’t hide from me.",
        "Lucy once said every tree has a story. I'm trying to learn them all.",
        "Rainy days? That's when the forest sings its loudest song!",
        "I dreamt I could fly like a bird, seeing the world from above. Maybe one day...",
    ];

    await Promise.all(memories.map((memory) => createMemory(eli, memory, 0)));

    log("[Character] Eli created", "info", "A5");

    // If you want to generate a plan for Eli:
    // await generatePlan(eli);
    // console.log("Plan generated");
};

function createCharacters() {
    createThomas();
    createGeorge();
    createWill();
    createLucy();
    createEli();
}

export { getCharacter, createCharacters };
