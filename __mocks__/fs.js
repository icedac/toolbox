// Mock for fs module
module.exports = {
    existsSync: jest.fn(() => false),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn(() => ''),
    unlinkSync: jest.fn(),
    statSync: jest.fn(() => ({
        size: 1000,
        isDirectory: () => false,
        isFile: () => true
    })),
    readdirSync: jest.fn(() => []),
    rmSync: jest.fn(),
    promises: {
        readFile: jest.fn(() => Promise.resolve('')),
        writeFile: jest.fn(() => Promise.resolve()),
        mkdir: jest.fn(() => Promise.resolve()),
        unlink: jest.fn(() => Promise.resolve())
    }
};