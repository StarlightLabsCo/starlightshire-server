import { z } from "zod";

const MoveTo = z
    .object({
        type: z.literal("move_to"),
        data: z
            .object({
                characterId: z.string(),
                x: z.number(),
                y: z.number(),
            })
            .strict(),
    })
    .strict();

const DropItem = z
    .object({
        type: z.literal("drop"),
        data: z
            .object({
                characterId: z.string(),
                itemId: z.union([
                    z.literal("wood"),
                    z.literal("stone"),
                    z.literal("iron"),
                    z.literal("diamond"),
                    z.literal("copper"),
                    z.literal("coal"),
                    z.literal("axe"),
                    z.literal("pickaxe"),
                    z.literal("sword"),
                ]),
            })
            .strict(),
    })
    .strict();

const SwingAxe = z
    .object({
        type: z.literal("swing_axe"),
        data: z
            .object({
                characterId: z.string(),
            })
            .strict(),
    })
    .strict();

const SwingSword = z
    .object({
        type: z.literal("swing_sword"),
        data: z
            .object({
                characterId: z.string(),
            })
            .strict(),
    })
    .strict();

const SwingPickaxe = z
    .object({
        type: z.literal("swing_pickaxe"),
        data: z
            .object({
                characterId: z.string(),
            })
            .strict(),
    })
    .strict();

const AddItemToChest = z
    .object({
        type: z.literal("add_to_chest"),
        data: z
            .object({
                characterId: z.string(),
                itemId: z.union([
                    z.literal("wood"),
                    z.literal("stone"),
                    z.literal("iron"),
                    z.literal("diamond"),
                    z.literal("copper"),
                    z.literal("coal"),
                    z.literal("axe"),
                    z.literal("pickaxe"),
                    z.literal("sword"),
                ]),
                chestId: z.string(),
            })
            .strict(),
    })
    .strict();

const RemoveItemFromChest = z
    .object({
        type: z.literal("remove_from_chest"),
        data: z
            .object({
                characterId: z.string(),
                itemId: z.string(),
                chestId: z.string(),
            })
            .strict(),
    })
    .strict();

const StartConversation = z
    .object({
        type: z.literal("start_conversation"),
        data: z
            .object({
                characterId: z.string(),
                targetCharacterId: z.string(),
                conversationGoal: z.string(),
            })
            .strict(),
    })
    .strict();

export const Action = z.union([
    AddItemToChest,
    RemoveItemFromChest,
    MoveTo,
    DropItem,
    SwingAxe,
    SwingSword,
    SwingPickaxe,
    StartConversation,
]);
