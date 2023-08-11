import { prisma } from "../db.js";
import { Character } from "@prisma/client";
import colors from "colors";

import { createChatCompletion, getEmbedding } from "./openai.js";
import { generateReflection } from "./reflection.js";

import config from "../config.json" assert { type: "json" };
import { log } from "../logger.js";

if (!config.model) throw new Error("No model provided in config.json");

// Importance (Using LLM to determine importance from 1-10)
const getMemoryImportance = async (character: Character, memory: string) => {
    // TODO: draw relevant memories from the character's memory bank to help the model determine importance
    const response = await createChatCompletion(
        [
            {
                role: "system",
                content:
                    "On the scale of 1 to 10, where 1 is purely mundane (e.g., waking up, making bed) and 10 is extremely poignant (e.g., a break up, a family death), rate the likely poignancy of the following piece of memory. Only return the number.",
            },
            { role: "user", content: `Memory: ${memory}` },
            {
                role: "assistant",
                content: "Rating: ",
            },
        ],
        undefined,
        "gpt-3.5-turbo"
    );

    // Convert from string to number
    return Number(response.content.trim());
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

const createMemory = async (
    character: Character,
    memory: string,
    time: number
) => {
    log(
        colors.red("[createMemory]") + " " + memory + " [" + time + "]",
        "info",
        character.id
    );

    const latestCharacter = await prisma.character.findUnique({
        where: {
            id: character.id,
        },
    });

    const [importance, embedding] = await Promise.all([
        getMemoryImportance(latestCharacter, memory),
        getEmbedding(memory),
    ]);

    // Create the memory, and update the character's reflection threshold
    const updatedCharacter = await prisma.character.update({
        where: {
            id: latestCharacter.id,
        },
        data: {
            reflectionThreshold:
                latestCharacter.reflectionThreshold + importance,
            memories: {
                create: {
                    memory,
                    embedding: embedding.toString(),
                    importance: importance,
                    time,
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
        generateReflection(character, time);
    }
};

// Retrieval

// Returns the latest memories (used by the reflection system to figure out what to reflect on)
const getLatestMemories = async (character: Character, top_k: number) => {
    log(
        colors.red(
            `[getLatestMemories] Retrieving top ${top_k} latest memories.`
        ),
        "info",
        character.id
    );

    const memories = await prisma.memory.findMany({
        where: {
            characterId: character.id,
        },
        orderBy: {
            time: "desc",
        },
        take: top_k,
    });

    log(memories, "info", character.id);

    return memories;
};


function clamp(num, min, max) {
    return num <= min ? min : num >= max ? max : num;
}

function calculateMaxMemoriesForTask(priority) {
    // Assuming priority is a number that is greater for less important tasks
    // You can modify this function according to your logic
    const maxPriority = 8; // Replace this with the maximum priority value in your system
    const maxMemories = 10; // Replace this with the maximum number of memories you want to fetch

    return Math.round(
        ((maxPriority + 1 - clamp(priority, 0, maxPriority)) / maxPriority) *
            maxMemories
    );
}

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
    calculateMaxMemoriesForTask,
    getRelevantMemories,
};
