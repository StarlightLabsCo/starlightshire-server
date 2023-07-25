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
    reflectionQuestion: string
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
        )
    );

    let reflectionPrompt = `Statements about ${character.name}\n`;

    for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        reflectionPrompt += `${i + 1}. ${memory.memory}\n`;
    }

    reflectionPrompt +=
        "What 5 high-level insights can you infer from the above statements? (example format: insight (because of 1, 5, 3))";

    const completion = await createChatCompletion([
        { role: "user", content: reflectionPrompt },
    ]);

    const reflections = completion
        .replace(/[0-9]. /g, "")
        .trim()
        .split("\n");

    for (let i = 0; i < reflections.length; i++) {
        if (reflections[i].trim().length === 0) continue;

        createMemory(character, reflections[i]);
    }

    log(
        colors.green(
            "[REFLECTION] Reflection question answered and memories created."
        )
    );
};

const generateReflection = async (character: Character) => {
    log(colors.yellow("Generating reflection..."));

    const memories = await getLatestMemories(character, 100);
    log(
        colors.green(
            `[REFLECTION] Retrieved ${memories.length} latest memories for reflection generation.`
        )
    );

    let generateReflectionQuestionsPrompt = "";
    for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        generateReflectionQuestionsPrompt += `${i + 1}. ${memory.memory}\n`;
    }

    generateReflectionQuestionsPrompt += `Given only the information above, what are 3 most salient high-level questions we can answer about the subjects in the statements?\n`;

    const completion = await createChatCompletion([
        { role: "user", content: generateReflectionQuestionsPrompt },
    ]);

    const reflectionQuestionsParsed = completion
        .replace(/^[0-9].\s+?/g, "")
        .trim()
        .split("\n");

    for (let i = 0; i < reflectionQuestionsParsed.length; i++) {
        answerReflectionQuestion(character, reflectionQuestionsParsed[i]);
    }

    log(colors.green("[REFLECTION] Reflection generation completed."));
};

export { generateReflection };
