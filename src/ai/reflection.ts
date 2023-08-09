import { createChatCompletion } from "./openai.js";
import {
    createMemory,
    getLatestMemories,
    getRelevantMemories,
} from "./memory.js";
import { Character } from "@prisma/client";
import config from "../config.json" assert { type: "json" };
import colors from "colors";
import { log } from "../logger.js";

if (!config.model) throw new Error("No model provided in config.json");

const answerReflectionQuestion = async (
    character: Character,
    reflectionQuestion: string,
    time: number
) => {
    log(colors.yellow("[REFLECTION] Answering reflection question..."));

    const memories = await getRelevantMemories(
        character,
        reflectionQuestion,
        10
    );
    log(
        colors.green(
            `[REFLECTION] Retrieved ${memories.length} relevant memories for the reflection question.`
        ),
        "info",
        character.id
    );

    let reflectionPrompt = `${character.name}'s memories related to the reflection question:\n`;

    for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        reflectionPrompt += `${i + 1}. ${memory.memory}\n`;
    }

    reflectionPrompt +=
        "What 5 high-level insights can you infer from the above statements from" +
        character.name +
        "'s point of view?\n";

    log(reflectionPrompt, "info", character.id);

    const completion = await createChatCompletion([
        {
            role: "system",
            content:
                "The job of the reflection system is to take the observations, and memories of characters and generative higher level insights from their point of view. Please avoid breaking the fourth wall.",
        },
        { role: "user", content: reflectionPrompt },
    ]);

    log(completion);

    const reflections = completion.content
        .replace(/[0-9]. /g, "")
        .trim()
        .split("\n");

    for (let i = 0; i < reflections.length; i++) {
        if (reflections[i].trim().length === 0) continue;

        createMemory(character, reflections[i], time);
    }

    log(
        colors.green(
            "[REFLECTION] Reflection question answered and memories created."
        ),
        "info",
        character.id
    );
};

const generateReflection = async (character: Character, time: number) => {
    log(colors.yellow("Generating reflection..."));

    const memories = await getLatestMemories(character, 100);
    log(
        colors.green(
            `[REFLECTION] Retrieved ${memories.length} latest memories for reflection generation.`
        ),
        "info",
        character.id
    );

    let generateReflectionQuestionsPrompt = "";
    for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        generateReflectionQuestionsPrompt += `${i + 1}. ${memory.memory}\n`;
    }

    generateReflectionQuestionsPrompt += `Given only the information above, what are 3 most salient high-level questions we can answer about the subjects in the statements from ${character.name}'s point of view?\n`;

    log(generateReflectionQuestionsPrompt, "info", character.id);

    const completion = await createChatCompletion([
        {
            role: "system",
            content:
                "The job of the reflection system is to take the observations, and memories of characters and generate reflection questions that they might have from their point of view. Please avoid breaking the fourth wall.",
        },
        { role: "user", content: generateReflectionQuestionsPrompt },
    ]);

    log(completion, "info", character.id);

    const reflectionQuestionsParsed = completion.content
        .replace(/^[0-9].\s+?/g, "")
        .trim()
        .split("\n");

    for (let i = 0; i < reflectionQuestionsParsed.length; i++) {
        answerReflectionQuestion(character, reflectionQuestionsParsed[i], time);
    }

    log(colors.green("[REFLECTION] Reflection generation completed."));
};

export { generateReflection };
