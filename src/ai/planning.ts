import { getCharacter } from "../character.js";
import { getRelevantMemories } from "./memory.js";
import config from "../config.json" assert { type: "json" };
import { Character } from "@prisma/client";
import { prisma } from "../db.js";
import { createChatCompletion } from "./openai.js";
import { replayTimestamp } from "../logger.js";

if (!config.model) throw new Error("No model provided in config.json");

const generatePlan = async (character: Character) => {
    // Get the current game date
    // const gameDate = await getGameDate();

    // Generate the agent summary
    const agentSummary = await generateAgentSummary(character);

    // // Generate summary of the previous day
    // const previousDaySummary = await generateDaySummary(
    //     character,
    //     new Date(gameDate.getTime() - 86400000)
    // );

    // Create the planning prompt
    let planningPrompt;
    planningPrompt += agentSummary;
    // planningPrompt += previousDaySummary;
    planningPrompt +=
        "Today is " +
        "Wed May 6th, 2023" +
        `. ${character.name} is a fictional character. Please create a rough outline of ` +
        character.name +
        "'s potential schedule today only. Do not create a schedule for any other day. Do not provide any disclaimers or text outside of the schedule in the response. Please provide each time period in the format of 'HH:MM - HH:MM: <action/event>, with each on a new line.\n";

    // Generate the plan
    const completion = await createChatCompletion(
        [{ role: "user", content: planningPrompt }],
        undefined,
        undefined,
        replayTimestamp.getTime().toString(),
        "generatePlan"
    );

    // const plans = completion.split("\n");

    // return plans;
    return;
};

async function decomposePlan(character: Character, plan: string) {
    // Fetch relevant memories for the plan
    const memories = await getRelevantMemories(character, plan, 10);

    // Create the prompt
    let prompt = `Related memories:\n`;
    for (let j = 0; j < memories.length; j++) {
        const memory = memories[j];
        prompt += `${j + 1}. ${memory.memory}\n`;
    }

    prompt += `Create a schedule of subtasks to complete the following task within the provided timeframe. Do not create tasks outside this time frame. Please keep the same format, just with smaller time increments. Decompose this task: ${plan}\n`;

    // Generate the subtasks
    const completion = await createChatCompletion(
        [{ role: "user", content: prompt }],
        undefined,
        undefined,
        replayTimestamp.getTime().toString(),
        "decomposePlan"
    );

    return completion;
}

// Agent Summary Description
const generateSummaryInfo = async (
    character: Character,
    query: string,
    question: string
) => {
    // Get character and memories (15 is arbitrary number)
    const memories = await getRelevantMemories(character, query, 15, false);

    let prompt = `Statements about ${character.name}\n`;
    for (let j = 0; j < memories.length; j++) {
        const memory = memories[j];
        prompt += `${j + 1}. ${memory.memory}\n`;
    }
    prompt += question + "\n";

    const completion = await createChatCompletion(
        [{ role: "user", content: prompt }],
        undefined,
        undefined,
        replayTimestamp.getTime().toString(),
        "generateSummaryInfo"
    );

    return completion;
};

const generateAgentSummary = async (character: Character) => {
    // Generate the summary info
    const queries = [
        `${character.name}'s core characteristics`,
        `${character.name}'s current daily occupation`,
        `${character.name}'s feeling about his recent progress in life`,
    ];
    const question = [
        `How would one describe ${character.name}'s core characteristics given the above statements?`,
        `How would one describe ${character.name}'s current daily occupation given the above statements?`,
        `How would one describe ${character.name}'s feeling about his recent progress in life given the above statements?`,
    ];

    const [coreCharacteristics, currentDailyOccupation, recentProgress] =
        await Promise.all(
            queries.map((query, index) =>
                generateSummaryInfo(character, query, question[index])
            )
        );

    // Combine into a single summary
    let summary = `Name: ${character.name} (age: ${character.age})\n`;
    summary += `Core Characteristics: ${coreCharacteristics}\n`;
    summary += `Current Daily Occupation: ${currentDailyOccupation}\n`;
    summary += `Recent Progress: ${recentProgress}\n`;

    return summary;
};

// Day Summary
// const generateDaySummary = async (character: Character, gameDate: Date) => {
//     // Get the character's name, and all the memories from the day
//     const memories = await getAllMemoriesFromDay(character, gameDate);

//     // Generate the summary prompt
//     let summary: string;
//     summary += `Date: ${gameDate}\n`;
//     summary += `Memories:\n`;
//     for (let i = 0; i < memories.length; i++) {
//         const memory = memories[i];
//         summary += `${i + 1}. ${memory.memory}\n`;
//     }

//     // Generate the summary
//     const completion = await createChatCompletion([
//         { role: "user", content: summary },
//         {
//             role: "assistant",
//             content: `Here is ${character.name}'s summary for the day:`,
//         },
//     ]);

//     return completion;
// };

export { generatePlan, generateAgentSummary }; // generateDaySummary,
