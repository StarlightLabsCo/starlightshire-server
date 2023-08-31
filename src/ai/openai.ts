// OpenAI
import dotenv from "dotenv";
dotenv.config();

import config from "../config.json" assert { type: "json" };
import colors from "colors";
import { log } from "../logger.js";

import OpenAI from "openai";

const openai = new OpenAI({
    baseURL: "https://llm_cache.harrishr.workers.dev",
});

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getEmbedding(input: string, run?: string, tag?: string) {
    log(colors.yellow("[OPENAI] Creating embedding..."));

    let requestAttempts = 0;

    let headers = {};
    if (tag) {
        headers["X-Starlight-Tag"] = tag;
    }

    if (run) {
        headers["X-Starlight-Run"] = run;
    }

    while (requestAttempts < config.requestAttempts) {
        try {
            const response = await openai.embeddings.create(
                {
                    model: config.embeddingModel,
                    input: input,
                },
                {
                    headers,
                }
            );

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
    functions?: OpenAI.Chat.Completions.CompletionCreateParams.CreateChatCompletionRequestNonStreaming.Function[],
    model: string = config.model,
    run?: string,
    tag?: string
) {
    log(
        colors.yellow(
            `[OPENAI][${
                model ? model : config.model
            }] Creating chat completion...`
        )
    );

    let openaiArgs = {
        model: model ? model : config.model,
        messages: messages,
    };

    if (functions) {
        openaiArgs["functions"] = functions;
        openaiArgs["function_call"] = "auto";
    }

    log(openaiArgs);

    let headers = {};
    if (tag) {
        headers["X-Starlight-Tag"] = tag;
    }

    if (run) {
        headers["X-Starlight-Run"] = run;
    }

    log(headers);

    let requestAttempts = 0;
    while (requestAttempts < config.requestAttempts) {
        try {
            const startTime = performance.now();

            let response = await openai.chat.completions.create(openaiArgs, {
                headers,
            });

            const endTime = performance.now();

            log(response);

            log(response.choices[0].message);

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
