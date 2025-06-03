# Clean Architecture Implementation

This directory contains the refactored codebase following Clean Architecture principles and SOLID design patterns.

## 🏗️ Architecture Overview

```
src/
├── domain/           # Enterprise Business Rules
├── application/      # Application Business Rules  
├── infrastructure/   # Frameworks & Drivers
├── presentation/     # Interface Adapters
└── shared/          # Cross-cutting Concerns
```

## 📁 Layer Descriptions

### Domain Layer (`/domain`)
- **Entities**: Core business objects (Media, User, DownloadResult)
- **Interfaces**: Contracts for external dependencies
- **Value Objects**: Immutable domain concepts (MediaUrl, Filename)
- **No external dependencies** - pure business logic

### Application Layer (`/application`)
- **Use Cases**: Application-specific business rules
- **Services**: Orchestration of domain logic
- **DTOs**: Data transfer objects for use cases
- **Depends only on Domain layer**

### Infrastructure Layer (`/infrastructure`)
- **Downloaders**: Concrete implementations of IMediaDownloader
- **Storage**: File system, cloud storage implementations
- **Authentication**: Cookie, session, OAuth handlers
- **HTTP**: Network clients with retry logic
- **External libraries and frameworks**

### Presentation Layer (`/presentation`)
- **CLI**: Command-line interface implementation
- **Config**: Configuration loading and validation
- **Parsers**: Input parsing and validation
- **API**: Future REST/GraphQL endpoints

### Shared Layer (`/shared`)
- **Errors**: Centralized error handling
- **Logging**: Logging infrastructure
- **Utils**: Common utilities
- **Constants**: Application constants

## 🔄 Data Flow

1. **Request** enters through Presentation layer (CLI/API)
2. **Use Case** in Application layer orchestrates the flow
3. **Domain logic** processes business rules
4. **Infrastructure** handles external interactions
5. **Response** returns through Presentation layer

## 🎯 Key Principles

### Single Responsibility Principle (SRP)
Each class has one reason to change:
- `Media` entity only handles media properties
- `DownloadMediaUseCase` only orchestrates downloads
- `BaseDownloader` only provides download infrastructure

### Open/Closed Principle (OCP)
Extend behavior without modifying existing code:
- Add new platforms by implementing `IMediaDownloader`
- Add storage providers by implementing `IFileStorage`
- Add auth methods by implementing `IAuthenticator`

### Dependency Inversion Principle (DIP)
Depend on abstractions, not concretions:
- Use cases depend on interfaces, not implementations
- Infrastructure implements domain interfaces
- Dependency injection for flexibility

## 💉 Dependency Injection

```typescript
// Configure dependencies
const logger = LoggerFactory.getLogger('App');
const storage = new LocalFileStorage(logger);
const instagramDownloader = new InstagramDownloader(logger);

// Create use case with injected dependencies
const downloadUseCase = new DownloadMediaUseCase(
  new Map([['INSTAGRAM', instagramDownloader]]),
  storage,
  logger
);
```

## 🧪 Testing Strategy

### Unit Tests
- Test each layer in isolation
- Mock interfaces for dependencies
- Focus on business logic

### Integration Tests
- Test layer interactions
- Use real implementations
- Verify data flow

### Example Test
```typescript
describe('DownloadMediaUseCase', () => {
  it('should download media successfully', async () => {
    // Arrange
    const mockDownloader = createMock<IMediaDownloader>();
    const mockStorage = createMock<IFileStorage>();
    const useCase = new DownloadMediaUseCase(...);
    
    // Act
    const result = await useCase.execute({ url: '...' });
    
    // Assert
    expect(result.success).toBe(true);
  });
});
```

## 🚀 Adding New Features

### Adding a New Platform (e.g., TikTok)

1. **Create Platform Strategy**
```typescript
// src/infrastructure/downloaders/TikTokDownloader.ts
export class TikTokDownloader extends BaseDownloader {
  canHandle(url: string): boolean {
    return url.includes('tiktok.com');
  }
  // ... implement required methods
}
```

2. **Register in DI Container**
```typescript
downloaders.set('TIKTOK', new TikTokDownloader(logger));
```

3. **Add Platform Enum**
```typescript
// src/domain/entities/Media.ts
export enum Platform {
  // ...
  TIKTOK = 'TIKTOK'
}
```

### Adding New Storage Provider

1. **Implement Interface**
```typescript
// src/infrastructure/storage/S3Storage.ts
export class S3Storage implements IFileStorage {
  async save(path: string, data: Buffer): Promise<DownloadedFile> {
    // S3 upload logic
  }
  // ... implement other methods
}
```

2. **Configure in Application**
```typescript
const storage = config.useS3 ? new S3Storage() : new LocalFileStorage();
```

## 📊 Benefits

- **Testable**: Each component can be tested in isolation
- **Maintainable**: Clear separation of concerns
- **Extensible**: Easy to add new features
- **Flexible**: Switch implementations without changing business logic
- **Scalable**: Architecture supports growth

## 🔗 Dependencies Graph

```
Presentation ──→ Application ──→ Domain
     ↓               ↓            ↑
     └───────→ Infrastructure ────┘
                     ↓
                  External
```

The dependency rule: Source code dependencies only point inward!