# Clean Architecture Implementation Guide

## 🏗️ Overview

This is a complete refactoring of the getany toolbox following Clean Architecture principles and SOLID design patterns. The new architecture provides better separation of concerns, testability, and extensibility.

## 📁 Project Structure

```
src/
├── domain/              # Core business logic (no dependencies)
│   ├── entities/       # Business objects
│   ├── interfaces/     # Contracts for external dependencies
│   └── value-objects/  # Immutable domain concepts
│
├── application/         # Use cases and application logic
│   ├── use-cases/      # Application-specific business rules
│   └── services/       # Application services
│
├── infrastructure/      # External frameworks and tools
│   ├── downloaders/    # Platform-specific downloaders
│   ├── storage/        # File storage implementations
│   ├── authentication/ # Auth mechanisms
│   └── http/          # HTTP clients
│
├── presentation/        # User interfaces
│   ├── cli/           # Command-line interface
│   └── config/        # Configuration management
│
└── shared/             # Cross-cutting concerns
    ├── errors/        # Error handling
    ├── logging/       # Logging infrastructure
    └── utils/         # Common utilities
```

## 🚀 Quick Start

### Installation

```bash
cd src
npm install
npm run build
```

### Basic Usage

```bash
# Download from Instagram
npm run dev https://www.instagram.com/p/SHORTCODE/

# With authentication
export INSTAGRAM_COOKIES_FILE=/path/to/cookies.txt
npm run dev https://www.instagram.com/p/SHORTCODE/

# With options
npm run dev https://example.com/media --quality high --output downloads
```

### Programmatic Usage

```typescript
import { setupDependencies } from './presentation/cli/setup';
import { LoggerFactory } from './shared/logging/Logger';

const logger = LoggerFactory.getLogger('App');
const config = { outputDir: 'downloads' };
const { downloadUseCase } = await setupDependencies(config, logger);

const result = await downloadUseCase.execute({
    url: 'https://instagram.com/p/XXX',
    quality: 'high'
});
```

## 🏛️ Architecture Principles

### 1. Dependency Rule
Dependencies only point inward. Inner layers know nothing about outer layers.

```
Presentation → Application → Domain
     ↓            ↓           ↑
     └──→ Infrastructure ─────┘
```

### 2. SOLID Principles

#### Single Responsibility (SRP)
Each class has one reason to change:
- `Media` entity only handles media properties
- `InstagramDownloader` only handles Instagram-specific logic
- `LocalFileStorage` only handles file operations

#### Open/Closed (OCP)
Open for extension, closed for modification:
- Add new platforms by implementing `IMediaDownloader`
- Add storage providers by implementing `IFileStorage`
- No need to modify existing code

#### Dependency Inversion (DIP)
Depend on abstractions, not concretions:
- Use cases depend on interfaces
- Infrastructure implements domain interfaces
- Dependency injection for flexibility

## 🔧 Key Components

### Domain Layer

#### Entities
- `Media`: Core media representation
- `User`: Authenticated user information
- `DownloadResult`: Result of download operation

#### Interfaces
- `IMediaDownloader`: Contract for platform downloaders
- `IFileStorage`: Contract for file storage
- `IAuthenticator`: Contract for authentication

#### Value Objects
- `MediaUrl`: Validated URL representation
- `Filename`: Safe filename handling

### Application Layer

#### Use Cases
- `DownloadMediaUseCase`: Orchestrates media download process

### Infrastructure Layer

#### Downloaders
- `InstagramDownloader`: Instagram-specific implementation
- `BaseDownloader`: Common downloader functionality

#### Storage
- `LocalFileStorage`: Local file system storage

#### Authentication
- `CookieAuthenticator`: Cookie-based authentication

#### HTTP
- `HttpClient`: HTTP client with retry logic

### Presentation Layer

#### CLI
- `CliApplication`: Main CLI framework
- `DownloadCommand`: Download command implementation
- `AuthCommand`: Authentication command

#### Config
- `ConfigLoader`: Configuration management

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Test Structure

```typescript
describe('DownloadMediaUseCase', () => {
  it('should download media successfully', async () => {
    // Arrange
    const mockDownloader = createMock<IMediaDownloader>();
    const mockStorage = createMock<IFileStorage>();
    
    // Act
    const result = await useCase.execute({...});
    
    // Assert
    expect(result.success).toBe(true);
  });
});
```

## 🔌 Extending the Architecture

### Adding a New Platform

1. Create downloader implementation:
```typescript
export class TikTokDownloader extends BaseDownloader {
  canHandle(url: string): boolean {
    return url.includes('tiktok.com');
  }
  
  async extract(url: string): Promise<Media> {
    // TikTok-specific logic
  }
}
```

2. Register in setup:
```typescript
downloaders.set(Platform.TIKTOK, new TikTokDownloader(logger));
```

### Adding New Storage Provider

```typescript
export class S3Storage implements IFileStorage {
  async save(path: string, data: Buffer): Promise<DownloadedFile> {
    // S3 upload logic
  }
}
```

## 📈 Benefits

1. **Testability**: Each component can be tested in isolation
2. **Maintainability**: Clear separation of concerns
3. **Extensibility**: Easy to add new features
4. **Flexibility**: Switch implementations without changing business logic
5. **Scalability**: Architecture supports growth

## 🔄 Migration from Legacy

The new architecture coexists with the legacy code. You can:

1. Use the new CLI directly from `src/`
2. Import and use components programmatically
3. Gradually migrate features to the new architecture

## 📝 Best Practices

1. **Keep domain pure**: No external dependencies in domain layer
2. **Use interfaces**: Define contracts between layers
3. **Inject dependencies**: Use constructor injection
4. **Handle errors properly**: Use domain-specific errors
5. **Log appropriately**: Use structured logging

## 🤝 Contributing

When adding new features:

1. Start with domain entities/interfaces
2. Implement use cases in application layer
3. Add infrastructure implementations
4. Create presentation layer commands
5. Write comprehensive tests
6. Update documentation