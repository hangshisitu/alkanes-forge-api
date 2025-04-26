

export class Queue {

    constructor() {
        this._queue = [];
        this._empty = [];
    }

    isEmpty() {
        return this._queue.length === 0;
    }

    async get() {
        if (this.isEmpty()) {
            await new Promise(resolve => {
                this._empty.push(resolve);
            });
        }
        return this._queue.shift();
    }

    put(item) {
        this._queue.push(item);
        if (this._empty.length > 0) {
            const resolve = this._empty.shift();
            resolve();
        }
    }

}


