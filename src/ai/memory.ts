import { prisma } from "../db.js";
import { getCharacter } from "../character.js";
import { openai } from "./openai.js";
import * as config from "../config.json";
import { generateReflection } from "./reflection.js";

// Importance (Using LLM to determine importance from 1-10)
const getMemoryImportance = async (memory: string) => {
    const memoryImportancePromptBase = `On the scale of 1 to 10, where 1 is purely mundane (e.g., waking up, making bed) and 10 is extremely poignant (e.g., a break up, a family death), rate the likely poignancy of the following piece of memory. Only return the number`;
    const memoryImportancePrompt = `${memoryImportancePromptBase}\nMemory: `;

    const completion = await openai.createChatCompletion({
        model: config.model,
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
        model: config.embeddingModel,
        input: memory,
    });

    return response.data.data[0].embedding;
};

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

// Storage
const createMemory = async (characterId: string, memory: string) => {
    // Get the character, current gameDate, importance of the memory, and the embedding of the memory in parallel
    const [character, gameDate, importance, embedding] = await Promise.all([
        getCharacter(characterId),
        getGameDate(),
        getMemoryImportance(memory),
        getMemoryEmbedding(memory),
    ]);

    // Create the memory, and update the character's reflection threshold
    const updatedCharacter = await prisma.character.update({
        where: {
            id: characterId,
        },
        data: {
            reflectionThreshold: character.reflectionThreshold + importance,
            memories: {
                create: {
                    memory,
                    gameDate,
                    embedding: embedding.toString(),
                    importance: importance,
                },
            },
        },
    });

    // TODO: make this threshold a variable
    if (updatedCharacter.reflectionThreshold >= config.reflectionThreshold) {
        console.log("Threshold reached.. Generating reflection");

        // Reset the threshold
        await prisma.character.update({
            where: {
                id: characterId,
            },
            data: {
                reflectionThreshold: 0,
            },
        });

        // Generate reflection
        // This is done async for performance reasons
        generateReflection(characterId);
    }
};

// Retrieval

// Returns the latest memories (used by the reflection system to figure out what to reflect on)
const getLatestMemories = async (characterId: string, top_k: number) => {
    const memories = await prisma.memory.findMany({
        where: {
            characterId,
        },
        orderBy: {
            createdAt: "desc",
        },
        take: top_k,
    });

    return memories;
};

// Returns all the memories from a specific game date
// This is used by the system to summarize a day, for planning and as such shouldn't update the accessedAt field
const getAllMemoriesFromDay = async (characterId: string, gameDate: number) => {
    const memories = await prisma.memory.findMany({
        where: {
            characterId,
            gameDate,
        },
    });

    return memories;
};

// Returns relevant memories using the noramlized similarity, importance, and recency, and updates the accessedAt field if updateAccessedAt is true
// This will be mainly used by the NPC, and as such should update the accessedAt field
const getRelevantMemories = async (
    characterId: string,
    query: string,
    top_k: number,
    updateAccessedAt: boolean = true
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

    // If we don't want to update the accessedAt, return the memories
    if (!updateAccessedAt) {
        return mostRelevantMemories;
    }

    // Otherwise, update the returned memories' accessedAt values
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

export {
    getMemoryImportance,
    getMemoryEmbedding,
    cosineSimilarity,
    createMemory,
    getLatestMemories,
    getAllMemoriesFromDay,
    getRelevantMemories,
};
