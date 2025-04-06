export default class DateUtil {
    static now() {
        const now = new Date();

        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    static diffMinutes(storedTimeString) {
        const storedTime = new Date(storedTimeString);
        const currentTime = new Date();
        const timeDifference = currentTime - storedTime;
        return timeDifference / (1000 * 60);
    }

    static async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

}