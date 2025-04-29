export default class DateUtil {
    static now() {
        return DateUtil.formatDate(new Date());
    }

    static formatDate(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    static diffMinutes(storedTimeString) {
        const storedTime = new Date(storedTimeString);
        const currentTime = new Date();
        const timeDifference = currentTime - storedTime;
        return timeDifference / (1000 * 60);
    }

}