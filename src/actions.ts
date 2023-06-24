import { z } from "zod";

const MoveToEvent = z
    .object({
        type: z.literal("MoveTo"),
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
        type: z.literal("DropItem"),
        data: z
            .object({
                characterId: z.string(),
                itemId: z.string(),
            })
            .strict(),
    })
    .strict();

const SwingAxeEvent = z
    .object({
        type: z.literal("SwingAxe"),
        data: z
            .object({
                characterId: z.string(),
            })
            .strict(),
    })
    .strict();

const SwingSwordEvent = z
    .object({
        type: z.literal("SwingSword"),
        data: z
            .object({
                characterId: z.string(),
            })
            .strict(),
    })
    .strict();

const SwingPickaxeEvent = z
    .object({
        type: z.literal("SwingPickaxe"),
        data: z
            .object({
                characterId: z.string(),
            })
            .strict(),
    })
    .strict();

const AddItemToChest = z
    .object({
        type: z.literal("AddItemToChest"),
        data: z
            .object({
                characterId: z.string(),
                itemId: z.string(),
                chestId: z.string(),
            })
            .strict(),
    })
    .strict();

const RemoveItemFromChest = z
    .object({
        type: z.literal("RemoveItemFromChest"),
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
