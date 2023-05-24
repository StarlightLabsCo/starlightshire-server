import { z } from "zod";

const MoveToEvent = z.object({
    characterId: z.string(),
    x: z.number(),
    y: z.number(),
});

const PickUpItemEvent = z.object({
    characterId: z.string(),
    itemId: z.string(),
});

const DropItemEvent = z.object({
    characterId: z.string(),
    itemId: z.string(),
});

const SwingAxeEvent = z.object({
    characterId: z.string(),
});

const SwingSwordEvent = z.object({
    characterId: z.string(),
});

const SwingPickaxeEvent = z.object({
    characterId: z.string(),
});

export const Action = z.object({
    type: z.string(),
    data: z.union([
        MoveToEvent,
        PickUpItemEvent,
        DropItemEvent,
        SwingAxeEvent,
        SwingSwordEvent,
        SwingPickaxeEvent,
    ]),
});
