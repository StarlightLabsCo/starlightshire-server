import colors from "colors";
import { Character, Memory } from "@prisma/client";
import pgvector from "pgvector/utils";

import { prisma } from "../db.js";
import { createChatCompletion, getEmbedding } from "./openai.js";
import { generateReflection } from "./reflection.js";

import config from "../config.json" assert { type: "json" };
import { log, replayTimestamp } from "../logger.js";

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
        "gpt-3.5-turbo",
        "getMemoryImportance",
        character.id
    );

    // Convert from string to number
    return Number(response.content.trim());
};

const createMemory = async (
    character: Character,
    memory: string,
    time: number
) => {
    log(
        colors.red("[createMemory]") + " " + memory + " [" + time + "]",
        "info",
        character.unityId
    );

    const latestCharacter = await prisma.character.findUnique({
        where: {
            id: character.id,
        },
    });

    const [importance, embedding] = await Promise.all([
        getMemoryImportance(latestCharacter, memory),
        getEmbedding(memory, "createMemory", character.id),
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
                    importance: importance,
                    time,
                },
            },
        },
        include: {
            memories: true,
        },
    });

    // Get the id of the newly created memory
    const newMemoryId =
        updatedCharacter.memories[updatedCharacter.memories.length - 1].id;

    // Update the memory with the embedding
    await prisma.$executeRaw`UPDATE "Memory" SET "embedding" = ${embedding}::vector WHERE "id" = ${newMemoryId}`;

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
        character.unityId
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

    log(memories, "info", character.unityId);

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
    const queryEmbedding = await getEmbedding(
        query,
        "getRelevantMemoriesQuery",
        character.id
    );

    const queryEmbeddingSql = pgvector.toSql(queryEmbedding);

    const memories = (await prisma.$queryRaw`
        WITH raw_memories AS (
            SELECT 
                id,
                1 - (embedding <=> ${queryEmbeddingSql}::vector) AS raw_similarity,
                importance AS raw_importance,
                POWER(0.99, (EXTRACT(EPOCH FROM NOW() - "accessedAt") / 3600)) AS raw_recency
            FROM "Memory"
            WHERE "characterId" = ${character.id}
        ),
        min_max_values AS (
            SELECT 
                MIN(raw_similarity) AS similarityMin, MAX(raw_similarity) AS similarityMax,
                MIN(raw_importance) AS importanceMin, MAX(raw_importance) AS importanceMax,
                MIN(raw_recency) AS recencyMin, MAX(raw_recency) AS recencyMax
            FROM raw_memories
        ),
        normalized_memories AS (
            SELECT 
                id,
                (raw_similarity - similarityMin) / (similarityMax - similarityMin) AS similarity,
                (raw_importance - importanceMin) / (importanceMax - importanceMin) AS importance,
                (raw_recency - recencyMin) / (recencyMax - recencyMin) AS recency
            FROM raw_memories, min_max_values
        )
        SELECT 
            id,
            similarity,
            importance,
            recency,
            similarity + importance + recency AS normalized_score
        FROM normalized_memories
        ORDER BY normalized_score DESC
        LIMIT ${top_k}
    `) as {
        id: string;
        similarity: number;
        importance: number;
        recency: number;
        normalized_score: number;
    }[];

    // Fetch the memories from the database
    const memoriesFromDatabase = await prisma.memory.findMany({
        where: {
            id: {
                in: memories.map((memory) => memory.id),
            },
        },
    });

    // If we don't want to update the accessedAt, return the memories
    if (!updateAccessedAt) {
        return memoriesFromDatabase;
    }

    // Otherwise, update the returned memories' accessedAt values
    await Promise.all(
        memoriesFromDatabase.map((memory) =>
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

    return memoriesFromDatabase;
};

export {
    getMemoryImportance,
    createMemory,
    getLatestMemories,
    calculateMaxMemoriesForTask,
    getRelevantMemories,
};
