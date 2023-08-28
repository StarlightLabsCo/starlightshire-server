import {
    Action,
    ChatMessageRoleEnum,
    CortexStep,
    CortexValue,
    OpenAILanguageProgramProcessor,
} from "socialagi";
import { prisma } from "../db.js";
import { createMemory, getRelevantMemories } from "./memory.js";
import { log } from "../logger.js";
import colors from "colors";
import {
    deoccupyAgents,
    occupyAgents,
    updateTaskListAfterConversation,
} from "./agent.js";
import { Character } from "@prisma/client";

// TODO:
// - Add system prompt to characters in the db, oh, mainly in the characters.ts creation script
// - Make it so characters can update their goal during conversation
// - Upgrade patience to be more complex -- delta patience = delta information > 0
// - ability for both parties to "remember" more contextual information from my vectordb
// - other stats that correlate with the characters, hunger, tired, etc (i wonder if it's possible to have a meta layer where an LLM defines this  behavior)
// - ability for parties to join/leave conversations and handle it properly
// - ability for character 1 and character 2 to be async so it can break out of the 1:1 message pattern
// -----------------

const gpt4 = new OpenAILanguageProgramProcessor(
    {},
    {
        model: "gpt-4",
    }
);

async function setupCortexStep(
    character: Character,
    context: string,
    interlocutor: string
) {
    // Init
    let characterCortexStep = new CortexStep(character.name, {
        processor: gpt4,
    });

    // System Prompt
    characterCortexStep = characterCortexStep.withMemory([
        {
            role: ChatMessageRoleEnum.System,
            content: character.systemPrompt,
        },
    ]);

    // Relevant Memories
    const characterReleventMemories = await getRelevantMemories(
        character,
        context,
        10
    );

    characterCortexStep = characterCortexStep.withMemory([
        {
            role: ChatMessageRoleEnum.Assistant,
            content:
                `I am ${character.name}.\n` +
                `These are the memories I have related to the talking with ${interlocutor}:\n` +
                characterReleventMemories
                    .map((memory) => "- " + memory.memory)
                    .join("\n") +
                "\n" +
                context,
        },
    ]);

    return characterCortexStep;
}

async function fetchCharacters(characterIds: string[]) {
    let characters = [];

    for (const characterId of characterIds) {
        characters.push(
            await prisma.character.findUnique({
                where: {
                    id: characterId,
                },
            })
        );
    }

    return characters;
}

async function processPriorMessage(
    character: Character,
    characterCortexStep: CortexStep,
    characterState: {
        patience: number;
        conversationGoal: string;
        conversationFinished: boolean;
        currentResponseNumber: number;
    },
    interlocutor: Character,
    interlocutorPriorMessage: string
) {
    log(
        colors.magenta(`[CORTEX] ${character.name} - Prior Message: `) +
            `${interlocutorPriorMessage}`,
        "info",
        character.id
    );
    log(
        colors.magenta(`[CORTEX] ${character.name} - Patience: `) +
            `${characterState.patience}`,
        "info",
        character.id
    );
    log(
        colors.magenta(`[CORTEX] ${character.name} - Conversation Goal: `) +
            `${characterState.conversationGoal}`,
        "info",
        character.id
    );
    log(
        colors.magenta(`[CORTEX] ${character.name} - Conversation Finished: `) +
            `${characterState.conversationFinished}`,
        "info",
        character.id
    );

    characterCortexStep = characterCortexStep.withMemory([
        {
            role: ChatMessageRoleEnum.User,
            content: interlocutorPriorMessage,
        },
    ]);

    // feel - internal
    characterCortexStep = await characterCortexStep.next(
        Action.INTERNAL_MONOLOGUE,
        {
            action: "feel",
            prefix: "I feel",
            description: `A one sentence description of how ${character.name} feels about the last message.`,
        }
    );

    log(
        colors.magenta(`[CORTEX] ${character.name} - Feel: `) +
            `${characterCortexStep.value}`,
        "info",
        character.id
    );

    // shortciruit if first two messages
    if (characterState.currentResponseNumber < 1) {
        return characterCortexStep;
    }

    // explain -  did i make progress towards or accomplish my goal?
    characterCortexStep = await characterCortexStep.next(
        Action.INTERNAL_MONOLOGUE,
        {
            action: "explain",
            description: `A detailed explanation of the ${character.name}'s thoughts in regards to if they made progress towards their goal of ${characterState.conversationGoal}.}`,
        }
    );

    log(
        colors.magenta(`[CORTEX] ${character.name} - Explain: `) +
            `${characterCortexStep.value}`,
        "info",
        character.id
    );

    // binary - did i make progress towards my goal?
    characterCortexStep = await characterCortexStep.next(Action.DECISION, {
        description: "Did I make progress towards my goal?",
        choices: ["yes", "no"],
    });

    log(
        colors.magenta(`[CORTEX] ${character.name} - Did I make progress? `) +
            `[${characterCortexStep.value}]`,
        "info",
        character.id
    );

    if (characterCortexStep.value.includes("yes")) {
        // binary - did i accomplish my goal?
        characterCortexStep = await characterCortexStep.next(Action.DECISION, {
            description: "Did I accomplish my goal?",
            choices: ["yes", "no"],
        });

        log(
            colors.magenta(
                `[CORTEX] ${character.name} - Did I accomplish my goal? `
            ) + `[${characterCortexStep.value}]`,
            "info",
            character.id
        );

        if (characterCortexStep.value.includes("yes")) {
            characterCortexStep = characterCortexStep.withMemory([
                {
                    role: ChatMessageRoleEnum.Assistant,
                    content: `I accomplished my goal of ${characterState.conversationGoal}!`,
                },
            ]);

            characterState.conversationFinished = true;
        } else {
            characterCortexStep = characterCortexStep.withMemory([
                {
                    role: ChatMessageRoleEnum.Assistant,
                    content: `I still haven't accomplished my goal of ${characterState.conversationGoal}.`,
                },
            ]);
        }
    } else {
        characterState.patience -= 10;

        log(
            colors.magenta(`Patience:`) + `${characterState.patience}`,
            "info",
            character.id
        );

        if (characterState.patience > 0) {
            characterCortexStep = characterCortexStep.withMemory([
                {
                    role: ChatMessageRoleEnum.Assistant,
                    content: `The conversation with ${interlocutor.name} is not making progress towards my goal.`,
                },
            ]);
        } else {
            characterCortexStep = characterCortexStep.withMemory([
                {
                    role: ChatMessageRoleEnum.Assistant,
                    content: `I'm out of patience with ${interlocutor.name}.`,
                },
            ]);

            characterState.conversationFinished = true;
        }
    }

    return characterCortexStep;
}

async function processCharacterThoughts(
    character: Character,
    characterCortexStep: CortexStep,
    characterState: {
        patience: number;
        conversationGoal: string;
        conversationFinished: boolean;
        currentResponseNumber: number;
    },
    interlocutor: Character,
    interlocutorPriorMessage: string | null
) {
    // if there is a prior message from the interlocutor, process it
    if (interlocutorPriorMessage) {
        characterCortexStep = await processPriorMessage(
            character,
            characterCortexStep,
            characterState,
            interlocutor,
            interlocutorPriorMessage
        );
    }

    if (!characterState.conversationFinished) {
        // plan - internal
        characterCortexStep = await characterCortexStep.next(
            Action.INTERNAL_MONOLOGUE,
            {
                action: "planning",
                description: `A brief outline of what the ${character.name} is planning to do next.`,
            }
        );

        log(
            colors.magenta(`[CORTEX] ${character.name} - Plan: `) +
                ` ${characterCortexStep.value}`,
            "info",
            character.id
        );

        // say - external
        characterCortexStep = await characterCortexStep.next(
            Action.EXTERNAL_DIALOG,
            {
                action: "say",
                description:
                    "Says out loud next. Generally keep responses short.",
            }
        );

        log(
            colors.magenta(`[CORTEX] ${character.name} - Say: `) +
                `${characterCortexStep.value}\n`,
            "info",
            character.id
        );
    } else {
        characterCortexStep = await characterCortexStep.next(
            Action.EXTERNAL_DIALOG,
            {
                action: "say",
                description: `Goodbye ${interlocutor.name}!`,
            }
        );

        log(
            colors.magenta(`[CORTEX] ${character.name} Goodbye: `) +
                `${characterCortexStep.value}`,
            "info",
            character.id
        );
    }

    characterState.currentResponseNumber++;

    return characterCortexStep;
}

const processMemories = async (cortexStep, character, time) => {
    // TODO: fix this, it's inconsistent, maybe turn it into a function call with 4 parameters
    let characterRegex = /^-\s*(.+)\s*$/m;

    let characterMemory = await cortexStep.queryMemory(
        `Pick up to 4 most salient memories from the conversation that ${character.name} would have. List them in first person voice and maximum one sentence each. Use dashes to indent each memory and put them each on a new line.`
    );

    log(`Generated memories for ${character.name}: ${characterMemory}`);

    let characterMemoryCount = 0;
    let match;
    let memories = [];
    while ((match = characterRegex.exec(characterMemory)) !== null) {
        createMemory(character, match[1], time);
        memories.push(match[1]);
        characterMemoryCount++;
        characterMemory = characterMemory.slice(match.index + match[0].length);
    }

    log(
        colors.yellow(
            `[CONVERSATION] Created ${characterMemoryCount} memories for ${character.name}.`
        )
    );

    return memories;
};

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

    // Prevent inflight actions from occuring
    occupyAgents([data.characterId, data.targetCharacterId]);

    // Fetch characters
    const [character, targetCharacter] = await fetchCharacters([
        data.characterId,
        data.targetCharacterId,
    ]);

    // Setup cortex
    let characterCortexStep = await setupCortexStep(
        character,
        `I started a conversation with ${targetCharacter.name} to ${data.conversationGoal}`,
        targetCharacter.name
    );

    let targetCharacterCortexStep = await setupCortexStep(
        targetCharacter,
        `${character.name} started a conversation with me, although I don't know why yet.`,
        character.name
    );

    // Loop
    let characterPatience = 100;
    let characterConversationGoal = data.conversationGoal;
    let characterConversationFinished = false;

    let characterState = {
        patience: characterPatience,
        conversationGoal: characterConversationGoal,
        conversationFinished: characterConversationFinished,
        currentResponseNumber: 0,
    };

    let targetCharacterPatience = 100;
    let targetCharacterConversationGoal = `figuring out why ${character.name} started a conversation with them.`;
    let targetCharacterConversationFinished = false;

    let targetCharacterState = {
        patience: targetCharacterPatience,
        conversationGoal: targetCharacterConversationGoal,
        conversationFinished: targetCharacterConversationFinished,
        currentResponseNumber: 0,
    };

    while (true) {
        characterCortexStep = await processCharacterThoughts(
            character,
            characterCortexStep,
            characterState,
            targetCharacter,
            targetCharacterCortexStep.value as string | null
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

        // check if conversation is finished
        if (characterState.conversationFinished) {
            break;
        }

        // ---------- character 2 ----------
        targetCharacterCortexStep = await processCharacterThoughts(
            targetCharacter,
            targetCharacterCortexStep,
            targetCharacterState,
            character,
            characterCortexStep.value as string | null
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

        // check if conversation is finished
        if (targetCharacterState.conversationFinished) {
            break;
        }
    }

    await deoccupyAgents([data.characterId, data.targetCharacterId]);

    // Process memories for both characters

    // TODO: optimize promise chain here
    let characterMemories = await processMemories(
        characterCortexStep,
        character,
        data.time
    );
    let targetCharacterMemories = await processMemories(
        targetCharacterCortexStep,
        targetCharacter,
        data.time
    );

    if (characterMemories.length > 0) {
        await updateTaskListAfterConversation(character.id, characterMemories);
    }

    if (targetCharacterMemories.length > 0) {
        await updateTaskListAfterConversation(
            targetCharacter.id,
            targetCharacterMemories
        );
    }

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

let globalConversationDictionary = {};

async function startPlayerConversation(
    ws: WebSocket,
    data: {
        playerId: string;
        playerMessage: string;
        targetCharacterId: string;
        time: number;
    }
) {
    log(colors.yellow("[CONVERSATION] Starting conversation as player ..."));
    startNewConversationAsPlayer(ws, data);
}

async function continuePlayerConversation(
    ws: WebSocket,
    data: {
        playerId: string;
        playerMessage: string;
        targetCharacterId: string;
        time: number;
    }
) {
    log(colors.yellow("[CONVERSATION] Continuing conversation as player..."));
    if (globalConversationDictionary[data.playerId]) {
        continueConversationAsPlayer(ws, data);
    } else {
        log(`[CONVERSATION] No conversation found for ${data.playerId}`);
        return;
    }
}

async function continueConversationAsPlayer(
    ws: WebSocket,
    data: {
        playerId: string;
        playerMessage: string;
        targetCharacterId: string;
        time: number;
    }
) {
    log(colors.yellow("[CONVERSATION] Continuing conversation..."));
    log(colors.yellow("[CONVERSATION] Player: " + data.playerId));
    log(colors.yellow("[CONVERSATION] Character: " + data.targetCharacterId));

    // Fetch from global conversation dictionary
    let { targetCharacterId, targetCharacterState, targetCharacterCortexStep } =
        globalConversationDictionary[data.playerId];

    // Fetch characters
    const [player, targetCharacter] = await fetchCharacters([
        data.playerId,
        targetCharacterId,
    ]);

    // Process player message
    targetCharacterCortexStep = await processCharacterThoughts(
        targetCharacter,
        targetCharacterCortexStep,
        targetCharacterState,
        player,
        data.playerMessage
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

    // Save to global conversation dictionary
    globalConversationDictionary[data.playerId] = {
        targetCharacterId: data.targetCharacterId,
        targetCharacterState: targetCharacterState,
        targetCharacterCortexStep: targetCharacterCortexStep,
    };

    // check if conversation is finished
    if (targetCharacterState.conversationFinished) {
        endPlayerConversation(ws, data);
    }
}

async function startNewConversationAsPlayer(
    ws: WebSocket,
    data: {
        playerId: string;
        playerMessage: string;
        targetCharacterId: string;
        time: number;
    }
) {
    log(colors.yellow("[CONVERSATION] Starting conversation..."));
    log(colors.yellow("[CONVERSATION] Player: " + data.playerId));
    log(colors.yellow("[CONVERSATION] Character: " + data.targetCharacterId));

    // Prevent inflight actions from occuring
    occupyAgents([data.targetCharacterId]);

    // Fetch characters
    const [player, targetCharacter] = await fetchCharacters([
        data.playerId,
        data.targetCharacterId,
    ]);

    // Setup cortex
    let targetCharacterCortexStep = await setupCortexStep(
        targetCharacter,
        `${player.name} started a conversation with me, although I don't know why yet.`,
        player.name
    );

    // Character state
    let targetCharacterPatience = 100;
    let targetCharacterConversationGoal =
        "Figure out why " + player.name + " started a conversation with me.";
    let targetCharacterConversationFinished = false;

    let targetCharacterState = {
        patience: targetCharacterPatience,
        conversationGoal: targetCharacterConversationGoal,
        conversationFinished: targetCharacterConversationFinished,
        currentResponseNumber: 0,
    };

    targetCharacterCortexStep = await processCharacterThoughts(
        targetCharacter,
        targetCharacterCortexStep,
        targetCharacterState,
        player,
        data.playerMessage
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

    // Save to global conversation dictionary
    globalConversationDictionary[data.playerId] = {
        targetCharacterId: data.targetCharacterId,
        targetCharacterState: targetCharacterState,
        targetCharacterCortexStep: targetCharacterCortexStep,
    };

    // check if conversation is finished
    if (targetCharacterState.conversationFinished) {
        endPlayerConversation(ws, data);
    }
}

async function endPlayerConversation(
    ws: WebSocket,
    data: {
        playerId: string;
        playerMessage: string;
        targetCharacterId: string;
        time: number;
    }
) {
    await deoccupyAgents([data.targetCharacterId]);

    // Fetch from global conversation dictionary
    let { targetCharacterId, targetCharacterState, targetCharacterCortexStep } =
        globalConversationDictionary[data.playerId];

    // Fetch characters
    const [targetCharacter] = await fetchCharacters([targetCharacterId]);

    // Process memories
    const memories = await processMemories(
        targetCharacterCortexStep,
        targetCharacter,
        data.time
    );

    if (memories.length > 0) {
        await updateTaskListAfterConversation(targetCharacter.id, memories);
    }

    // --- end ---
    ws.send(
        JSON.stringify({
            type: "end_conversation",
            data: {
                characterId: data.playerId,
                targetCharacterId: data.targetCharacterId,
            },
        })
    );

    // Remove from global conversation dictionary
    delete globalConversationDictionary[data.playerId];
}

export {
    startConversation,
    startPlayerConversation,
    continuePlayerConversation,
};
