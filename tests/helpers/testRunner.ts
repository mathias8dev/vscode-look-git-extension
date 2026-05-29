export type TestCase = {
    readonly name: string;
    readonly run: () => void | Promise<void>;
};

export async function runTestCases(suiteName: string, tests: readonly TestCase[]): Promise<void> {
    console.log(`\n${suiteName}`);

    const failures: string[] = [];

    for (const test of tests) {
        try {
            await test.run();
            console.log(`  ok ${test.name}`);
        } catch (error) {
            const message = error instanceof Error ? error.stack ?? error.message : String(error);
            failures.push(`  fail ${test.name}\n${message}`);
        }
    }

    if (failures.length > 0) {
        console.error(failures.join('\n'));
        throw new Error(`${failures.length} test(s) failed in ${suiteName}.`);
    }
}
