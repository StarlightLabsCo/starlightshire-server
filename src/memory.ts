// Environment variables
import dotenv from "dotenv";
dotenv.config();

// OpenAI
import { Configuration, OpenAIApi } from "openai";
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Prisma Client (Database)
import { prisma } from "./db.js";
import { exit } from "process";
// Importance
const memoryImportancePromptBase = `On the scale of 1 to 10, where 1 is purely mundane (e.g., waking up, making bed) and 10 is extremely poignant (e.g., a break up, a family death), rate the likely poignancy of the following piece of memory. Only return the number`;
const memoryImportancePrompt = `${memoryImportancePromptBase}\nMemory: `;

const getMemoryImportance = async (memory: string) => {
    const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
            { role: "user", content: memoryImportancePrompt + memory },
            {
                role: "assistant",
                content: "Rating: ",
            },
        ],
    });

    const importance = completion.data.choices[0].message.content.trim();

    // Convert from string to number
    return Number(importance);
};

// Relevancy (Embeddings)
const getMemoryEmbedding = async (memory: string) => {
    const response = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: memory,
    });

    return response.data.data[0].embedding;
};

// Storage
const createMemory = async (characterId: string, memory: string) => {
    // TODO: these are both API calls, so they should be done in parallel
    const importance = await getMemoryImportance(memory);
    const embedding = await getMemoryEmbedding(memory);

    const result = await prisma.memory.create({
        data: {
            character: {
                connect: {
                    id: characterId,
                },
            },
            memory,
            embedding: embedding.toString(),
            importance: importance,
        },
    });

    // TODO: have a running count of importance, and when it reaches a certain threshold, trigger a reflection
    // generateReflection(characterId);

    return result;
};

// Retrieval
const cosineSimilarity = (a: number[], b: number[]) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const getMemories = async (
    characterId: string,
    query: string,
    top_k: number
) => {
    // TODO: this is probably the most inefficient function I have ever written
    // TODO: please for the love of god, optimize this, I'm begging you

    const memories = await prisma.memory.findMany({
        where: {
            characterId,
        },
    });

    // Get the embedding of the query
    const queryEmbedding = await getMemoryEmbedding(query);

    // Turn embedding strings into arrays that can be searched via cosign similarity
    // TODO: ideally it would already be stored as a float array, so no conversion would be necessary
    const memoriesWithEmbeddings = memories.map((memory) => {
        return {
            ...memory,
            embedding: memory.embedding.split(",").map((e) => Number(e)),
        };
    });

    // Noramlize the memories based on their similarity, importance, and recency
    let similarityMin;
    let similarityMax;

    let recencyMin;
    let recencyMax;

    let importanceMin;
    let importanceMax;

    // Also add the similarity to the query (so it doesn't have to be calculated again)
    const memoriesWithSimilarity = memoriesWithEmbeddings.map((memory) => {
        // Similarity
        const similarity = cosineSimilarity(
            queryEmbedding,
            memory.embedding as number[]
        );

        if (!similarityMin || similarity < similarityMin) {
            similarityMin = similarity;
        }

        if (!similarityMax || similarity > similarityMax) {
            similarityMax = similarity;
        }

        // Importance
        if (!importanceMin || memory.importance < importanceMin) {
            importanceMin = memory.importance;
        }

        if (!importanceMax || memory.importance > importanceMax) {
            importanceMax = memory.importance;
        }

        // Recency (accessedAt)
        if (!recencyMin || memory.accessedAt.getTime() < recencyMin) {
            recencyMin = memory.accessedAt.getTime();
        }

        if (!recencyMax || memory.accessedAt.getTime() > recencyMax) {
            recencyMax = memory.accessedAt.getTime();
        }

        return {
            ...memory,
            similarity,
        };
    });

    // Normalize the memories
    const memoriesWithNormalizedValues = memoriesWithSimilarity.map(
        (memory) => {
            const similarity =
                (memory.similarity - similarityMin) /
                (similarityMax - similarityMin);

            const importance =
                (memory.importance - importanceMin) /
                (importanceMax - importanceMin);

            const recency =
                (memory.accessedAt.getTime() - recencyMin) /
                (recencyMax - recencyMin);

            const normalizedScore = similarity + importance + recency;

            return {
                ...memory,
                normalizedScore,
            };
        }
    );

    // Sort the memories by their normalized score
    const memoriesSortedByNormalizedScore = memoriesWithNormalizedValues.sort(
        (a, b) => {
            return b.normalizedScore - a.normalizedScore;
        }
    );

    // Return top k memories
    const mostRelevantMemories = memoriesSortedByNormalizedScore.slice(
        0,
        top_k
    );

    // For the returned memories, update their accessedAt
    mostRelevantMemories.map((memory) => {
        return prisma.memory.update({
            where: {
                id: memory.id,
            },
            data: {
                accessedAt: new Date(),
            },
        });
    });

    return mostRelevantMemories;
};

// Reflections
// There are two stages to reflections:
// 1.) Generating questions to ask based on the character's memories (these are reflection questions)
// 2.) Generating the reflections based on the questions and retrieved memories
const answerReflectionQuestion = async (
    characterId: string,
    reflectionQuestion: string
) => {
    // Get the character's name
    const character = await prisma.character.findUnique({
        where: {
            id: characterId,
        },
    });

    const characterName = character.name;

    // Retrieve the latest 15 memories based on the reflection question
    const memories = await getMemories(characterId, reflectionQuestion, 15);

    // Create the reflection prompt
    let reflectionPrompt = `Statements about ${characterName}\n`;

    for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        reflectionPrompt += `${i + 1}. ${memory.memory}\n`;
    }

    reflectionPrompt +=
        "What 5 high-level insights can you infer from the above statements? (example format: insight (because of 1, 5, 3))";

    // Generate the reflection
    const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: reflectionPrompt }],
    });

    // Parse the completion (remove numbers e.g. 1. , and trim)
    const reflections = completion.data.choices[0].message.content
        .replace(/[0-9]. /g, "")
        .trim()
        .split("\n");

    // Add the reflections to the database as a memory
    for (let i = 0; i < reflections.length; i++) {
        // TODO: parralelize this
        const importance = await getMemoryImportance(reflections[i]);
        const embedding = await getMemoryEmbedding(reflections[i]);

        await prisma.memory.create({
            data: {
                characterId,
                memory: reflections[i],
                importance: importance,
                embedding: embedding.toString(),
            },
        });
    }

    return completion;
};

const generateReflection = async (characterId: string) => {
    // Retrieve the latest 100 memories
    const memories = await prisma.memory.findMany({
        where: {
            characterId,
        },
        orderBy: {
            createdAt: "desc",
        },
        take: 100,
    });

    // Figure out the most important questions to ask, and reflect on
    let generateReflectionQuestionsPrompt;
    for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        generateReflectionQuestionsPrompt += `${i + 1}. ${memory.memory}\n`;
    }

    generateReflectionQuestionsPrompt += `Given only the information above, what are 3 most salient high-level questions we can answer about the subjects in the statements?\n`;

    // Generate the reflection questions
    const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
            { role: "user", content: generateReflectionQuestionsPrompt },
        ],
    });

    const reflectionQuestions = completion.data.choices[0].message.content;

    // Parse the reflection questions (remove the numbers e.g. (1. ), and split by new line)
    const reflectionQuestionsParsed = reflectionQuestions
        .replace(/[0-9]. /g, "")
        .trim()
        .split("\n");

    // Answer the reflection questions
    // TODO: Parallelize this
    for (let i = 0; i < reflectionQuestionsParsed.length; i++) {
        answerReflectionQuestion(characterId, reflectionQuestionsParsed[i]);
    }
};

// Planning (TODO)
const generatePlan = async (characterId: string) => {};

// Test Code
const testMemory = async () => {
    console.log("Testing memory.");

    await prisma.character.deleteMany();

    const character = await prisma.character.create({
        data: {
            name: "John Lin",
        },
    });

    console.log("Created character.");

    await createMemory(
        character.id,
        "John Lin is a pharmacy shopkeeper at the Willow Market and Pharmacy who loves to help people. He is always looking for ways to make the process of getting medication easier for his customers"
    );
    await createMemory(
        character.id,
        "John Lin is living with his wife, Mei Lin, who is a college professor, and son, Eddy Lin, who is a student studying music theory"
    );
    await createMemory(character.id, "John Lin loves his family very much");
    await createMemory(
        character.id,
        "John Lin has known the old couple next-door, Sam Moore and Jennifer Moore, for a few years"
    );
    await createMemory(
        character.id,
        " John Lin thinks Sam Moore is a kind and nice man"
    );
    await createMemory(
        character.id,
        "John Lin knows his neighbor, Yuriko Yamamoto, well"
    );
    await createMemory(
        character.id,
        "John Lin knows of his neighbors, Tamara Taylor and Carmen Ortiz, but has not met them before"
    );
    await createMemory(
        character.id,
        "John Lin and Tom Moreno are colleagues at The Willows Market and Pharmacy"
    );
    await createMemory(
        character.id,
        "John Lin and Tom Moreno are friends and like to discuss local politics together"
    );
    await createMemory(
        character.id,
        "John Lin knows the Moreno family somewhat well — the husband Tom Moreno and the wife Jane Moreno."
    );

    console.log("Created memories.");

    const memories = await getMemories(
        character.id,
        "John Lin meets Tom Moreno by the park",
        3
    );

    console.log("Retrieved memories.");
    console.log(memories);

    const reflection = await generateReflection(character.id);

    console.log("Generated reflection.");
};
