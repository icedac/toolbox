// Mock for instagram-private-api module
export class IgApiClient {
    state = {
        generateDevice: jest.fn(),
        serialize: jest.fn().mockReturnValue({
            cookies: JSON.stringify([])
        }),
        deserialize: jest.fn()
    };
    
    account = {
        login: jest.fn().mockResolvedValue({
            logged_in_user: {
                pk: '12345',
                username: 'test_user'
            }
        }),
        currentUser: jest.fn().mockResolvedValue({
            pk: '12345',
            username: 'test_user'
        })
    };
    
    media = {
        info: jest.fn().mockResolvedValue({
            items: [{
                id: '123456',
                code: 'TEST123',
                user: { username: 'testuser' },
                caption: { text: 'Test caption' },
                media_type: 1,
                image_versions2: {
                    candidates: [
                        { url: 'https://example.com/photo.jpg', width: 1080 }
                    ]
                }
            }]
        })
    };
    
    user = {
        searchExact: jest.fn().mockResolvedValue({
            pk: '12345',
            username: 'test_user'
        })
    };
}