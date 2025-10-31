# Contributing to LootAura

**Last updated: 2025-01-31**

Thank you for your interest in contributing to LootAura! This guide will help you get started.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: 20.18.0 or higher
- **npm**: 10.0.0 or higher
- **Git**: Latest version

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/lanternetwork/LootAura.git
   cd LootAura
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env.local
   # Edit .env.local with your configuration
   ```
   
   See [docs/PRODUCTION_ENV.md](docs/PRODUCTION_ENV.md) for all required variables.

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)** in your browser

## 📝 Code Style Guidelines

### TypeScript

- Use **strict TypeScript** with no `any` types
- Prefer **interface** over `type` for object shapes
- Use **explicit return types** for functions
- Follow **camelCase** for variables and functions
- Use **PascalCase** for components and classes

### React Components

- Use **functional components** with hooks
- Prefer **named exports** over default exports when possible
- Use **TypeScript interfaces** for props
- Follow **single responsibility principle**

### File Organization

- Components: `components/`
- Pages/Routes: `app/`
- Utilities: `lib/`
- Tests: `tests/`
- Types: `lib/types.ts`

## 🏗️ Architecture Principles

LootAura uses a **map-centric architecture**:

- **Map-Centric Design**: Map viewport drives all data fetching and list display
- **Single Fetch Path**: Only 2 entry points to `fetchMapSales` (viewport changes, filter changes)
- **Distance-to-Zoom Mapping**: Distance slider controls map zoom instead of API filtering
- **Touch-Only Clustering**: Pins cluster only when they visually overlap (6.5px radius)
- **Viewport Persistence**: Map viewport state preserved across navigation

When making changes, ensure you maintain these principles.

## 🧪 Testing

### Writing Tests

- **Unit Tests**: Test individual functions and utilities
- **Integration Tests**: Test component interactions and data flow
- **E2E Tests**: Test complete user flows with Playwright

### Test Structure

```typescript
import { describe, it, expect } from 'vitest'

describe('Feature Name', () => {
  it('should do something', () => {
    expect(actual).toBe(expected)
  })
})
```

### Supabase Mocking

**Important**: Tests that interact with Supabase **must** use shared mock helpers:

```typescript
// ✅ DO: Use shared mock helper
import { createSupabaseServerClientMock } from '@/tests/utils/mocks/supabaseServerMock'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => createSupabaseServerClientMock({
    // Configure mock behavior
  })
}))

// ❌ DON'T: Create ad-hoc inline mocks
vi.mock('@/lib/supabase/server', () => {
  // Ad-hoc mock implementation...
})
```

See [docs/testing.md](docs/testing.md) for complete testing guidelines.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:ui

# Run E2E tests
npm run test:e2e
```

## 🔍 Code Review Process

1. **Create a branch** from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following code style guidelines

3. **Write tests** for new functionality

4. **Run tests** to ensure everything passes
   ```bash
   npm test
   npm run typecheck
   npm run lint
   ```

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

6. **Push to your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request** on GitHub

### Commit Messages

Follow conventional commits format:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Example: `feat: add touch-only map clustering`

## 📦 Pull Request Guidelines

- **Description**: Clearly describe what changes you made and why
- **Tests**: Ensure all tests pass
- **Type Checking**: Ensure TypeScript type checking passes
- **Linting**: Ensure ESLint passes
- **Documentation**: Update documentation if needed

## 🐛 Reporting Bugs

If you find a bug:

1. Check if it's already reported in issues
2. Create a new issue with:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (browser, OS, etc.)

## 💡 Suggesting Features

If you have a feature suggestion:

1. Check if it's already requested in issues
2. Create a new issue with:
   - Clear description of the feature
   - Use case and motivation
   - Potential implementation approach (if applicable)

## 🔒 Security

If you discover a security vulnerability, please see [SECURITY.md](SECURITY.md) for reporting guidelines.

## 📚 Additional Resources

- [Testing Guide](docs/testing.md)
- [Production Environment Variables](docs/PRODUCTION_ENV.md)
- [Operations Guide](docs/OPERATIONS.md)
- [Image Management](docs/IMAGES.md)

Thank you for contributing to LootAura! 🎉
