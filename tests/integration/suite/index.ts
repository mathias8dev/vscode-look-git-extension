import * as path from 'path';
import Mocha from 'mocha';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 60_000,
    });

    mocha.addFile(path.resolve(__dirname, 'runtime.test.js'));

    return new Promise((resolve, reject) => {
        mocha.run((failures) => {
            if (failures > 0) {
                reject(new Error(`${failures} integration test(s) failed.`));
            } else {
                resolve();
            }
        });
    });
}
