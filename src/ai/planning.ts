import { getCharacter } from "../character";
import { openai } from "./openai";
import * as config from "../config.json";
import { getAllMemoriesFromDay, getRelevantMemories } from "./memory";

// Planning (TODO)
const generatePlan = async (characterId: string) => {
    // Get the character's name
    const character = await getCharacter(characterId);
    const characterName = character.name;

    // Get the current game date
    const gameDate = await getGameDate(); // TODO: implement getGameDate

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

    // Generate the plan
    const completion = await openai.createChatCompletion({
        model: config.model,
        messages: [
            { role: "user", content: planningPrompt },
            {
                role: "assistant",
                content: `Today is ${gameDate}. Here is ${characterName}'s plan today in broad strokes:`,
            },
        ],
    });

    const plan = completion.data.choices[0].message.content;

    return plan;
};

// Agent Summary Description
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

    const generateSummaryInfo = async (
        characterId: string,
        query: string,
        question: string
    ) => {
        const memories = await getRelevantMemories(
            characterId,
            query,
            10,
            false
        );

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

    const [coreCharacteristics, currentDailyOccupation, recentProgress] =
        await Promise.all(
            queries.map((query, index) =>
                generateSummaryInfo(characterId, query, question[index])
            )
        );

    // Combine into a single summary
    let summary;
    summary += `Name: ${character.name} (age: ${character.age})\n`;
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
    let summary;
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
