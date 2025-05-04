import * as vscode from 'vscode';
import { AIModelRouter, WorkspaceContext } from './aiModelRouter';
import * as path from 'path';
import * as fs from 'fs';

export class MCPServer {
    private router: AIModelRouter;
    private contextCache: Map<string, WorkspaceContext>;

    constructor() {
        this.router = new AIModelRouter();
        this.contextCache = new Map();
    }

    async analyzeWorkspace(workspaceUri: vscode.Uri): Promise<any> {
        const startTime = performance.now();
        const workspaceKey = workspaceUri.toString();

        try {
            // Check cache first to improve performance
            const cachedContext = this.contextCache.get(workspaceKey);
            if (cachedContext && this.isCacheValid(cachedContext)) {
                vscode.window.showInformationMessage('Using cached workspace analysis...');
                return await this.router.routeRequest(cachedContext);
            }

            // Progress notification
            const progressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing Workspace',
                cancellable: true
            };

            return await vscode.window.withProgress(progressOptions, async (progress, token) => {
                if (token.isCancellationRequested) {
                    return null;
                }

                progress.report({ increment: 10, message: 'Scanning workspace...' });
                const files = await this.scanWorkspace(workspaceUri);

                progress.report({ increment: 40, message: 'Building context...' });
                const context = await this.buildContext(workspaceUri);
                
                // Enhanced caching with timestamp
                context.analysisTimestamp = Date.now();
                this.contextCache.set(workspaceKey, context);
                
                progress.report({ increment: 40, message: 'Routing AI request...' });
                const result = await this.router.routeRequest(context);

                const endTime = performance.now();
                console.log(`Workspace analysis completed in ${endTime - startTime}ms`);

                return result;
            });
        } catch (error: any) {
            // Advanced error logging
            console.error('Workspace Analysis Error:', {
                message: error.message,
                stack: error.stack,
                workspaceUri: workspaceKey
            });

            // Provide more detailed error feedback
            vscode.window.showErrorMessage(
                `Workspace Analysis Failed: ${error.message}. 
                Check console for detailed error information.`,
                'View Logs'
            ).then(selection => {
                if (selection === 'View Logs') {
                    vscode.commands.executeCommand('workbench.action.toggleDevTools');
                }
            });

            throw error;
        }
    }

    // New method to validate cache
    private isCacheValid(context: WorkspaceContext, maxAgeMinutes: number = 30): boolean {
        if (!context.analysisTimestamp) return false;
        const cacheAgeMinutes = (Date.now() - context.analysisTimestamp) / (1000 * 60);
        return cacheAgeMinutes < maxAgeMinutes;
    }

    async analyzeFile(fileUri: vscode.Uri): Promise<any> {
        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            const content = document.getText();
            const fileName = path.basename(fileUri.fsPath);
            const extension = path.extname(fileUri.fsPath);
            
            // Build context for the file
            const context: WorkspaceContext = {
                files: [fileUri.fsPath],
                language: new Map([[extension, 1]]),
                dependencies: {},
                projectType: '',
                fileContents: new Map([[fileUri.fsPath, content]]),
                folderStructure: {},
                symbols: new Map(),
                references: new Map(),
                imports: new Map()
            };
            
            // Extract symbols and references
            const symbols = await this.extractFileSymbols(document);
            if (symbols.length > 0) {
                context.symbols?.set(fileUri.fsPath, symbols);
            }
            
            const references = await this.findReferences(document);
            if (references.length > 0) {
                context.references?.set(fileUri.fsPath, references);
            }
            
            // Extract imports
            context.imports?.set(fileUri.fsPath, this.extractImports(content, extension));
            
            // Route to the appropriate AI model
            return await this.router.routeRequest(context);
        } catch (error: any) {
            throw new Error(`File analysis failed: ${error.message}`);
        }
    }

    async analyzeSelection(
        selectedText: string, 
        document: vscode.TextDocument, 
        selection: vscode.Selection,
        modelType?: string
    ): Promise<any> {
        try {
            const fileUri = document.uri;
            const fileName = path.basename(fileUri.fsPath);
            const extension = path.extname(fileUri.fsPath);
            const content = document.getText();
            
            // Build context for the selection
            const context: WorkspaceContext = {
                files: [fileUri.fsPath],
                language: new Map([[extension, 1]]),
                dependencies: {},
                projectType: '',
                fileContents: new Map([[fileUri.fsPath, content]]),
                folderStructure: {},
                symbols: new Map(),
                references: new Map(),
                imports: new Map(),
                selectionMetadata: {
                    selectedText,
                    fileName,
                    language: document.languageId,
                    startLine: selection.start.line,
                    endLine: selection.end.line,
                    startCharacter: selection.start.character,
                    endCharacter: selection.end.character,
                    surroundingText: this.getSurroundingText(document, selection),
                    containingSymbol: await this.findContainingSymbol(document, selection)
                }
            };
            
            // Extract symbols and imports for better context
            const symbols = await this.extractFileSymbols(document);
            if (symbols.length > 0) {
                context.symbols?.set(fileUri.fsPath, symbols);
            }
            
            // Extract imports
            context.imports?.set(fileUri.fsPath, this.extractImports(content, extension));
            
            // Route to the appropriate AI model (or use specified model)
            if (modelType && this.router.getAvailableModelTypes().includes(modelType)) {
                return await this.router.routeRequestToModel(context, modelType);
            } else {
                return await this.router.routeRequest(context);
            }
        } catch (error: any) {
            throw new Error(`Selection analysis failed: ${error.message}`);
        }
    }

    async updateFileInContext(document: vscode.TextDocument) {
        const fileUri = document.uri;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
        
        if (!workspaceFolder) {
            return;
        }
        
        const workspaceKey = workspaceFolder.uri.toString();
        const cachedContext = this.contextCache.get(workspaceKey);
        
        if (!cachedContext) {
            return;
        }
        
        // Update the file content in the cached context
        const content = document.getText();
        cachedContext.fileContents.set(fileUri.fsPath, content);
        
        // Update symbols and imports
        const symbols = await this.extractFileSymbols(document);
        if (symbols.length > 0) {
            cachedContext.symbols?.set(fileUri.fsPath, symbols);
        }
        
        const extension = path.extname(fileUri.fsPath);
        const imports = this.extractImports(content, extension);
        cachedContext.imports?.set(fileUri.fsPath, imports);
        
        // Update references
        const references = await this.findReferences(document);
        if (references.length > 0) {
            cachedContext.references?.set(fileUri.fsPath, references);
        }
        
        // Update semantic relationships if they exist
        if (cachedContext.semanticRelationships) {
            this.buildSemanticRelationships(cachedContext);
        }
        
        // Update the cache
        this.contextCache.set(workspaceKey, cachedContext);
    }

    getAvailableModelTypes(): string[] {
        return this.router.getAvailableModelTypes();
    }

    private async scanWorkspace(uri: vscode.Uri): Promise<vscode.Uri[]> {
        const pattern = new vscode.RelativePattern(uri, '**/*');
        const excludePattern = '{**/node_modules/**,**/dist/**,**/build/**,**/.git/**}';
        const files = await vscode.workspace.findFiles(pattern, excludePattern);
        return files;
    }

    private async buildContext(uri: vscode.Uri): Promise<WorkspaceContext> {
        // Scan the workspace for files
        const files = await this.scanWorkspace(uri);
        
        // Initialize context
        const context: WorkspaceContext = {
            files: files.map(f => f.fsPath),
            language: new Map<string, number>(),
            dependencies: {},
            projectType: '',
            fileContents: new Map<string, string>(),
            folderStructure: {},
            symbols: new Map<string, any[]>(),
            references: new Map<string, any[]>(),
            imports: new Map<string, any[]>()
        };
        
        // First pass: gather file contents, language stats, and imports
        for (const file of files) {
            try {
                const filePath = file.fsPath;
                const extension = path.extname(filePath);
                
                // Update language stats
                const count = context.language.get(extension) || 0;
                context.language.set(extension, count + 1);
                
                // Read file content
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const content = document.getText();
                    context.fileContents.set(filePath, content);
                    
                    // Special handling for package.json
                    if (filePath.endsWith('package.json')) {
                        try {
                            const packageJson = JSON.parse(content);
                            context.dependencies = { 
                                ...packageJson.dependencies || {}, 
                                ...packageJson.devDependencies || {} 
                            };
                            context.projectType = this.determineProjectType(packageJson);
                        } catch (e) {
                            console.error('Error parsing package.json:', e);
                        }
                    }
                    
                    // Extract imports for this file
                    if (context.imports) {
                        context.imports.set(filePath, this.extractImports(content, extension));
                    }
                    
                } catch (error) {
                    console.error(`Error processing file ${filePath}:`, error);
                }
            } catch (error) {
                console.error(`Error processing file ${file.fsPath}:`, error);
            }
        }

        // Second pass: extract symbols and references
        for (const file of files) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                
                // Extract symbols (classes, functions, etc.)
                const symbols = await this.extractFileSymbols(document);
                if (symbols.length > 0 && context.symbols) {
                    context.symbols.set(file.fsPath, symbols);
                }
                
                // Find references to other files/symbols
                const references = await this.findReferences(document);
                if (references.length > 0 && context.references) {
                    context.references.set(file.fsPath, references);
                }
            } catch (error) {
                console.error(`Error extracting symbols from ${file.fsPath}:`, error);
            }
        }
        
        // Build semantic relationships between files
        this.buildSemanticRelationships(context);
        
        // Cache the context for future use
        const workspaceKey = uri.toString();
        this.contextCache.set(workspaceKey, context);
        
        return context;
    }

    public async extractFileSymbols(document: vscode.TextDocument): Promise<any[]> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            ) || [];
            
            return this.flattenSymbols(symbols);
        } catch (error: any) {
            console.error('Error extracting symbols:', error);
            return [];
        }
    }
    
    private flattenSymbols(symbols: vscode.DocumentSymbol[], parent: string = '') {
        let result: any[] = [];
        
        for (const symbol of symbols) {
            const fullName = parent ? `${parent}.${symbol.name}` : symbol.name;
            const flatSymbol = {
                name: symbol.name,
                fullName,
                kind: symbol.kind,
                range: {
                    start: symbol.range.start,
                    end: symbol.range.end
                },
                detail: symbol.detail
            };
            
            result.push(flatSymbol);
            
            if (symbol.children && symbol.children.length > 0) {
                result = result.concat(this.flattenSymbols(symbol.children, fullName));
            }
        }
        
        return result;
    }
    
    private async findReferences(document: vscode.TextDocument): Promise<any[]> {
        const references: any[] = [];
        try {
            // This is a simplified approach. In a real implementation,
            // you would need to iterate through symbols and find references for each
            const text = document.getText();
            const importMatches = text.match(/import\s+.*?from\s+['"](.+?)['"]/g) || [];
            
            for (const match of importMatches) {
                const importPath = match.match(/from\s+['"](.+?)['"]/)?.[1];
                if (importPath) {
                    references.push({
                        type: 'import',
                        path: importPath
                    });
                }
            }
            
            return references;
        } catch (error: any) {
            console.error('Error finding references:', error);
            return references;
        }
    }
    
    private extractImports(content: string, extension: string) {
        const imports: any[] = [];
        
        try {
            if (['.js', '.ts', '.jsx', '.tsx'].includes(extension)) {
                // JavaScript/TypeScript imports
                const importRegex = /import\s+(?:{([^}]+)}|([^{}\s;]+))\s+from\s+['"]([^'"]+)['"]/g;
                let match;
                
                while ((match = importRegex.exec(content)) !== null) {
                    const namedImports = match[1] ? match[1].split(',').map(s => s.trim()) : [];
                    const defaultImport = match[2] ? match[2].trim() : null;
                    const source = match[3];
                    
                    imports.push({
                        source,
                        defaultImport,
                        namedImports
                    });
                }
            } else if (extension === '.py') {
                // Python imports
                const importRegex = /(?:from\s+([^\s]+)\s+)?import\s+([^;\n]+)/g;
                let match;
                
                while ((match = importRegex.exec(content)) !== null) {
                    const fromModule = match[1] || null;
                    const importedItems = match[2].split(',').map(s => s.trim());
                    
                    imports.push({
                        fromModule,
                        importedItems
                    });
                }
            }
        } catch (error: any) {
            console.error('Error extracting imports:', error);
        }
        
        return imports;
    }
    
    private buildSemanticRelationships(context: WorkspaceContext) {
        // Initialize semantic relationships map if it doesn't exist
        if (!context.semanticRelationships) {
            context.semanticRelationships = new Map();
        }
        
        // Analyze imports to build relationships
        if (context.imports) {
            context.imports.forEach((imports, filePath) => {
                const relationships: string[] = [];
                
                imports.forEach(importPath => {
                    // Handle relative imports
                    if (importPath.startsWith('.')) {
                        const resolved = path.resolve(path.dirname(filePath), importPath);
                        
                        // Find the matching file in our context
                        const matchingFile = context.files.find(f => 
                            f === resolved || 
                            f === resolved + '.js' || 
                            f === resolved + '.ts' || 
                            f === resolved + '.jsx' || 
                            f === resolved + '.tsx'
                        );
                        
                        if (matchingFile) {
                            relationships.push(matchingFile);
                        }
                    }
                });
                
                if (relationships.length > 0 && context.semanticRelationships) {
                    context.semanticRelationships.set(filePath, relationships);
                }
            });
        }
    }

    private addToFolderStructure(structure: any, pathParts: string[], content: string) {
        let current = structure;
        pathParts.forEach((part, index) => {
            if (!current[part]) {
                if (index === pathParts.length - 1) {
                    // It's a file
                    current[part] = {
                        type: 'file',
                        size: content.length,
                        extension: path.extname(part),
                        lastModified: fs.existsSync(path.join(...pathParts.slice(0, index + 1))) ? 
                            fs.statSync(path.join(...pathParts.slice(0, index + 1))).mtime : null
                    };
                } else {
                    // It's a directory
                    current[part] = {};
                }
            }
            
            if (index < pathParts.length - 1) {
                current = current[part];
            }
        });
    }

    private determineProjectType(packageJson: any): string {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        // Check for VS Code extension
        if (deps['@types/vscode'] || packageJson.engines?.vscode) return 'vscode-extension';
        
        // Check for web frameworks
        if (deps['next']) return 'next-js';
        if (deps['react']) return 'react';
        if (deps['vue']) return 'vue';
        if (deps['angular'] || deps['@angular/core']) return 'angular';
        
        // Check for backend frameworks
        if (deps['express']) return 'node-express';
        if (deps['koa']) return 'node-koa';
        if (deps['fastify']) return 'node-fastify';
        if (deps['nestjs'] || deps['@nestjs/core']) return 'nestjs';
        if (deps['django']) return 'django';
        if (deps['flask']) return 'flask';
        
        // Check for mobile
        if (deps['react-native']) return 'react-native';
        if (deps['ionic']) return 'ionic';
        
        // Check for desktop
        if (deps['electron']) return 'electron';
        
        return packageJson.name || 'unknown';
    }

    private detectFileType(filePath: string, content: string): string {
        const extension = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath).toLowerCase();

        if (fileName === 'package.json') return 'npm-package';
        if (fileName === 'tsconfig.json') return 'typescript-config';
        if (fileName === 'webpack.config.js') return 'webpack-config';
        if (fileName.includes('dockerfile')) return 'docker';
        
        if (extension === '.ts' || extension === '.js') {
            if (content.includes('vscode')) return 'vscode-extension';
            if (content.includes('react')) return 'react';
            if (content.includes('vue')) return 'vue';
            if (content.includes('angular')) return 'angular';
            if (content.includes('express')) return 'node-express';
        }
        
        if (extension === '.py') {
            if (content.includes('django')) return 'django';
            if (content.includes('flask')) return 'flask';
        }
        
        if (extension === '.md') return 'documentation';
        if (extension === '.json') return 'json-data';
        if (extension === '.css' || extension === '.scss' || extension === '.less') return 'styles';
        if (extension === '.html') return 'html';
        if (fileName.includes('test') || fileName.includes('spec')) return 'test';
        
        return 'unknown';
    }

    async findContainingSymbol(document: vscode.TextDocument, selection: vscode.Selection): Promise<any | undefined> {
        try {
            const symbols = await this.extractFileSymbols(document);
            
            // Find the symbol that contains the selection
            return symbols.find(symbol => {
                const symbolRange = new vscode.Range(
                    new vscode.Position(symbol.range.start.line, symbol.range.start.character),
                    new vscode.Position(symbol.range.end.line, symbol.range.end.character)
                );
                
                return symbolRange.contains(selection);
            });
        } catch (error) {
            console.error('Error finding containing symbol:', error);
            return undefined;
        }
    }
    
    getSurroundingText(document: vscode.TextDocument, selection: vscode.Selection, contextLines: number = 5): string {
        const startLine = Math.max(0, selection.start.line - contextLines);
        const endLine = Math.min(document.lineCount - 1, selection.end.line + contextLines);
        
        let surroundingText = '';
        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i);
            surroundingText += line.text + '\n';
        }
        
        return surroundingText;
    }
}
