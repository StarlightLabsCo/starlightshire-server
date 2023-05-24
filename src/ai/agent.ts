import { Action } from "../actions.js";
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
    prompt += `- ID: A1\n`;
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
    prompt += `Hitbox (what you would hit with a swing based action):\n`;
    if (data.hitbox.length === 0) {
        prompt += `- Nothing\n`;
    } else {
        for (let i = 0; i < data.hitbox.length; i++) {
            const hitbox = data.hitbox[i];
            prompt += `- ${hitbox}\n`;
        }
    }

    prompt += `Task: \n`;
    prompt += `- Find and pick up all the wood possible.\n`;
    prompt += "- Store any extra wood in the chest.\n";
    prompt += "\n";

    prompt += `Given the available actions, and accounting for pathfinding limits (no exact location reach, consider <0.5m as destination) and hitbox rules, which should Thomas take? Respond in JSON: { type: [ActionType], data: {characterId optional parameters}}. Optional parameters: 'x', 'y' for MoveTo, 'itemId' for PickUpItem. Please note that if an action is in the available items list, you can carry out that action right now, without needing to change or move. (e.g. if PickUpItem is in available actions, you can pick up at that item by creating a PickUpItem json object.) First you should list your reasoning and create a plan, and then using that plan, select an action and create a JSON object for that action with the necessary info. The JSON object must be immediately after "Action: " as we're using regex to parse it.\n`;

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
                    content: "Plan:",
                },
            ]);

            console.log("--- Prompt ---");
            console.log(prompt);

            console.log("--- Response ---");
            console.log("Plan: ");
            console.log(response);

            // Parse the response
            // Use regex to get evrything after "Action: "
            const action = response.match(/Action: (.*)/)[1].trim();

            const actionJSON = JSON.parse(action);

            // Verify action schema
            const verifiedAction = Action.parse(actionJSON);

            ws.send(JSON.stringify(verifiedAction));

            return;
        } catch (e) {
            console.log(e);
            generationAttempts++;
        }
    }
}

export { getAction };
