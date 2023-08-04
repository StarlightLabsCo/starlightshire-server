// OpenAI
import dotenv from "dotenv";
dotenv.config();

import config from "../config.json" assert { type: "json" };
import colors from "colors";
import { log } from "../logger.js";

import OpenAI from "openai";
import { exit } from "process";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // This is also the default, can be omitted
});

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getEmbedding(input: string) {
    log(colors.yellow("[OPENAI] Creating embedding..."));

    let requestAttempts = 0;

    while (requestAttempts < config.requestAttempts) {
        try {
            const response = await openai.embeddings.create({
                model: config.embeddingModel,
                input: input,
            });

            log(colors.green("[OPENAI] Embedding created successfully."));
            return response.data[0].embedding;
        } catch (e) {
            if (e.response && e.response.status === 429) {
                const resetTime =
                    e.response.headers["x-ratelimit-reset-requests"] * 1000; // Convert to milliseconds
                log(
                    colors.red(
                        `Rate limit exceeded. Waiting for ${resetTime}ms`
                    )
                );
                await sleep(resetTime);
                requestAttempts++;
            } else {
                log(colors.red(e));
                requestAttempts++;
            }
        }
    }
}

async function createChatCompletion(
    messages: OpenAI.Chat.Completions.CreateChatCompletionRequestMessage[],
    functions?: OpenAI.Chat.Completions.CompletionCreateParams.CreateChatCompletionRequestNonStreaming.Function[]
) {
    log(colors.yellow("[OPENAI] Creating chat completion..."));

    let requestAttempts = 0;
    while (requestAttempts < config.requestAttempts) {
        try {
            const startTime = performance.now();

            let response;

            if (functions) {
                response = await openai.chat.completions.create({
                    model: config.model,
                    messages: messages,
                    functions: functions,
                    function_call: "auto",
                });
                console.log();
            } else {
                response = await openai.chat.completions.create({
                    model: config.model,
                    messages: messages,
                });
            }

            const endTime = performance.now();

            log(
                colors.cyan(
                    `[OPENAI] Chat completion took ${endTime - startTime}ms`
                )
            );

            const generatedTokens = response.usage.completion_tokens;

            log(
                colors.cyan(
                    `[OPENAI] Tokens per second: ` +
                        generatedTokens / ((endTime - startTime) / 1000) +
                        "tps"
                )
            );

            log(colors.green("[OPENAI] Chat completion created successfully."));

            return response.choices[0].message;
        } catch (e) {
            log(e);
            if (e.response && e.response.status === 429) {
                const resetTime =
                    e.response.headers["x-ratelimit-reset-requests"].split(
                        "s"
                    )[0] * 1000; // Convert to milliseconds
                log(
                    colors.red(
                        `[OPENAI] Rate limit exceeded. Waiting for ${resetTime}ms`
                    )
                );
                await sleep(resetTime);
                requestAttempts++;
            } else {
                log(colors.red(e));
                log(
                    colors.red("Failed to create chat completion. Retrying...")
                );

                requestAttempts++;
            }
        }
    }
}

export { getEmbedding, createChatCompletion };
