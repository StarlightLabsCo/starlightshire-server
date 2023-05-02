import { prisma } from "./db.js";

const getCharacter = async (id: string) => {
    return await prisma.character.findUnique({
        where: {
            id,
        },
    });
};

export { getCharacter };
