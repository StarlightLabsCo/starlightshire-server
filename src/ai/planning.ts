import { openai } from "./openai.js";
import { getCharacter } from "../character.js";
import { getGameDate } from "../game.js";
import { getAllMemoriesFromDay, getRelevantMemories } from "./memory.js";
import config from "../config.json" assert { type: "json" };

if (!config.model) throw new Error("No model provided in config.json");

// Planning (TODO)
const generatePlan = async (characterId: string) => {
    // Get the character's name
    const character = await getCharacter(characterId);
    const characterName = character.name;

    // Get the current game date
    const gameDate = 43; // await getGameDate(); // TODO: implement getGameDate

    // Generate the agent summary
    const agentSummary = await generateAgentSummary(characterId);

    // Generate summary of the previous day
    const previousDaySummary = await generateDaySummary(
        characterId,
        gameDate - 1
    );

    // Create the planning prompt
    let planningPrompt;
    planningPrompt += agentSummary;
    planningPrompt += previousDaySummary;
    planningPrompt +=
        "Today is " +
        gameDate +
        ". Please plan " +
        characterName +
        "'s day in broad strokes";

    // console.log("Agent Summary: ", agentSummary);
    // console.log("Previous Day Summary: ", previousDaySummary);

    // Generate the plan
    const completion = await openai.createChatCompletion({
        model: config.model,
        messages: [{ role: "user", content: planningPrompt }],
    });

    const plan = completion.data.choices[0].message.content;

    return plan;
};

// Agent Summary Description
const generateSummaryInfo = async (
    characterId: string,
    query: string,
    question: string
) => {
    // Get character and memories (15 is arbitrary number)
    const [character, memories] = await Promise.all([
        getCharacter(characterId),
        getRelevantMemories(characterId, query, 15, false),
    ]);

    let prompt = `Statements about ${character.name}\n`;
    for (let j = 0; j < memories.length; j++) {
        const memory = memories[j];
        prompt += `${j + 1}. ${memory.memory}\n`;
    }
    prompt += question + "\n";

    const completion = await openai.createChatCompletion({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
    });

    return completion.data.choices[0].message.content;
};

const generateAgentSummary = async (characterId: string) => {
    // Get the character's name
    const character = await getCharacter(characterId);

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
                generateSummaryInfo(characterId, query, question[index])
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
const generateDaySummary = async (characterId: string, gameDate: number) => {
    // Get the character's name, and all the memories from the day
    const [character, memories] = await Promise.all([
        getCharacter(characterId),
        getAllMemoriesFromDay(characterId, gameDate),
    ]);

    // Generate the summary prompt
    let summary: string;
    summary += `Date: ${gameDate}\n`;
    summary += `Memories:\n`;
    for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        summary += `${i + 1}. ${memory.memory}\n`;
    }

    // Generate the summary
    const completion = await openai.createChatCompletion({
        model: config.model,
        messages: [
            { role: "user", content: summary },
            {
                role: "assistant",
                content: `Here is ${character.name}'s summary for the day:`,
            },
        ],
    });

    return completion.data.choices[0].message.content;
};

export { generatePlan };
