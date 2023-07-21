// OpenAI
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";
import dotenv from "dotenv";
dotenv.config();

import config from "../config.json" assert { type: "json" };
import colors from "colors";

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
    basePath: "https://api.openai.com/v1",
});

// const configuration = new Configuration({
//     apiKey: process.env.OPENAI_API_KEY,
//     basePath: "https://api.openai.withlogging.com/v1",
//     baseOptions: {
//         headers: {
//             "X-Api-Key": `Bearer ${process.env.LLM_REPORT_API_KEY}`,
//         },
//     },
// });

const openai = new OpenAIApi(configuration);

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getEmbedding(input: string) {
    console.log(colors.yellow("[OPENAI] Creating embedding..."));

    let requestAttempts = 0;

    while (requestAttempts < config.requestAttempts) {
        try {
            const response = await openai.createEmbedding({
                model: config.embeddingModel,
                input: input,
            });

            console.log(
                colors.green("[OPENAI] Embedding created successfully.")
            );
            return response.data.data[0].embedding;
        } catch (e) {
            if (e.response && e.response.status === 429) {
                const resetTime =
                    e.response.headers["x-ratelimit-reset-requests"] * 1000; // Convert to milliseconds
                console.log(
                    colors.red(
                        `Rate limit exceeded. Waiting for ${resetTime}ms`
                    )
                );
                await sleep(resetTime);
                requestAttempts++;
            } else {
                console.log(colors.red(e));
                requestAttempts++;
            }
        }
    }
}

async function createChatCompletion(messages: ChatCompletionRequestMessage[]) {
    console.log(colors.yellow("[OPENAI] Creating chat completion..."));

    let requestAttempts = 0;
    while (requestAttempts < config.requestAttempts) {
        try {
            const startTime = performance.now();

            const response = await openai.createChatCompletion({
                model: config.model,
                messages: messages,
            });

            const endTime = performance.now();

            console.log(
                colors.cyan(
                    `[OPENAI] Chat completion took ${endTime - startTime}ms`
                )
            );

            const generatedTokens = response.data.usage.completion_tokens;

            console.log(
                colors.cyan(
                    `[OPENAI] Tokens per second: ` +
                        generatedTokens / ((endTime - startTime) / 1000) +
                        "tps"
                )
            );

            console.log(
                colors.green("[OPENAI] Chat completion created successfully.")
            );
            return response.data.choices[0].message.content.trim();
        } catch (e) {
            console.log(e);
            if (e.response && e.response.status === 429) {
                const resetTime =
                    e.response.headers["x-ratelimit-reset-requests"].split(
                        "s"
                    )[0] * 1000; // Convert to milliseconds
                console.log(
                    colors.red(
                        `[OPENAI] Rate limit exceeded. Waiting for ${resetTime}ms`
                    )
                );
                await sleep(resetTime);
                requestAttempts++;
            } else {
                console.log(colors.red(e));
                console.log(
                    colors.red("Failed to create chat completion. Retrying...")
                );

                requestAttempts++;
            }
        }
    }
}

export { getEmbedding, createChatCompletion };
