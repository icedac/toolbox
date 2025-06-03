// Mock for node-fetch
module.exports = jest.fn((url) => {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.from('')),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        headers: {
            get: () => null
        }
    });
});