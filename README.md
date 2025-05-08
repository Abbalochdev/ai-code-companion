# 🚀 VS Code AI Code Companion

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com/abbalochdev/ai-code-companion)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.87.0+-blueviolet.svg)](https://code.visualstudio.com/updates/)

## 🌟 Project Overview

The AI Code Companion is an intelligent VS Code extension that revolutionizes software development through advanced AI-powered assistance. Designed to enhance developer productivity and code quality across various programming tasks.

## 🤖 Core Capabilities

### Intelligent Model Routing
Our extension implements a sophisticated AI model routing system that:
- Dynamically selects the most appropriate AI model
- Provides context-aware code analysis
- Supports multiple specialized AI models

### Workspace Context Analysis
- Comprehensive workspace scanning
- Detailed context building
- Performance-optimized caching mechanism

## 🚀 Key Features

### 1. Intelligent Code Analysis
- Multi-language support (TypeScript, JavaScript, Python, Java, and more)
- Deep contextual code understanding
- Intelligent pattern recognition

### 2. AI Model Coordination
- Claude: Advanced code generation and complex analysis
- Gemini: Architectural insights and documentation
- ChatGPT: General problem-solving

### 3. Developer Productivity Tools
- Workspace-wide code analysis
- Inline AI assistance via CodeLens
- Configurable AI model preferences


### AI Model Router
```typescript
class AIModelRouter {
  async routeRequest(context: WorkspaceContext): ModelRoutingResult {
    // Intelligent model selection logic
    const selectedModel = this.selectBestModel(context);
    return selectedModel.process(context);
  }
}
```

### Supported Languages
- TypeScript
- JavaScript
- Python
- Rust
- Go
- More coming soon!

## 🔒 Privacy & Security

- No code is stored or transmitted without explicit consent
- Anonymous, opt-in telemetry for continuous improvement
- Local-first processing prioritizing developer privacy

## 🤝 Contributing

We welcome contributions! Check our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

## 🌟 Star Our Project

If you find this extension helpful, please give us a star on GitHub!



## 🛠 Installation

### Prerequisites
- Visual Studio Code (v1.80.0 or later)
- Node.js (v16.0.0 or later)
- npm (v8.0.0 or later)

### Install from VS Code Marketplace
1. Open Visual Studio Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "AI Code Companion"
4. Click "Install"
coming soon

### Manual Installation
### Method 2: Manual Installation
```bash
git clone [https://github.com/abbalochdev/ai-code-companion.git](https://github.com/abbalochdev/ai-code-companion.git)
cd ai-code-companion
1. npm install
2. npm run compile
3. click F5 or Run and Debug (Ctrl+Shift+D)
4. Select "Extension Development Host"
5. it start a new window of vscode with the extension installed
