import { openai } from "./openai.js";
import { getCharacter } from "../character.js";
import { getGameDate } from "../game.js";
import { getAllMemoriesFromDay, getRelevantMemories } from "./memory.js";
import config from "../config.json" assert { type: "json" };
import { Character } from "@prisma/client";
import { prisma } from "../db.js";

if (!config.model) throw new Error("No model provided in config.json");

// Planning (TODO)
const generateDateWithTime = (baseDate, timeString) => {
    const [hours, minutes] = timeString.split(":");
    const newDate = new Date(baseDate);
    newDate.setHours(parseInt(hours, 10));
    newDate.setMinutes(parseInt(minutes, 10));
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate;
};

const generatePlan = async (character: Character) => {
    // Get the current game date
    const gameDate = await getGameDate();

    // Generate the agent summary
    const agentSummary = await generateAgentSummary(character);

    // Generate summary of the previous day
    const previousDaySummary = await generateDaySummary(
        character,
        new Date(gameDate.getTime() - 86400000)
    );

    // Create the planning prompt
    let planningPrompt;
    planningPrompt += agentSummary;
    planningPrompt += previousDaySummary;
    planningPrompt +=
        "Today is " +
        "Wed May 6th, 2023" +
        `. ${character.name} is a fictional character. Please create a rough outline of ` +
        character.name +
        "'s potential schedule today only. Do not create a schedule for any other day. Do not provide any disclaimers or text outside of the schedule in the response. Please provide each time period in the format of 'HH:MM - HH:MM: <action/event>, with each on a new line.\n";

    // Generate the plan
    const completion = await openai.createChatCompletion({
        model: config.model,
        messages: [{ role: "user", content: planningPrompt }],
    });

    const plans = completion.data.choices[0].message.content.split("\n");

    // For each line, decompose the plan into smaller plans

    // Parallel approach
    const subplans = await Promise.all(
        plans.map((subplan) => decomposePlan(character, subplan))
    );

    // Split subplans by newline
    let tasks: string[] = [];
    for (let i = 0; i < subplans.length; i++) {
        tasks = tasks.concat(subplans[i].split("\n"));
    }

    // Add the subplans to the database as a memory
    for (let i = 0; i < tasks.length; i++) {
        // Use regex to extract start time (HH:MM) and end time (HH:MM). It's in the format of "HH:MM - HH:MM: <action/event>"
        // example: "9:00 - 10:00: Go to the gym"

        const matches = tasks[i].match(
            /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2}): (.*)/
        );

        console.log("------------------------");
        if (matches) {
            const startTime = matches[1];
            const endTime = matches[2];
            const task = matches[3];

            const startTimeDate = generateDateWithTime(gameDate, startTime);
            const endTimeDate = generateDateWithTime(gameDate, endTime);

            console.log('Task: "' + task + '"');
            console.log("Start time: " + startTime); // Start Time: 9:00
            console.log("End time: " + endTime); // End Time: 10:00

            // How can I convert the start and end time to a date in the same day as the game date?

            await prisma.task.create({
                data: {
                    character: {
                        connect: {
                            id: character.id,
                        },
                    },
                    gameDateStart: startTimeDate,
                    gameDateEnd: endTimeDate,
                    task: task,
                },
            });
        } else {
            console.log('Task: "' + tasks[i] + '"');
            console.log("No matches found.");
        }
        console.log("------------------------");
    }
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
    const completion = await openai.createChatCompletion({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
    });

    return completion.data.choices[0].message.content;
}

async function cleanupPlan(character: Character, plan: string) {
    let prompt;
    prompt += `This is the upcoming schedule for ${character.name}:\n`;
    prompt += plan + "\n";
    prompt += `Please fix the formating in the above schedule in the following format: "HH:MM - HH:MM: <action/event>", with each on a new line. Remove any duplicate tasks, or tasks that do not make sense.\n`;

    const completion = await openai.createChatCompletion({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
    });

    return completion.data.choices[0].message.content;
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

    const completion = await openai.createChatCompletion({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
    });

    return completion.data.choices[0].message.content;
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
const generateDaySummary = async (character: Character, gameDate: Date) => {
    // Get the character's name, and all the memories from the day
    const memories = await getAllMemoriesFromDay(character, gameDate);

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

export { generatePlan, generateDaySummary, generateAgentSummary };
