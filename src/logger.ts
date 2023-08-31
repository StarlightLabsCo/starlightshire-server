import fs from "fs";
import fsPromises from "fs/promises";
import { createInterface } from "readline";

let replayTimestamp: Date;
let globalLogPath: string;
let globalLogMap: Map<string | undefined, Logger>;

export type LogLevel = "info" | "warn" | "error";

async function initLogging(cliDescription: string | undefined) {
    // Create the run-specific log directory
    replayTimestamp = new Date();
    globalLogPath = `./data/${replayTimestamp.getTime()}/`;
    fs.mkdirSync(globalLogPath);

    // Initialize the global log map
    globalLogMap = new Map();
    createLogger(undefined, `global.log`);

    // Provide a description for the run
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    let description;
    if (cliDescription) {
        description = cliDescription;
    } else {
        description = await new Promise<string>((resolve) => {
            rl.question("Please describe the run: ", (description) => {
                resolve(description);
            });
        });
    }

    fs.writeFileSync(`${globalLogPath}description.txt`, description);
    rl.close();
}

function createLogger(id: string | undefined, logFilePath: string): Logger {
    const logger = new Logger(logFilePath);
    globalLogMap.set(id, logger);

    return logger;
}

function log(message: any, level: LogLevel = "info", id?: string): void {
    const logger = globalLogMap.get(id);
    if (!logger) {
        console.error(
            `Logger with id ${id} does not exist. Did you forget to create it?`
        );
        return;
    }

    logger.log(message, level);
}

function saveAction() {}

function saveResult() {}

class Logger {
    private logfile: string;
    private logQueue: string[];
    private isWriting: boolean;

    constructor(logFilePath: string) {
        this.logfile = globalLogPath + logFilePath;
        this.logQueue = [];
        this.isWriting = false;
        this.ensureFileExists();
    }

    private async ensureFileExists(): Promise<void> {
        try {
            await fsPromises.access(this.logfile);
        } catch (error) {
            if (error.code === "ENOENT") {
                await fsPromises.writeFile(this.logfile, "");
            } else {
                console.error(
                    "An error occurred while checking the log file:",
                    error
                );
            }
        }
    }

    private async writeLog(): Promise<void> {
        if (this.isWriting || this.logQueue.length === 0) {
            return;
        }

        this.isWriting = true;
        const logMessage = this.logQueue.shift() || "";

        try {
            await fsPromises.appendFile(this.logfile, logMessage);
        } catch (error) {
            console.error("Failed to write log:", error);
        }

        this.isWriting = false;

        // If there are more messages, continue writing
        if (this.logQueue.length > 0) {
            this.writeLog();
        }
    }

    log(message: any, level: LogLevel = "info"): void {
        console[level](`[${Date.now()}]`, message);

        // For logging objects
        let messageString: string =
            typeof message === "object"
                ? JSON.stringify(message, null, 2)
                : message;

        let logEntry = `[${Date.now()}] ${messageString}\n`;

        this.logQueue.push(logEntry);
        this.writeLog();
    }

    setLogFile(path: string): void {
        this.logfile = path;
    }
}

export {
    replayTimestamp,
    globalLogPath,
    globalLogMap,
    initLogging,
    createLogger,
    log,
};
