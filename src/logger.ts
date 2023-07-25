import fs from "fs";

let logfile = "";

function log(message: any) {
    console.log(message);
    let messageString;

    if (typeof message === "object") {
        // Stringify objects with indentation for readability
        messageString = JSON.stringify(message, null, 2);
    } else {
        // Non-objects (e.g., strings, numbers) can be appended as is
        messageString = message;
    }

    if (logfile.length > 0) {
        fs.appendFileSync(logfile, `[${Date.now()}]` + messageString + "\n");
    }
}

function setLogFile(path: string) {
    logfile = path;
}

export { log, setLogFile };
