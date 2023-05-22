import { createChatCompletion } from "./openai.js";

async function getAction(
    ws: WebSocket,
    data: {
        characterId: string;
        location: {
            x: number;
            y: number;
        };
        availableActions: string[];
        inventory: string[];
        environment: string[];
        hitbox: string[];
    }
) {
    let prompt = "";
    prompt += `Character: \n`;
    prompt += `- ID: 1\n`;
    prompt += `- Name: Thomas Smith` + "\n";
    prompt += `- Age: 25` + "\n";
    prompt += `- Occupation: Lumberjack` + "\n";
    prompt += `- Personality: Introverted, Shy, Kind, Hardworking` + "\n";
    prompt += `Location: ${data.location.x}, ${data.location.y}\n`;
    prompt += `Environment:\n`;
    for (let i = 0; i < data.environment.length; i++) {
        const environment = data.environment[i];
        prompt += `- ${environment}\n`;
    }
    prompt += `Inventory:\n`;
    for (let i = 0; i < data.inventory.length; i++) {
        const item = data.inventory[i];
        prompt += `- ${item}\n`;
    }
    prompt += `Available Actions:\n`;
    for (let i = 0; i < data.availableActions.length; i++) {
        const action = data.availableActions[i];
        prompt += `- ${action}\n`;
    }
    prompt += `Hitbox (what you would hit with an action):\n`;
    for (let i = 0; i < data.hitbox.length; i++) {
        const hitbox = data.hitbox[i];
        prompt += `- ${hitbox}\n`;
    }

    prompt += `Task: \n`;
    prompt += `- Chop down the forest\n`;

    prompt += `Given the above information, what action should Thomas take? The desired output format is JSON, in the form { type: EventType, data: {any required parameters}}. You must include the character id (e.g. characterId) and reason in the data field. Please do not provide any other information or explanation. Also note that you will not be able to get to exactly all locations because of pathfinding limitations so consider anything below 0.5m as being at that location. Additionally anything within your hitbox will be hit by a chosen swing action.\n`;

    let generationAttempts = 0;
    while (generationAttempts < 5) {
        try {
            const response = await createChatCompletion([
                {
                    role: "user",
                    content: prompt,
                },
            ]);

            console.log("--- Prompt ---");
            console.log(prompt);

            console.log("--- Response ---");
            console.log(response);

            // Parse the response
            const action = JSON.parse(response);

            ws.send(JSON.stringify(action));

            return;
        } catch (e) {
            console.log(e);
            generationAttempts++;
        }
    }
}

export { getAction };
