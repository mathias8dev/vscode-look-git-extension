export interface TextInputOptions {
    readonly prompt: string;
    readonly value?: string;
    readonly placeHolder?: string;
}

export interface TextInputPort {
    showInput(options: TextInputOptions): Promise<string | undefined>;
}
