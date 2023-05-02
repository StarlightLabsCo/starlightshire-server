module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
    },
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
