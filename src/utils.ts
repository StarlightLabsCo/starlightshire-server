let dayDuration = 250;

const convertTimeToString = (time: number): string => {
    const day = Math.floor(time / dayDuration);
    const totalHours = Math.floor((time % dayDuration) / 10);
    let hour = totalHours % 12;
    const minute = Math.floor(((time % dayDuration) % 10) * 6);
    const ampm = totalHours >= 12 ? "PM" : "AM";

    // handle the zero-hour (midnight) case appropriately
    if (hour === 0) {
        hour = 12;
    }

    // format the minute string with leading zeros
    const minuteString = minute < 10 ? `0${minute}` : `${minute}`;

    return `Day ${day}, ${hour}:${minuteString} ${ampm}`;
};

// return a string that's like "5 minutes ago", "2 hours ago", "just now" etc
const getRelativeTime = (referenceTime: number, currentTime: number) => {
    const timeDifference = currentTime - referenceTime;

    if (timeDifference < 0) {
        return "in the future"; // handle case where referenceTime is in the future
    } else if (timeDifference == 0) {
        return "just now";
    } else if (timeDifference < 10) {
        return `${Math.floor(timeDifference * 6)} minutes ago`;
    } else if (timeDifference < dayDuration) {
        return `${Math.floor(timeDifference / 10)} hours ago`;
    } else {
        return `${Math.floor(timeDifference / dayDuration)} days ago`;
    }
};

function getHungerDescription(satiety: number, maxSatiety: number): string {
    const fraction = satiety / maxSatiety;
    if (fraction === 1) return "Full";
    if (fraction > 0.75) return "Well-fed";
    if (fraction > 0.5) return "Satisfied";
    if (fraction > 0.25) return "Hungry";
    return "Starving";
}

export { convertTimeToString, getRelativeTime, getHungerDescription };
