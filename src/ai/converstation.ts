import { Action, CortexStep, OpenAILanguageProgramProcessor } from "socialagi";
import { prisma } from "../db.js";
import { createMemory, getRelevantMemories } from "./memory.js";
import { log } from "../logger.js";
import colors from "colors";

const gpt4 = new OpenAILanguageProgramProcessor(
    {},
    {
        model: "gpt-4",
    }
);

async function fetchCharacters(character1Id: string, character2Id: string) {
    // Fetch each character
    let character1 = await prisma.character.findUnique({
        where: {
            id: character1Id,
        },
    });

    let character2 = await prisma.character.findUnique({
        where: {
            id: character2Id,
        },
    });

    return [character1, character2];
}

// TODO:
// - Make it so target character doesn't know the goal of the conversation, needs to learn it, and develop their own goal
// - Upgrade patience to be more complex -- delta patience = delta information > 0
// - patience on character 2's side
// - ability for both parties to "remember" more contextual information from my vectordb
// - ability for character 1 and character 2 to be async so it can break out of the 1:1 message pattern
// - other stats that correlate with the characters, hunger, tired, etc (i wonder if it's possible to have a meta layer where an LLM defines this  behavior)
// - ability for parties to join/leave conversations and handle it properly

// -----------------

async function startConversation(
    ws: WebSocket,
    data: {
        characterId: string;
        targetCharacterId: string;
        conversationGoal: string;
        time: number;
    }
) {
    log(colors.yellow("[CONVERSATION] Starting conversation..."));
    log(colors.yellow("[CONVERSATION] Character 1: " + data.characterId));
    log(colors.yellow("[CONVERSATION] Character 2: " + data.targetCharacterId));
    log(
        colors.yellow(
            "[CONVERSATION] Conversation goal: " + data.conversationGoal
        )
    );

    // Fetch each character
    const [character, targetCharacter] = await fetchCharacters(
        data.characterId,
        data.targetCharacterId
    );

    // Create cortexstep for each character
    let characterCortexStep = new CortexStep(character.name, {
        processor: gpt4,
    });
    let targetCharacterCortexStep = new CortexStep(targetCharacter.name, {
        processor: gpt4,
    });

    // System prompt (?) - don't worry about it too much
    const initialCharacterMemories = [
        {
            role: "system",
            content: `You are ${character.name}. You are ${
                character.age
            } years old. You are a ${
                character.occupation
            }. You are ${character.personality.join(", ")}.`,
        },
    ];

    const initialTargetCharacterMemories = [
        {
            role: "system",
            content: `You are ${targetCharacter.name}. You are ${
                targetCharacter.age
            } years old. You are a ${
                targetCharacter.occupation
            }. You are ${targetCharacter.personality.join(", ")}.`,
        },
    ];

    characterCortexStep = characterCortexStep.withMemory(
        initialCharacterMemories as any
    );

    targetCharacterCortexStep = targetCharacterCortexStep.withMemory(
        initialTargetCharacterMemories as any
    );

    // Fetch relevant memories for each character & the environment (conversation partner, etc)
    const characterReleventMemories = await getRelevantMemories(
        character,
        `I started a convesation with ${targetCharacter.name} to ${data.conversationGoal}`,
        10
    );

    const targetCharacterRelevantMemories = await getRelevantMemories(
        targetCharacter,
        `${character.name} started a convesation with me.`,
        10
    );

    const characterReleventMemoriesBlock = [
        {
            role: "assistant",
            content:
                `These are the memories I have related to the talking with ${targetCharacter.name}:\n` +
                characterReleventMemories
                    .map((memory) => "- " + memory.memory)
                    .join("\n"),
        },
    ];

    const targetCharacterRelevantMemoriesBlock = [
        {
            role: "assistant",
            content:
                `These are the memories I have related to the talking with ${character.name}:\n` +
                targetCharacterRelevantMemories
                    .map((memory) => "- " + memory.memory)
                    .join("\n"),
        },
    ];

    characterCortexStep = characterCortexStep.withMemory(
        characterReleventMemoriesBlock as any
    );
    targetCharacterCortexStep = targetCharacterCortexStep.withMemory(
        targetCharacterRelevantMemoriesBlock as any
    );

    // Add initation memory to each character's cortexstep
    characterCortexStep = characterCortexStep.withMemory([
        {
            role: "assistant",
            content: `I started a conversation with ${targetCharacter.name} to ${data.conversationGoal}`,
        },
    ] as any);

    targetCharacterCortexStep = targetCharacterCortexStep.withMemory([
        {
            role: "assistant",
            content: `${character.name} started a conversation with me, although I don't know why yet.`,
        },
    ] as any);

    // Loop
    let character1Patience = 100;

    const character1Feel = {
        action: "feel",
        prefix: "I feel",
        description: `A one sentence description of how ${character.name} feels about the last message.`,
    };

    const character2Feel = {
        action: "feel",
        prefix: "I feel",
        description: `A one sentence description of how ${targetCharacter.name} feels about the last message.`,
    };

    const character1Plan = {
        action: "planning",
        description: `A brief outline of what the ${character.name} is planning to do next.`,
    };

    const character2Plan = {
        action: "planning",
        description: `A brief outline of what the ${targetCharacter.name} is planning to do next.`,
    };

    const say = {
        action: "say",
        description: "Says out loud next.",
    };

    const character1Explain = {
        action: "explain",
        description: `A detailed explanation of the ${character.name}'s thoughts in regards to if they made progress towards their goal.`,
    };

    const didMakeProgress = {
        description: "Did I make progress towards my goal?",
        choices: ["yes", "no"],
    };

    const didAccomplishGoal = {
        description: "Did I accomplish my goal?",
        choices: ["yes", "no"],
    };

    let conversationFinished = false;
    while (!conversationFinished) {
        // ---------- character 1 ----------

        // plan - internal
        characterCortexStep = await characterCortexStep.next(
            Action.INTERNAL_MONOLOGUE,
            character1Plan
        );

        log(
            colors.magenta(`[CORTEX] Character 1 - Plan: `) +
                ` ${characterCortexStep.value}`,
            "info",
            character.id
        );

        // say - external
        characterCortexStep = await characterCortexStep.next(
            Action.EXTERNAL_DIALOG,
            say
        );

        log(
            colors.magenta(`[CORTEX] Character 1 - Say: `) +
                `${characterCortexStep.value}\n`,
            "info",
            character.id
        );

        ws.send(
            JSON.stringify({
                type: "conversation",
                data: {
                    characterId: data.characterId,
                    content: characterCortexStep.value,
                },
            })
        );

        // ---------- character 2 ----------
        targetCharacterCortexStep = targetCharacterCortexStep.withMemory({
            role: "user",
            content: characterCortexStep.value,
        } as any);

        // feel - internal
        targetCharacterCortexStep = await targetCharacterCortexStep.next(
            Action.INTERNAL_MONOLOGUE,
            character2Feel
        );

        log(
            colors.cyan(`[CORTEX] Character 2 - Feel: `) +
                `${targetCharacterCortexStep.value}`,
            "info",
            targetCharacter.id
        );

        // plan - internal
        targetCharacterCortexStep = await targetCharacterCortexStep.next(
            Action.INTERNAL_MONOLOGUE,
            character2Plan
        );

        log(
            colors.cyan(`[CORTEX] Character 2 - Plan: `) +
                `${targetCharacterCortexStep.value}`,
            "info",
            targetCharacter.id
        );

        // say - external
        targetCharacterCortexStep = await targetCharacterCortexStep.next(
            Action.EXTERNAL_DIALOG,
            say
        );

        log(
            colors.cyan(`[CORTEX] Character 2 - Say: `) +
                `${targetCharacterCortexStep.value}\n`,
            "info",
            targetCharacter.id
        );

        ws.send(
            JSON.stringify({
                type: "conversation",
                data: {
                    characterId: data.targetCharacterId,
                    content: targetCharacterCortexStep.value,
                },
            })
        );

        // ---------- character 1 ----------
        characterCortexStep = characterCortexStep.withMemory({
            role: "user",
            content: targetCharacterCortexStep.value,
        } as any);

        // feel - internal
        characterCortexStep = await characterCortexStep.next(
            Action.INTERNAL_MONOLOGUE,
            character1Feel
        );

        log(
            colors.magenta(`[CORTEX] Character 1 - Feel: `) +
                `${characterCortexStep.value}`,
            "info",
            character.id
        );

        // explain -  did i make progress towards or accomplish my goal?
        characterCortexStep = await characterCortexStep.next(
            Action.INTERNAL_MONOLOGUE,
            character1Explain
        );

        log(
            colors.magenta(`[CORTEX] Character 1 - Explain: `) +
                `${characterCortexStep.value}`,
            "info",
            character.id
        );

        // binary - did i make progress towards my goal?
        characterCortexStep = await characterCortexStep.next(
            Action.DECISION,
            didMakeProgress
        );

        log(
            colors.magenta(`[CORTEX] Character 1 - Did I make progress? `) +
                `[${characterCortexStep.value}]`,
            "info",
            character.id
        );

        if (characterCortexStep.value.includes("yes")) {
            // binary - did i accomplish my goal?
            characterCortexStep = await characterCortexStep.next(
                Action.DECISION,
                didAccomplishGoal
            );

            log(
                colors.magenta(
                    `[CORTEX] Character 1 - Did I accomplish my goal? `
                ) + `[${characterCortexStep.value}]`,
                "info",
                character.id
            );

            if (characterCortexStep.value.includes("yes")) {
                characterCortexStep = characterCortexStep.withMemory({
                    role: "assistant",
                    content: `I accomplished my goal of ${data.conversationGoal}!`,
                } as any);

                conversationFinished = true;
            } else {
                characterCortexStep = characterCortexStep.withMemory({
                    role: "assistant",
                    content: `I still haven't accomplished my goal of ${data.conversationGoal}.`,
                } as any);
            }
        } else {
            character1Patience -= 10;

            log(
                colors.magenta(`Patience:`) + `${character1Patience}`,
                "info",
                character.id
            );

            if (character1Patience > 0) {
                characterCortexStep = characterCortexStep.withMemory({
                    role: "assistant",
                    content: `The conversation with ${targetCharacter.name} is not making progress towards my goal.`,
                } as any);
            } else {
                characterCortexStep = characterCortexStep.withMemory({
                    role: "assistant",
                    content: `I'm out of patience with ${targetCharacter.name}.`,
                } as any);

                conversationFinished = true;
            }
        }
    }

    // Conversation over, say goodbye
    characterCortexStep = await characterCortexStep.next(
        Action.EXTERNAL_DIALOG,
        {
            action: "say",
            description: `Goodbye ${targetCharacter.name}!`,
        }
    );

    log(
        colors.magenta(`[CORTEX] Character 1 Goodbye: `) +
            `${characterCortexStep.value}`,
        "info",
        character.id
    );

    ws.send(
        JSON.stringify({
            type: "conversation",
            data: {
                characterId: data.characterId,
                content: characterCortexStep.value,
            },
        })
    );

    log(colors.yellow("[CONVERSATION] Conversation finished."));

    // Generate memories
    // Common regex pattern for both characters
    let characterRegex = /^\s*\d+\.\s+"(.+?)"\s*$/m;

    // Function to process memories
    const processMemories = async (cortexStep, character, time) => {
        let characterMemory = await cortexStep.queryMemory(
            `Pick up to 4 most salient memories from the conversation that ${character.name} would have. List them in first person voice and maximum one sentence each.`
        );

        let characterMemoryCount = 0;
        let match;
        while ((match = characterRegex.exec(characterMemory)) !== null) {
            createMemory(character, match[1], time);
            characterMemoryCount++;
            characterMemory = characterMemory.slice(
                match.index + match[0].length
            );
        }

        log(
            colors.yellow(
                `[CONVERSATION] Created ${characterMemoryCount} memories for ${character.name}.`
            )
        );
    };

    // Process memories for both characters
    processMemories(characterCortexStep, character, data.time);
    processMemories(targetCharacterCortexStep, targetCharacter, data.time);

    // --- end ---
    ws.send(
        JSON.stringify({
            type: "end_conversation",
            data: {
                characterId: data.characterId,
                targetCharacterId: data.targetCharacterId,
            },
        })
    );
}

export { startConversation };
