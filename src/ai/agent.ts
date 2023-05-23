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
    if (data.inventory.length === 0) {
        prompt += `- Nothing\n`;
    } else {
        for (let i = 0; i < data.inventory.length; i++) {
            const item = data.inventory[i];
            prompt += `- ${item}\n`;
        }
    }
    prompt += `Available Actions (you can do these right now!):\n`;
    for (let i = 0; i < data.availableActions.length; i++) {
        const action = data.availableActions[i];
        prompt += `- ${action}\n`;
    }
    prompt += `Hitbox (what you would hit with an action):\n`;
    if (data.hitbox.length === 0) {
        prompt += `- Nothing\n`;
    } else {
        for (let i = 0; i < data.hitbox.length; i++) {
            const hitbox = data.hitbox[i];
            prompt += `- ${hitbox}\n`;
        }
    }

    prompt += `Task: \n`;
    prompt += `- Find and pick up wood.\n`;
    prompt += "\n";

    prompt += `What action should Thomas take, accounting for pathfinding limits (no exact location reach, consider <0.5m as destination) and hitbox rules? Respond in JSON: { type: [ActionType], data: {characterId, reason, optional parameters}}. Optional parameters: 'x', 'y' for MoveTo, 'itemId' for PickupItem. No extra info needed.\n`;

    let generationAttempts = 0;
    while (generationAttempts < 5) {
        try {
            const response = await createChatCompletion([
                {
                    role: "user",
                    content: prompt,
                },
                {
                    role: "assistant",
                    content: "Action:",
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
