
export class NetworkError extends Error {

    constructor(status, error) {
        super(error.message);
        this.status = status;
        this.error = error;
    }

}




