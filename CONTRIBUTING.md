# Contributing to LootAura

**Last updated: 2025-01-27 — Map-Centric Architecture**

Thank you for your interest in contributing to LootAura! This guide will help you get started with contributing to our map-centric yard sale discovery platform.

## 🏗️ Architecture Overview

LootAura uses a **map-centric architecture** where the map viewport is the single source of truth for all sales data. Key principles:

- **Single Fetch Path**: Only 2 entry points to `fetchMapSales` (viewport changes, filter changes)
- **Distance-to-Zoom Mapping**: Distance slider controls map zoom instead of API filtering
- **Map-Centric Design**: Map viewport drives all data fetching and list display
- **Single Source**: Both markers and list read from the same data source

See [docs/architecture.md](docs/architecture.md) for detailed technical information.

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

4. **Run the development server**
   ```bash
   npm run dev
   ```

See [docs/dev-setup.md](docs/dev-setup.md) for detailed setup instructions.

## 📝 Code Style Guidelines

### TypeScript

- Use **strict TypeScript** with no `any` types
- Prefer **interface** over `type` for object shapes
- Use **explicit return types** for functions
- Follow **camelCase** for variables and functions
- Use **PascalCase** for components and classes

### React Components

- Use **functional components** with hooks
- Prefer **named exports** over default exports
- Use **TypeScript interfaces** for props
- Follow **single responsibility principle**

### File Organization

```
components/
├── location/          # Map-related components
├── sales/            # Sales list and cards
├── filters/          # Filter components
└── admin/            # Admin tools

lib/
├── pins/             # Pin and clustering logic
├── hooks/            # Custom React hooks
└── types/            # TypeScript type definitions
```

## 🧪 Testing Requirements

### Test Coverage

- **Unit Tests**: All utility functions and hooks
- **Integration Tests**: Component interactions
- **E2E Tests**: Complete user flows

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:ui

# Run E2E tests
npm run test:e2e

# Run linting
npm run lint

# Type checking
npm run typecheck
```

### Test Guidelines

- **Map-Centric Testing**: Test viewport changes trigger correct API calls
- **Single Fetch Path**: Verify only 2 entry points to `fetchMapSales`
- **Distance-to-Zoom**: Test distance slider changes map zoom
- **Console Discipline**: No unexpected `console.error` or `console.warn`

See [docs/testing.md](docs/testing.md) for detailed testing guidelines.

## 🔄 Pull Request Process

### Before Submitting

1. **Check existing issues** and pull requests
2. **Create an issue** for significant changes
3. **Fork the repository** and create a feature branch
4. **Follow code style** guidelines
5. **Write tests** for new functionality
6. **Update documentation** as needed

### Pull Request Guidelines

- **Clear title** describing the change
- **Detailed description** of what was changed and why
- **Reference issues** using `Fixes #123` or `Closes #123`
- **Screenshots** for UI changes
- **Test results** showing all tests pass

### Review Process

- **Automated checks** must pass (linting, tests, type checking)
- **Code review** by maintainers
- **Architecture compliance** with map-centric principles
- **Performance impact** assessment

## 🏗️ Map-Centric Architecture Guidelines

### Data Fetching

- **Single Entry Points**: Only use `handleViewportChange` and `handleFiltersChange`
- **No Direct API Calls**: Never call `fetchMapSales` directly
- **Viewport-Driven**: All data fetching should be driven by map viewport

### Distance Handling

- **Zoom-Based**: Distance slider controls map zoom, not API filtering
- **Mapping Function**: Use `distanceToZoom()` for distance-to-zoom conversion
- **No Server Filtering**: Distance filtering is handled by map zoom level

### State Management

- **Map State**: `mapView` is the single source of truth
- **Sales State**: `mapSales` and `visibleSales` derived from map viewport
- **Filter State**: Filters update URL and trigger appropriate fetches

### Component Guidelines

- **SimpleMap**: Use for all map rendering with `pins` prop
- **LocationPin**: Use for individual sale pins
- **FiltersBar**: Use for all filter controls
- **SalesList**: Use for sales list display

## 🐛 Debugging

### Debug Mode

Enable debug mode for development:

```bash
NEXT_PUBLIC_DEBUG=true
```

### Debug Tools

- **Admin Tools**: Access at `/admin/tools`
- **Console Logging**: Comprehensive logging when debug mode enabled
- **Diagnostic Overlay**: Real-time fetch event monitoring

See [docs/debug-guide.md](docs/debug-guide.md) for detailed debugging information.

## 📚 Documentation

### Required Documentation

- **README updates** for significant changes
- **API documentation** for new endpoints
- **Architecture updates** for structural changes
- **Changelog entries** for releases

### Documentation Standards

- **Markdown format** with clear headings
- **Code examples** for complex functionality
- **Links** to related documentation
- **Version metadata** with last updated date

## 🚨 Common Pitfalls

### Architecture Violations

- **Don't** create additional entry points to `fetchMapSales`
- **Don't** bypass the map-centric data flow
- **Don't** use distance parameters in API calls
- **Don't** create competing data sources

### Performance Issues

- **Don't** make excessive API calls
- **Don't** skip debouncing for viewport changes
- **Don't** ignore the single fetch path principle
- **Don't** create memory leaks in components

### Testing Issues

- **Don't** skip tests for new functionality
- **Don't** ignore console guardrail failures
- **Don't** create flaky tests
- **Don't** test implementation details

## 🤝 Community Guidelines

### Code of Conduct

- **Be respectful** and inclusive
- **Be constructive** in feedback
- **Be patient** with newcomers
- **Be collaborative** in discussions

### Getting Help

- **GitHub Issues**: For bugs and feature requests
- **Discussions**: For questions and general discussion
- **Documentation**: Check existing docs first
- **Debug Guide**: Use debug tools for troubleshooting

## 📞 Contact

- **Maintainers**: @lanternetwork
- **Issues**: [GitHub Issues](https://github.com/lanternetwork/LootAura/issues)
- **Discussions**: [GitHub Discussions](https://github.com/lanternetwork/LootAura/discussions)

Thank you for contributing to LootAura! 🎉
