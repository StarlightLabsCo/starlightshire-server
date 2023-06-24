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

export { extractJSON };
