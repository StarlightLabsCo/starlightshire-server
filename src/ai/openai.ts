// OpenAI
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";
import dotenv from "dotenv";
dotenv.config();

import config from "../config.json" assert { type: "json" };

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
    basePath: "https://api.openai.withlogging.com/v1",
    baseOptions: {
        headers: {
            "X-Api-Key": `Bearer ${process.env.LLM_REPORT_API_KEY}`,
        },
    },
});

const openai = new OpenAIApi(configuration);

async function getEmbedding(input: string) {
    let requestAttempts = 0;

    while (requestAttempts < config.requestAttempts) {
        try {
            const response = await openai.createEmbedding({
                model: config.embeddingModel,
                input: input,
            });

            return response.data.data[0].embedding;
        } catch (e) {
            console.log(e);
            requestAttempts++;
        }
    }
}

async function createChatCompletion(messages: ChatCompletionRequestMessage[]) {
    let requestAttempts = 0;

    while (requestAttempts < config.requestAttempts) {
        try {
            const response = await openai.createChatCompletion({
                model: config.model,
                messages: messages,
            });

            return response.data.choices[0].message.content.trim();
        } catch (e) {
            console.log(e);
            console.log("Failed to create chat completion. Retrying...");

            requestAttempts++;
        }
    }
}

export { getEmbedding, createChatCompletion };
