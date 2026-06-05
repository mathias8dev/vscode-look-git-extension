export enum TextInputValidationSeverity {
    Info,
    Warning,
    Error,
}

export interface TextInputValidationMessage {
    readonly message: string;
    readonly severity: TextInputValidationSeverity;
}

export interface TextInputOptions {
    readonly prompt: string;
    readonly value?: string;
    readonly placeHolder?: string;
    readonly validateInput?: (value: string) => TextInputValidationMessage | undefined;
}

export interface TextInputPort {
    showInput(options: TextInputOptions): Promise<string | undefined>;
}
