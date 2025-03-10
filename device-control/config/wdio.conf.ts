import type { Options } from '@wdio/types';

export const config: Options.Testrunner = {
    runner: 'local',
    autoCompileOpts: {
        autoCompile: true,
        tsNodeOpts: {
            transpileOnly: true,
            project: 'tsconfig.json'
        }
    },
    port: 4723,
    specs: [
        './tests/**/*.spec.ts'
    ],
    exclude: [],
    maxInstances: 1,
    capabilities: [{
        maxInstances: 1,
        platformName: 'iOS',
        'appium:deviceName': 'iPhone Simulator',
        'appium:platformVersion': '16.4',
        'appium:automationName': 'XCUITest',
        'appium:newCommandTimeout': 240
    }],
    logLevel: 'info',
    bail: 0,
    baseUrl: '',
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    services: ['appium'],
    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000
    }
}; 