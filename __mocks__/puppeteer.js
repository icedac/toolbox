// Mock for puppeteer
module.exports = {
    launch: jest.fn(() => Promise.resolve({
        newPage: jest.fn(() => Promise.resolve({
            goto: jest.fn(() => Promise.resolve()),
            setRequestInterception: jest.fn(() => Promise.resolve()),
            on: jest.fn(),
            close: jest.fn(() => Promise.resolve()),
            setExtraHTTPHeaders: jest.fn(() => Promise.resolve()),
            setCookie: jest.fn(() => Promise.resolve()),
            evaluate: jest.fn(() => Promise.resolve({}))
        })),
        close: jest.fn(() => Promise.resolve())
    }))
};