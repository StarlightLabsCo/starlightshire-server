import { z } from "zod";

const MoveToEvent = z
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

const DropItemEvent = z
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

const SwingAxeEvent = z
    .object({
        type: z.literal("swing_axe"),
        data: z
            .object({
                characterId: z.string(),
            })
            .strict(),
    })
    .strict();

const SwingSwordEvent = z
    .object({
        type: z.literal("swing_sword"),
        data: z
            .object({
                characterId: z.string(),
            })
            .strict(),
    })
    .strict();

const SwingPickaxeEvent = z
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

export const Action = z.union([
    AddItemToChest,
    RemoveItemFromChest,
    MoveToEvent,
    DropItemEvent,
    SwingAxeEvent,
    SwingSwordEvent,
    SwingPickaxeEvent,
]);
