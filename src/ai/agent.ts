import { Action } from "../actions.js";
import { createChatCompletion } from "./openai.js";

const history = [];

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
    prompt += `- Personality: Introverted, Shy, Kind, Hardworking` + "\n\n";
    prompt += `Location: ${data.location.x}, ${data.location.y}\n\n`;
    prompt += `Environment:\n`;
    for (let i = 0; i < data.environment.length; i++) {
        const environment = data.environment[i];
        prompt += `- ${environment}\n`;
    }
    prompt += "\n";

    if (data.inventory.length > 0) {
        prompt += `Inventory:\n`;
        for (let i = 0; i < data.inventory.length; i++) {
            const item = data.inventory[i];
            prompt += `- ${item}\n`;
        }
        prompt += "\n";
    }

    prompt += `Available Actions:\n`;
    for (let i = 0; i < data.availableActions.length; i++) {
        const action = data.availableActions[i];
        prompt += `- ${action}\n\n`;
    }
    prompt += "\n";

    if (data.hitbox.length > 0) {
        prompt += `Hitbox (what you would hit with a swing based action):\n`;
        for (let i = 0; i < data.hitbox.length; i++) {
            const hitbox = data.hitbox[i];
            prompt += `- ${hitbox}\n`;
        }
        prompt += "\n";
    }

    prompt += `Task List: \n`;
    prompt += `- Find and pick up all the wood possible.\n`;
    prompt += "- Store any extra wood in the chest.\n";
    prompt += "\n";

    if (history.length > 0) {
        prompt += `Previous Actions:\n`;
        // print the most recent 5 actions
        for (let i = Math.max(0, history.length - 5); i < history.length; i++) {
            const action = history[i];
            prompt += `- [${action.type}]: ${JSON.stringify(action.data)}\n`;
        }
        prompt += "\n";
    }

    prompt += `Given the available actions and the assigned task, which should Thomas take? Respond in JSON: { type: [ActionType], data: {characterId optional parameters}}. Please note that if an action is in the available items list, you can execute it immediately, without needing to change or move. (e.g. if PickUpItem is in available actions, you can pick up that item by creating a PickUpItem json object.) First you should list your reasoning and create a plan, and then using that plan, select an action and create a JSON object for that action with the necessary info. The JSON object must be immediately after "Action: " as we're using regex to parse it.\n\n`;

    const extractJSON = (str) => {
        let firstOpen, firstClose, candidate;
        firstOpen = str.indexOf("{");
        do {
            firstClose = str.lastIndexOf("}");
            if (firstClose <= firstOpen) {
                return null;
            }
            do {
                candidate = str.substring(firstOpen, firstClose + 1);
                try {
                    const result = JSON.parse(candidate);
                    return result;
                } catch (e) {
                    console.log("Failed to parse " + candidate);
                }
                firstClose = str.substr(0, firstClose).lastIndexOf("}");
            } while (firstClose > firstOpen);
            firstOpen = str.indexOf("{", firstOpen + 1);
        } while (firstOpen !== -1);
    };

    let generationAttempts = 0;
    while (generationAttempts < 5) {
        try {
            console.log("--- Prompt ---");
            console.log(prompt);

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

            console.log("--- Response ---");
            console.log("Plan: ");
            console.log(response);

            const actionJSON = extractJSON(response);

            if (actionJSON === null) {
                throw new Error("No valid JSON object found in response");
            }

            // Verify action schema
            const verifiedAction = Action.parse(actionJSON);

            history.push(verifiedAction);

            ws.send(JSON.stringify(verifiedAction));

            return;
        } catch (e) {
            console.log(e);
            generationAttempts++;
        }
    }
}

export { getAction };
