import { getMemoryImportance } from "../src/ai/memory";

describe("getMemoryImportance", () => {
    const testCases = [
        {
            memory: "Waking up and walking to the bathroom.",
            minRating: 1,
            maxRating: 3,
            description: "mundane memory",
        },
        {
            memory: "Graduating from the knight's academy with honors.",
            minRating: 5,
            maxRating: 8,
            description: "important memory",
        },
        {
            memory: "The death of my grandmother.",
            minRating: 8,
            maxRating: 10,
            description: "extremely poignant memory",
        },
    ];

    testCases.forEach(({ memory, minRating, maxRating, description }) => {
        it(`should return an importance within the expected range for a ${description}`, async () => {
            const importance = await getMemoryImportance(memory);

            expect(importance).toBeGreaterThanOrEqual(minRating);
            expect(importance).toBeLessThanOrEqual(maxRating);
        });
    });
});
