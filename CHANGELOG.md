# Changelog

All notable changes to the VS Code AI Code Companion extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2025-05-08

### Added
- Enhanced `getRelevantFiles` method with improved file selection logic
  - Added sophisticated file importance scoring system
  - Added special handling for different analysis types (code, test, docs, security)
  - Implemented file relationship detection for related test/implementation files

- Enhanced `extractSuggestions` method with better structure
  - Added support for extracting markdown-style sections
  - Implemented categorization of suggestions by type
  - Added priority scoring for different suggestion types
  - Improved extraction of code blocks and lists

- Updated `buildPromptForContext` method
  - Added more detailed prompting for different analysis types
  - Improved context inclusion for better AI responses
  - Added specialized instructions by analysis type

- Improved test environment setup
  - Added VS Code API mocking for better test reliability
  - Configured Jest to properly handle VS Code API mocking
  - Added more comprehensive test cases for new features

### Fixed
- Fixed test environment issues
  - Resolved type errors in test files
  - Improved Jest configuration for proper VS Code API mocking
  - Fixed module import issues in test files

### Changed
- Updated project dependencies
- Improved error handling in Copilot integration
- Enhanced documentation with more detailed examples

## [0.2.0] - 2025-04-15

### Added
- Initial release of VS Code AI Code Companion with MCP server
- Implemented AI model router for intelligent model selection
- Added support for multiple AI models (Claude, Gemini, ChatGPT)
- Basic integration with GitHub Copilot
- Workspace context analyzer for better code understanding
- Support for multiple programming languages

### Features
- Multi-language code analysis
- Intelligent AI model routing
- Workspace-wide context analysis
- Inline AI assistance
- AI model coordination
