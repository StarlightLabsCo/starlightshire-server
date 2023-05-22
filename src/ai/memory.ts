import { prisma } from "../db.js";
import { Character } from "@prisma/client";

import { createChatCompletion, getEmbedding } from "./openai.js";
import { getGameDate } from "../game.js";
import { generateReflection } from "./reflection.js";

import config from "../config.json" assert { type: "json" };

if (!config.model) throw new Error("No model provided in config.json");

// Importance (Using LLM to determine importance from 1-10)
const getMemoryImportance = async (character: Character, memory: string) => {
    // TODO: draw relevant memories from the character's memory bank to help the model determine importance

    const memoryImportancePromptBase = `On the scale of 1 to 10, where 1 is purely mundane (e.g., waking up, making bed) and 10 is extremely poignant (e.g., a break up, a family death), rate the likely poignancy of the following piece of memory. Only return the number`;
    const memoryImportancePrompt = `${memoryImportancePromptBase}\nMemory: `;

    const importance = await createChatCompletion([
        { role: "user", content: memoryImportancePrompt + memory },
        {
            role: "assistant",
            content: "Rating: ",
        },
    ]);

    // Convert from string to number
    return Number(importance);
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
const createMemory = async (character: Character, memory: string) => {
    // Get the current gameDate, importance of the memory, and the embedding of the memory in parallel
    const [gameDate, importance, embedding] = await Promise.all([
        getGameDate(),
        getMemoryImportance(character, memory),
        getEmbedding(memory),
    ]);

    // Create the memory, and update the character's reflection threshold
    const updatedCharacter = await prisma.character.update({
        where: {
            id: character.id,
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

    if (updatedCharacter.reflectionThreshold >= config.reflectionThreshold) {
        // Reset the threshold
        await prisma.character.update({
            where: {
                id: character.id,
            },
            data: {
                reflectionThreshold: 0,
            },
        });

        // Generate reflection
        generateReflection(character);
    }
};

// Retrieval

// Returns the latest memories (used by the reflection system to figure out what to reflect on)
const getLatestMemories = async (character: Character, top_k: number) => {
    const memories = await prisma.memory.findMany({
        where: {
            id: character.id,
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
const getAllMemoriesFromDay = async (character: Character, gameDate: Date) => {
    const memories = await prisma.memory.findMany({
        where: {
            id: character.id,
            gameDate: {
                gte: new Date(
                    gameDate.getFullYear(),
                    gameDate.getMonth(),
                    gameDate.getDate()
                ),
                lt: new Date(
                    gameDate.getFullYear(),
                    gameDate.getMonth(),
                    gameDate.getDate() + 1
                ),
            },
        },
    });

    return memories;
};

// Returns relevant memories using the noramlized similarity, importance, and recency, and updates the accessedAt field if updateAccessedAt is true
// This will be mainly used by the NPC, and as such should update the accessedAt field
const getRelevantMemories = async (
    character: Character,
    query: string,
    top_k: number,
    updateAccessedAt: boolean = true
) => {
    // Get the embedding of the query
    const queryEmbedding = await getEmbedding(query);

    const memories = await prisma.memory.findMany({
        where: {
            characterId: character.id,
        },
    });

    // Turn embedding strings into arrays that can be searched via cosign similarity
    const memoriesWithEmbeddings = memories.map((memory) => {
        return {
            ...memory,
            embedding: memory.embedding.split(",").map((e) => Number(e)),
        };
    });

    // Noramlize the memories based on their similarity, importance, and recency
    let similarityMin: number = Number.MAX_VALUE;
    let similarityMax: number = Number.MIN_VALUE;

    let recencyMin: number = Number.MAX_VALUE;
    let recencyMax: number = Number.MIN_VALUE;

    let importanceMin: number = Number.MAX_VALUE;
    let importanceMax: number = Number.MIN_VALUE;

    //  Time used for calculating exponential decay of recency. We save it here so it's the same for all memories
    const currentTime = Date.now();

    // Also add the similarity to the query (so it doesn't have to be calculated again)
    const memoriesWithSimilarity = memoriesWithEmbeddings.map((memory) => {
        // Similarity
        const similarity = cosineSimilarity(
            queryEmbedding,
            memory.embedding as number[]
        );

        // In our implementation, we treat recency as an exponential decay function
        // over the number of sandbox game hours since the memory was
        // last retrieved. Our decay factor is 0.99.
        const recency = Math.pow(
            0.99,
            (currentTime - memory.accessedAt.getTime()) / 1000 / 60 / 60 /// turn into hours
        );

        // Mark the min and max values for each to normalize later
        similarityMin = Math.min(similarityMin, similarity);
        similarityMax = Math.max(similarityMax, similarity);

        importanceMin = Math.min(importanceMin, memory.importance);
        importanceMax = Math.max(importanceMax, memory.importance);

        recencyMin = Math.min(recencyMin, recency);
        recencyMax = Math.max(recencyMax, recency);

        return {
            ...memory,
            similarity,
            recency,
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
                (memory.recency - recencyMin) / (recencyMax - recencyMin);

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

    await Promise.all(
        mostRelevantMemories.map((memory) =>
            prisma.memory.update({
                where: {
                    id: memory.id,
                },
                data: {
                    accessedAt: new Date(),
                },
            })
        )
    );

    return mostRelevantMemories;
};

export {
    getMemoryImportance,
    cosineSimilarity,
    createMemory,
    getLatestMemories,
    getAllMemoriesFromDay,
    getRelevantMemories,
};
