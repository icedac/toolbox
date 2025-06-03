// Mock for image-size
module.exports = jest.fn((buffer) => {
    // Return default dimensions
    return {
        width: 1024,
        height: 768,
        type: 'jpg'
    };
});

// Also export as default
module.exports.default = module.exports;