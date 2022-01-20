export class OclcQueryParams {
    public index: string;
    public matcher: string;
    public value: string;

    constructor(index: string, matcher: string, value: string) {
        this.index = index;
        this.matcher = matcher;
        this.value = value;
    }
}

