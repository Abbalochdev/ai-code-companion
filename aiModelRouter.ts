import * as path from 'path';

interface AIModel {
    name: string;
    specialty: string[];
    process: (context: any) => Promise<any>;
    confidence: (context: any) => number;
    analysisType: string;
}

export interface WorkspaceContext {
    files: string[];
    language: Map<string, number>;
    dependencies: Record<string, string>;
    projectType: string;
    fileContents: Map<string, string>;
    folderStructure: Record<string, any>;
    symbols?: Map<string, any[]>;
    references?: Map<string, any[]>;
    imports?: Map<string, any[]>;
    semanticRelationships?: Map<string, string[]>;
    workspaceContext?: WorkspaceContext;
    selectionMetadata?: any;
    analysisTimestamp?: number;
    securityScan?: {
        vulnerabilities: any[];
        score: number;
        lastScanDate?: string;
    };
}

export class AIModelRouter {
    private models: Map<string, AIModel>;
    private lastUsedModel: string | null = null;
    private defaultModel = 'code';

    constructor() {
        this.models = new Map([
            ['code', {
                name: 'Claude',
                specialty: ['code-analysis', 'code-generation', 'refactoring', 'debugging'],
                confidence: (context: WorkspaceContext) => {
                    // Higher confidence for code-heavy contexts
                    const codeFiles = Array.from(context.language.entries())
                        .filter(([ext]) => ['.ts', '.js', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php'].includes(ext))
                        .reduce((sum, [, count]) => sum + count, 0);
                    
                    // Check if we have symbols (indicates code structure)
                    const hasSymbols = context.symbols && context.symbols.size > 0;
                    
                    // Check if we're dealing with a complex codebase
                    const hasImports = context.imports && context.imports.size > 0;
                    
                    // Base confidence on code files + bonus for structure
                    return Math.min(0.95, (codeFiles > 0 ? 0.7 : 0.3) + (hasSymbols ? 0.15 : 0) + (hasImports ? 0.1 : 0));
                },
                process: async (context: WorkspaceContext) => {
                    // Using integrated VS Code Copilot for code analysis
                    const result = await this.processWithCopilot(context, 'code');
                    
                    // Enhance the result with code structure information
                    if (context.symbols && context.symbols.size > 0) {
                        result.codeStructure = this.summarizeCodeStructure(context);
                    }
                    
                    if (context.semanticRelationships && context.semanticRelationships.size > 0) {
                        result.dependencies = this.summarizeDependencies(context);
                    }
                    
                    return {
                        type: 'code-analysis',
                        suggestions: result
                    };
                },
                analysisType: 'code-analysis'
            }],
            ['testing', {
                name: 'ChatGPT',
                specialty: ['testing', 'quality-assurance', 'test-generation', 'test-coverage'],
                confidence: (context: WorkspaceContext) => {
                    // Higher confidence for test files
                    const testFiles = Array.from(context.fileContents.keys())
                        .filter(file => file.includes('test') || file.includes('spec')).length;
                    
                    // Check if we have test frameworks in dependencies
                    const hasTestDeps = Object.keys(context.dependencies || {})
                        .some(dep => ['jest', 'mocha', 'jasmine', 'karma', 'pytest', 'unittest', 'cypress', 'selenium'].includes(dep));
                    
                    return Math.min(0.95, (testFiles > 0 ? 0.7 : 0.4) + (hasTestDeps ? 0.2 : 0));
                },
                process: async (context: WorkspaceContext) => {
                    // Using integrated VS Code Copilot for test analysis
                    const result = await this.processWithCopilot(context, 'test');
                    
                    // Enhance with test-specific insights
                    result.testCoverage = this.analyzeTestCoverage(context);
                    
                    return {
                        type: 'test-analysis',
                        suggestions: result
                    };
                },
                analysisType: 'test-analysis'
            }],
            ['documentation', {
                name: 'Gemini',
                specialty: ['documentation', 'explanation', 'readme-generation', 'api-docs'],
                confidence: (context: WorkspaceContext) => {
                    // Higher confidence for documentation files
                    const docFiles = Array.from(context.fileContents.keys())
                        .filter(file => file.endsWith('.md') || file.endsWith('.txt') || 
                                        file.includes('README') || file.includes('CONTRIBUTING') || 
                                        file.includes('docs/')).length;
                    
                    // Check if we're dealing with API documentation
                    const hasApiDocs = Array.from(context.fileContents.values())
                        .some(content => content.includes('@api') || content.includes('* @param') || 
                                         content.includes('/**') || content.includes('///'));
                    
                    return Math.min(0.95, (docFiles > 0 ? 0.7 : 0.5) + (hasApiDocs ? 0.2 : 0));
                },
                process: async (context: WorkspaceContext) => {
                    // Using integrated VS Code Copilot for documentation
                    const result = await this.processWithCopilot(context, 'docs');
                    
                    // Enhance with documentation-specific insights
                    result.docQuality = this.analyzeDocumentationQuality(context);
                    result.missingDocs = this.findMissingDocumentation(context);
                    
                    return {
                        type: 'documentation-analysis',
                        suggestions: result
                    };
                },
                analysisType: 'documentation-analysis'
            }],
            ['security', {
                name: 'Anthropic Claude',
                specialty: ['security-analysis', 'vulnerability-detection', 'risk-assessment', 'compliance'],
                confidence: (context: WorkspaceContext) => {
                    // Higher confidence for security-critical contexts
                    // Check for security-sensitive files
                    const securityFiles = Array.from(context.fileContents.keys())
                        .filter(file => 
                            file.includes('auth') || 
                            file.includes('security') || 
                            file.includes('crypto') ||
                            file.includes('password') ||
                            file.includes('login') ||
                            file.endsWith('.env')
                        ).length;
                    
                    // Check for security-related dependencies
                    const hasSecurityDeps = Object.keys(context.dependencies || {})
                        .some(dep => 
                            ['bcrypt', 'crypto', 'jsonwebtoken', 'passport', 'helmet', 'ssl', 'auth0'].includes(dep.toLowerCase())
                        );
                    
                    // Check for security-sensitive code patterns
                    const securityPatterns = Array.from(context.fileContents.values())
                        .some(content => 
                            content.includes('password') ||
                            content.includes('token') ||
                            content.includes('secret') ||
                            content.includes('encrypt') ||
                            content.includes('decrypt')
                        );
                    
                    return Math.min(0.95, 
                        0.5 + 
                        (securityFiles > 0 ? 0.2 : 0) + 
                        (hasSecurityDeps ? 0.15 : 0) + 
                        (securityPatterns ? 0.1 : 0)
                    );
                },
                process: async (context: WorkspaceContext) => {
                    // Using integrated VS Code Copilot for security analysis
                    const result = await this.processWithCopilot(context, 'security');
                    
                    // Perform security scan
                    result.securityAnalysis = await this.performSecurityScan(context);
                    
                    return {
                        type: 'security-analysis',
                        suggestions: result
                    };
                },
                analysisType: 'security-analysis'
            }]
        ]);
    }

    async routeRequest(context: WorkspaceContext): Promise<any> {
        // Determine the best model to use based on context
        const modelType = this.determineModelType(context);
        return this.routeRequestToModel(context, modelType);
    }

    async routeRequestToModel(context: WorkspaceContext, modelType: string): Promise<any> {
        // Get the appropriate model
        const model = this.models.get(modelType) || this.models.get(this.defaultModel);
        if (!model) {
            throw new Error('No model available for analysis');
        }

        // Calculate confidence score based on context complexity
        const confidenceScore = this.calculateConfidenceScore(context, modelType);
        
        try {
            // Prepare the context for the model
            const preparedContext = this.prepareContextForModel(context);
            
            // Call the model with the prepared context
            const result = await this.callModel(model, preparedContext);
            
            // Process the results
            const processedResult = this.processResults(result);
            
            // Add metadata to the result
            return {
                modelUsed: model.name,
                modelType: modelType,
                confidenceScore: confidenceScore.toFixed(2),
                analysisType: model.analysisType,
                results: processedResult,
                summary: this.generateSummary(processedResult),
                selectionMetadata: (context as any).selectionMetadata
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Model analysis failed: ${errorMessage}`);
        }
    }

    private determineModelType(context: WorkspaceContext): string {
        // If this is a selection analysis with selection metadata
        if ((context as any).selectionMetadata) {
            const metadata = (context as any).selectionMetadata;
            
            // Check if it's a test file
            if (metadata.fileName.includes('test') || 
                metadata.fileName.includes('spec') ||
                metadata.containingSymbol?.name.includes('test') ||
                metadata.containingSymbol?.name.includes('Test')) {
                return 'testing';
            }
            
            // Check if it's documentation
            if (metadata.language === 'markdown' || 
                metadata.fileName.endsWith('.md') ||
                metadata.selectedText.includes('/**') ||
                metadata.selectedText.includes('///')) {
                return 'documentation';
            }
            
            // Check if it's debugging-related
            if (metadata.selectedText.includes('console.log') ||
                metadata.selectedText.includes('debugger') ||
                metadata.selectedText.includes('catch') ||
                metadata.selectedText.includes('error') ||
                metadata.selectedText.includes('exception')) {
                return 'debugging';
            }
            
            // Default to code analysis for selections
            return 'code';
        }
        
        // For non-selection analysis, determine based on file types
        let bestModel = this.defaultModel;
        let highestConfidence = 0;
        
        // Check confidence scores for each model
        for (const [modelType, model] of this.models.entries()) {
            const confidence = model.confidence(context);
            if (confidence > highestConfidence) {
                highestConfidence = confidence;
                bestModel = modelType;
            }
        }
        
        // Remember the model we used
        this.lastUsedModel = bestModel;
        return bestModel;
    }

    // Get available model types for UI display
    getAvailableModelTypes(): string[] {
        return Array.from(this.models.keys());
    }    private copilotIntegration: any; // Will be initialized on first use

    async processWithCopilot(context: WorkspaceContext, analysisType: string): Promise<any> {
        // Lazy-load the Copilot integration to avoid circular dependencies
        if (!this.copilotIntegration) {
            try {
                const CopilotIntegration = require('./src/copilotIntegration').CopilotIntegration;
                this.copilotIntegration = new CopilotIntegration();
            } catch (error) {
                console.error('Error loading Copilot integration:', error);
                // Fall back to simulation mode if module cannot be loaded
                return this.simulateCopilotResponse(context, analysisType);
            }
        }
        
        console.log(`Processing with Copilot for ${analysisType} analysis`);
        
        try {
            // Use the Copilot integration module
            return await this.copilotIntegration.processWithCopilot(context, analysisType);
        } catch (error) {
            console.error('Error using Copilot integration:', error);
            // Fall back to simulation on error
            return this.simulateCopilotResponse(context, analysisType);
        }
    }
    
    /**
     * Fallback simulation of Copilot response
     */
    private simulateCopilotResponse(context: WorkspaceContext, analysisType: string): any {
        console.log(`Simulating Copilot ${analysisType} analysis (fallback mode)`);
        
        // Create a response based on the context and analysis type
        let response: any = {
            content: `Analysis of ${context.files.length} files completed.`,
            suggestions: []
        };
        
        // Add different suggestions based on analysis type
        if (analysisType === 'code') {
            response.suggestions = [
                'Consider refactoring duplicate code into shared functions',
                'Add type annotations to improve code clarity',
                'Implement error handling for edge cases',
                'Use dependency injection for better testability'
            ];
        } else if (analysisType === 'test') {
            response.suggestions = [
                'Increase test coverage for critical components',
                'Add integration tests for key workflows',
                'Consider implementing property-based testing',
                'Mock external dependencies for unit tests'
            ];
        } else if (analysisType === 'docs') {
            response.suggestions = [
                'Add examples to complex function documentation',
                'Update README with installation instructions',
                'Document public API endpoints',
                'Create API reference documentation'
            ];
        } else if (analysisType === 'security') {
            response.suggestions = [
                'Review authentication implementation for security vulnerabilities',
                'Ensure all user inputs are properly validated',
                'Update dependencies with known security issues',
                'Implement CSRF protection for forms'
            ];
        }
        
        return response;
    }
    
    /**
     * Summarize code structure from workspace context
     */
    private summarizeCodeStructure(context: WorkspaceContext): any {
        // Initialize code structure summary
        const codeStructure = {
            fileCount: context.files.length,
            languages: {} as Record<string, number>,
            symbolCounts: {} as Record<string, number>,
            dependencies: [] as string[],
            complexity: 'low' as 'low' | 'medium' | 'high'
        };
        
        // Summarize language distribution
        if (context.language) {
            context.language.forEach((count, ext) => {
                codeStructure.languages[ext] = count;
            });
        }
        
        // Count symbols by type
        if (context.symbols && context.symbols.size > 0) {
            // Gather all symbols from all files
            let allSymbols: any[] = [];
            context.symbols.forEach((fileSymbols) => {
                allSymbols = allSymbols.concat(fileSymbols);
            });
            
            // Count by symbol kind
            allSymbols.forEach(symbol => {
                const kind = typeof symbol.kind === 'string' ? symbol.kind : `kind_${symbol.kind}`;
                codeStructure.symbolCounts[kind] = (codeStructure.symbolCounts[kind] || 0) + 1;
            });
        }
        
        // Include dependencies
        if (context.dependencies) {
            codeStructure.dependencies = Object.keys(context.dependencies);
        }
        
        // Estimate complexity based on various factors
        let complexityScore = 0;
        
        // Factor 1: Number of files
        if (context.files.length > 100) {
            complexityScore += 3;
        } else if (context.files.length > 20) {
            complexityScore += 2;
        } else if (context.files.length > 5) {
            complexityScore += 1;
        }
        
        // Factor 2: Symbol count
        const totalSymbols = Object.values(codeStructure.symbolCounts).reduce((sum, count) => sum + count, 0);
        if (totalSymbols > 200) {
            complexityScore += 3;
        } else if (totalSymbols > 50) {
            complexityScore += 2;
        } else if (totalSymbols > 10) {
            complexityScore += 1;
        }
        
        // Factor 3: Dependency count
        if (codeStructure.dependencies.length > 15) {
            complexityScore += 2;
        } else if (codeStructure.dependencies.length > 5) {
            complexityScore += 1;
        }
        
        // Set complexity level
        if (complexityScore >= 5) {
            codeStructure.complexity = 'high';
        } else if (complexityScore >= 3) {
            codeStructure.complexity = 'medium';
        }
        
        return codeStructure;
    }

    /**
     * Summarize dependencies and their relationships
     */
    private summarizeDependencies(context: WorkspaceContext): any {
        const summary = {
            totalDependencies: 0,
            directDependencies: [] as string[],
            devDependencies: [] as string[],
            relationships: [] as {source: string, target: string, type: string}[]
        };
        
        // Extract package.json dependencies if available
        const packageJsonFile = context.files.find(file => path.basename(file) === 'package.json');
        
        if (packageJsonFile && context.fileContents.has(packageJsonFile)) {
            try {
                const packageJson = JSON.parse(context.fileContents.get(packageJsonFile) || '{}');
                
                if (packageJson.dependencies) {
                    summary.directDependencies = Object.keys(packageJson.dependencies);
                    summary.totalDependencies += summary.directDependencies.length;
                }
                
                if (packageJson.devDependencies) {
                    summary.devDependencies = Object.keys(packageJson.devDependencies);
                    summary.totalDependencies += summary.devDependencies.length;
                }
            } catch (error) {
                console.error('Error parsing package.json:', error);
            }
        }
        
        // Extract relationship information from imports if available
        if (context.imports && context.imports.size > 0) {
            const internalModules = new Set<string>();
            const allImports: {source: string, target: string}[] = [];
            
            // First pass: collect all internal modules
            context.imports.forEach((imports, sourceFile) => {
                imports.forEach(imp => {
                    if (imp.path && !imp.path.startsWith('.')) {
                        return; // Skip external imports
                    }
                    
                    // Resolve relative path to absolute
                    try {
                        const sourceDir = path.dirname(sourceFile);
                        let targetPath = imp.path || '';
                        
                        if (targetPath.startsWith('.')) {
                            targetPath = path.resolve(sourceDir, targetPath);
                            
                            // Handle extensions (.js, .ts, etc.)
                            if (!path.extname(targetPath)) {
                                // Try common extensions
                                for (const ext of ['.ts', '.js', '.tsx', '.jsx']) {
                                    const withExt = targetPath + ext;
                                    if (context.files.includes(withExt)) {
                                        targetPath = withExt;
                                        break;
                                    }
                                }
                            }
                            
                            if (context.files.includes(targetPath)) {
                                internalModules.add(path.basename(targetPath, path.extname(targetPath)));
                            }
                        }
                    } catch (error) {
                        // Ignore resolution errors
                    }
                });
            });
            
            // Second pass: build relationships
            context.imports.forEach((imports, sourceFile) => {
                const sourceModule = path.basename(sourceFile, path.extname(sourceFile));
                
                imports.forEach(imp => {
                    let targetModule = '';
                    
                    if (imp.path && imp.path.startsWith('.')) {
                        // Internal import
                        try {
                            const sourceDir = path.dirname(sourceFile);
                            let targetPath = imp.path;
                            
                            if (targetPath.startsWith('.')) {
                                targetPath = path.resolve(sourceDir, targetPath);
                                targetModule = path.basename(targetPath, path.extname(targetPath));
                            }
                        } catch (error) {
                            // Ignore resolution errors
                        }
                    } else if (imp.path) {
                        // External import
                        targetModule = imp.path.split('/')[0]; // Get package name
                    }
                    
                    if (targetModule && sourceModule !== targetModule) {
                        allImports.push({
                            source: sourceModule,
                            target: targetModule
                        });
                    }
                });
            });
            
            // Build final relationships list
            const processedRelations = new Set<string>();
            
            allImports.forEach(({source, target}) => {
                const relationKey = `${source}:${target}`;
                
                if (!processedRelations.has(relationKey)) {
                    const relationType = internalModules.has(target) ? 'internal' : 'external';
                    
                    summary.relationships.push({
                        source,
                        target,
                        type: relationType
                    });
                    
                    processedRelations.add(relationKey);
                }
            });
        }
        
        return summary;
    }
    
    /**
     * Analyze test coverage based on the workspace context
     */
    private analyzeTestCoverage(context: WorkspaceContext): any {
        const testCoverage = {
            testFileCount: 0,
            sourceFileCount: 0,
            estimatedCoverage: 0,
            untested: [] as string[]
        };
        
        const testPatterns = [
            /test|spec|_test\.|\btest_/i
        ];
        
        const testFiles: string[] = [];
        const sourceFiles: string[] = [];
        
        const sourceExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.go', '.cpp'];
        
        // Categorize files
        for (const filePath of context.files) {
            const fileExt = path.extname(filePath);
            const fileName = path.basename(filePath);
            
            // Skip non-source files
            if (!sourceExtensions.includes(fileExt)) {
                continue;
            }
            
            // Check if it's a test file
            if (testPatterns.some(pattern => pattern.test(fileName))) {
                testFiles.push(filePath);
            } else {
                sourceFiles.push(filePath);
            }
        }
        
        testCoverage.testFileCount = testFiles.length;
        testCoverage.sourceFileCount = sourceFiles.length;
        
        // Function to extract imported file names from content
        const extractImportedFiles = (content: string): string[] => {
            const imports: string[] = [];
            
            // Match import patterns for different languages
            // JavaScript/TypeScript imports
            const jsImportMatches = content.match(/from\s+['"]([^'"]+)['"]/g);
            if (jsImportMatches) {
                for (const match of jsImportMatches) {
                    const importPath = match.replace(/from\s+['"]|['"]/g, '');
                    imports.push(importPath);
                }
            }
            
            // Python imports
            const pyImportMatches = content.match(/import\s+([a-zA-Z0-9_.]+)|from\s+([a-zA-Z0-9_.]+)\s+import/g);
            if (pyImportMatches) {
                for (const match of pyImportMatches) {
                    const parts = match.split(/\s+/);
                    if (parts[0] === 'import') {
                        imports.push(parts[1]);
                    } else if (parts[0] === 'from') {
                        imports.push(parts[1]);
                    }
                }
            }
            
            return imports;
        };
        
        // Find which source files might be untested
        const testedFiles = new Set<string>();
        
        // Assume files are tested if they appear in imports of test files
        for (const testFile of testFiles) {
            if (context.fileContents.has(testFile)) {
                const content = context.fileContents.get(testFile) || '';
                const imports = extractImportedFiles(content);
                
                for (const sourceFile of sourceFiles) {
                    const baseName = path.basename(sourceFile, path.extname(sourceFile));
                    if (imports.some(imp => imp.includes(baseName))) {
                        testedFiles.add(sourceFile);
                    }
                }
            }
        }
        
        // Files that might be untested
        const untestedFiles = sourceFiles.filter(file => !testedFiles.has(file));
        
        // Limit to reasonable number to display
        testCoverage.untested = untestedFiles
            .slice(0, 10)
            .map(file => path.basename(file));
        
        // Estimate coverage percentage
        if (sourceFiles.length > 0) {
            testCoverage.estimatedCoverage = Math.round((testedFiles.size / sourceFiles.length) * 100);
        }
        
        return testCoverage;
    }
    
    /**
     * Analyze documentation quality
     */
    private analyzeDocumentationQuality(context: WorkspaceContext): any {
        const docQuality = {
            documentationFiles: 0,
            hasReadme: false,
            docCommentCount: 0,
            totalFunctions: 0,
            estimatedDocCoverage: 0
        };
        
        // Count documentation files
        let readmeContent = '';
        for (const filePath of context.files) {
            const fileExt = path.extname(filePath);
            const fileName = path.basename(filePath);
            
            // Check for documentation files
            if (fileExt === '.md' || fileExt === '.txt' || fileName.toLowerCase() === 'readme') {
                docQuality.documentationFiles++;
                
                // Store README content for further analysis
                if (fileName.toLowerCase() === 'readme.md' && context.fileContents.has(filePath)) {
                    readmeContent = context.fileContents.get(filePath) || '';
                    docQuality.hasReadme = true;
                }
            }
        }
        
        // Analyze code files for documentation comments
        let totalDocComments = 0;
        let totalFunctions = 0;
        let documentedFunctions = 0;
        
        const codeFiles = Array.from(context.fileContents.entries())
            .filter(([filePath]) => {
                const fileExt = path.extname(filePath);
                return ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs'].includes(fileExt);
            });
        
        for (const [filePath, content] of codeFiles) {
            // Count JSDoc/TSDoc comments
            const docCommentMatches = content.match(/\/\*\*[\s\S]*?\*\//g);
            if (docCommentMatches) {
                totalDocComments += docCommentMatches.length;
            }
            
            // Count Python docstrings
            const pyDocstringMatches = content.match(/"""\s*[\s\S]*?"""/g);
            if (pyDocstringMatches) {
                totalDocComments += pyDocstringMatches.length;
            }
            
            // Count functions/methods
            const functionMatches = content.match(/function\s+\w+\s*\(|def\s+\w+\s*\(|\w+\s*\([^)]*\)\s*{/g);
            if (functionMatches) {
                totalFunctions += functionMatches.length;
            }
            
            // Estimate documented functions by looking at nearby doc comments
            const lines = content.split('\n');
            let inDocComment = false;
            let docCommentEndLine = -1;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Check for start of doc comment
                if (line.startsWith('/**') || line.startsWith('"""')) {
                    inDocComment = true;
                    continue;
                }
                
                // Check for end of doc comment
                if (inDocComment && (line.endsWith('*/') || line.endsWith('"""'))) {
                    inDocComment = false;
                    docCommentEndLine = i;
                    continue;
                }
                
                // Check if function follows a doc comment
                if (docCommentEndLine === i - 1 && 
                    (line.startsWith('function ') || line.startsWith('def ') || /\w+\s*\([^)]*\)\s*{/.test(line))) {
                    documentedFunctions++;
                }
            }
        }
        
        // Store analysis results
        docQuality.docCommentCount = totalDocComments;
        docQuality.totalFunctions = totalFunctions;
        
        // Calculate estimated coverage
        if (totalFunctions > 0) {
            docQuality.estimatedDocCoverage = Math.round((documentedFunctions / totalFunctions) * 100);
        } else {
            // If no functions found but has README, give a minimum score
            docQuality.estimatedDocCoverage = docQuality.hasReadme ? 30 : 0;
        }
        
        return docQuality;
    }
    
    /**
     * Identify missing documentation
     */
    private findMissingDocumentation(context: WorkspaceContext): any {
        const missingDocs = {
            missingReadme: false,
            undocumentedFunctions: [] as string[],
            undocumentedClasses: [] as string[]
        };
        
        // Check if README exists
        const hasReadme = context.files.some(file => {
            const fileName = path.basename(file).toLowerCase();
            return fileName === 'readme.md' || fileName === 'readme';
        });
        
        missingDocs.missingReadme = !hasReadme;
        
        // Check for undocumented code elements
        const codeFiles = Array.from(context.fileContents.entries())
            .filter(([filePath]) => {
                const fileExt = path.extname(filePath);
                return ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs'].includes(fileExt);
            });
        
        for (const [filePath, content] of codeFiles) {
            const fileName = path.basename(filePath);
            const lines = content.split('\n');
            
            // Track documented and undocumented elements
            const documentedLines = new Set<number>();
            
            // Find lines that are preceded by documentation
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // JSDoc comment
                if (line.startsWith('/**')) {
                    // Find the end of the comment
                    let j = i;
                    while (j < lines.length && !lines[j].trim().endsWith('*/')) {
                        j++;
                    }
                    
                    // Mark the line after the comment as documented
                    if (j < lines.length - 1) {
                        documentedLines.add(j + 1);
                    }
                    
                    i = j;
                    continue;
                }
                
                // Python docstring
                if (line.startsWith('"""')) {
                    // Find the end of the docstring
                    let j = i;
                    while (j < lines.length && !lines[j].trim().endsWith('"""') && j !== i) {
                        j++;
                    }
                    
                    // Mark the line after the docstring as documented
                    if (j < lines.length - 1) {
                        documentedLines.add(j + 1);
                    }
                    
                    i = j;
                    continue;
                }
            }
            
            // Find undocumented functions and classes
            for (let i = 0; i < lines.length; i++) {
                if (documentedLines.has(i)) continue;
                
                const line = lines[i].trim();
                
                // JavaScript/TypeScript functions
                if ((line.startsWith('function ') || 
                     line.match(/^(export|async)?\s*function\s+\w+/)) && 
                    !line.includes('{') && i < lines.length - 1) {
                    
                    const functionName = line.replace(/^(export|async)?\s*function\s+/, '')
                                            .split('(')[0].trim();
                    
                    if (functionName && !documentedLines.has(i)) {
                        missingDocs.undocumentedFunctions.push(`${fileName}: ${functionName}`);
                    }
                }
                
                // JavaScript/TypeScript classes
                if ((line.startsWith('class ') || 
                     line.match(/^(export)?\s*class\s+\w+/)) && 
                    !line.includes('{') && i < lines.length - 1) {
                    
                    const className = line.replace(/^(export)?\s*class\s+/, '')
                                         .split(' ')[0].trim();
                    
                    if (className && !documentedLines.has(i)) {
                        missingDocs.undocumentedClasses.push(`${fileName}: ${className}`);
                    }
                }
                
                // Python functions
                if (line.startsWith('def ')) {
                    const functionName = line.replace('def ', '')
                                            .split('(')[0].trim();
                    
                    if (functionName && !documentedLines.has(i)) {
                        missingDocs.undocumentedFunctions.push(`${fileName}: ${functionName}`);
                    }
                }
                
                // Python classes
                if (line.startsWith('class ')) {
                    const className = line.replace('class ', '')
                                         .split('(')[0].trim();
                    
                    if (className && !documentedLines.has(i)) {
                        missingDocs.undocumentedClasses.push(`${fileName}: ${className}`);
                    }
                }
            }
        }
        
        // Limit to a reasonable number to display
        missingDocs.undocumentedFunctions = missingDocs.undocumentedFunctions.slice(0, 15);
        missingDocs.undocumentedClasses = missingDocs.undocumentedClasses.slice(0, 10);
        
        return missingDocs;
    }
    
    /**
     * Performs a security scan on the provided workspace context
     * Identifies common security issues and vulnerabilities in code
     */
    private async performSecurityScan(context: WorkspaceContext): Promise<any> {
        console.log('Performing security scan...');
        
        // Initialize security scan result
        const securityScanResult = {
            score: 0,
            summary: '',
            lastScanDate: new Date().toISOString(),
            vulnerabilities: [] as any[]
        };
        
        // Common security vulnerability patterns to check for
        const vulnerabilityPatterns = [
            {
                type: 'SQL Injection',
                patterns: [
                    /string\s*\+\s*.+\s*\+\s*["']\s*(SELECT|INSERT|UPDATE|DELETE)/i,
                    /\.query\s*\(\s*["']\s*.*\$\{.*\}/i,
                    /executeQuery\s*\(\s*["']\s*.*\+\s*.+/i
                ],
                severity: 'high',
                recommendation: 'Use parameterized queries or prepared statements instead of string concatenation'
            },
            {
                type: 'XSS Vulnerability',
                patterns: [
                    /\.innerHTML\s*=\s*.+/,
                    /\.outerHTML\s*=\s*.+/,
                    /document\.write\s*\(/,
                    /eval\s*\(/
                ],
                severity: 'high',
                recommendation: 'Use safe DOM APIs like textContent or implement proper output encoding'
            },
            {
                type: 'Hard-coded Credentials',
                patterns: [
                    /const\s+(password|secret|token|key)\s*=\s*["'][^"']+["']/i,
                    /let\s+(password|secret|token|key)\s*=\s*["'][^"']+["']/i,
                    /var\s+(password|secret|token|key)\s*=\s*["'][^"']+["']/i,
                    /password\s*:\s*["'][^"']{6,}["']/i
                ],
                severity: 'critical',
                recommendation: 'Use environment variables or a secure configuration management system'
            },
            {
                type: 'Insecure Cryptography',
                patterns: [
                    /createHash\s*\(\s*["']md5["']/i,
                    /createHash\s*\(\s*["']sha1["']/i,
                    /createCipher\s*\(/i
                ],
                severity: 'medium',
                recommendation: 'Use modern cryptographic algorithms and libraries'
            },
            {
                type: 'Insecure Cookie',
                patterns: [
                    /document\.cookie\s*=\s*["'][^"']*(?!secure|httponly)["']/i,
                    /cookie\s*:\s*["'][^"']*(?!secure|httponly)["']/i,
                    /cookieOptions\s*=\s*\{\s*(?!.*secure.*true)(?!.*httpOnly.*true)/i
                ],
                severity: 'medium',
                recommendation: 'Use secure and httpOnly flags on cookies'
            },
            {
                type: 'Insecure File Operations',
                patterns: [
                    /\.\.\/|\.\.\\|\.\.[\/\\]/,
                    /(?:fs|require\s*\(\s*["']fs["']\))\.(?:read|write).+\.\.(?:\/|\\)/
                ],
                severity: 'high',
                recommendation: 'Validate file paths and prevent path traversal attacks'
            },
            {
                type: 'Command Injection',
                patterns: [
                    /exec\s*\(\s*["'].+\$\{.*\}/i,
                    /spawn\s*\(\s*["'].+\$\{.*\}/i,
                    /execSync\s*\(\s*["'].+\$\{.*\}/i
                ],
                severity: 'critical',
                recommendation: 'Avoid command execution with user input or properly validate and sanitize inputs'
            },
            {
                type: 'Insecure Dependency',
                patterns: [
                    /import\s+.*\s+from\s+["'](lodash|jquery|bootstrap)@[0-1]\./i,
                    /require\s*\(\s*["'](lodash|jquery|bootstrap)@[0-1]\.["']\)/i
                ],
                severity: 'low',
                recommendation: 'Update to the latest version of the dependency to fix known security issues'
            }
        ];
        
        // Find old and potentially vulnerable dependencies
        const dependencyVulnerabilities = this.scanDependenciesForVulnerabilities(context);
        securityScanResult.vulnerabilities.push(...dependencyVulnerabilities);
        
        // Scan each file for security issues
        let totalIssues = 0;
        let filesToScan = Array.from(context.fileContents.entries());
        
        // Focus on sensitive files for security scanning
        const sensitiveExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.php', '.rb', '.java'];
        const securitySensitivePatterns = [
            /auth|login|password|credential|token|security|payment|admin|user|account/i
        ];
        
    // Prioritize scanning of security-sensitive files
    const prioritizedFiles = filesToScan
        .filter(([filePath]) => {
            const fileExt = path.extname(filePath);
            const fileName = path.basename(filePath);
            return sensitiveExtensions.includes(fileExt) || 
                   securitySensitivePatterns.some(pattern => pattern.test(fileName));
        });
        
        // Limit scanning to either prioritized files or a sample of all files
        const filesToProcess = prioritizedFiles.length > 0 ? 
                              prioritizedFiles : 
                              filesToScan.slice(0, Math.min(20, filesToScan.length));

        // Check each file for security vulnerabilities
        for (const [filePath, content] of filesToProcess) {
            const fileExt = path.extname(filePath);
            const fileName = path.basename(filePath);
            
            // Skip binary files, images, etc.
            if (!content || typeof content !== 'string' || content.length > 1000000) {
                continue;
            }
            
            // Check file for known vulnerability patterns
            for (const vulnType of vulnerabilityPatterns) {
                for (const pattern of vulnType.patterns) {
                    const matches = content.match(pattern);
                    
                    if (matches && matches.length > 0) {
                        totalIssues++;
                        
                        // Get issue context (surrounding code)
                        const matchIndex = content.indexOf(matches[0]);
                        const startPos = Math.max(0, matchIndex - 50);
                        const endPos = Math.min(content.length, matchIndex + matches[0].length + 50);
                        const issueContext = content.substring(startPos, endPos).trim();
                        
                        securityScanResult.vulnerabilities.push({
                            type: vulnType.type,
                            severity: vulnType.severity,
                            file: fileName,
                            issue: `Found potential ${vulnType.type} in code`,
                            recommendation: vulnType.recommendation,
                            context: issueContext
                        });
                    }
                }
            }
            
            // Language-specific checks
            if (fileExt === '.js' || fileExt === '.ts' || fileExt === '.jsx' || fileExt === '.tsx') {
                this.performJavaScriptSecurityChecks(filePath, content, securityScanResult);
            } else if (fileExt === '.py') {
                this.performPythonSecurityChecks(filePath, content, securityScanResult);
            }
        }
        
        // Check for environment or configuration files
        const configFiles = filesToScan.filter(([filePath]) => {
            const fileName = path.basename(filePath).toLowerCase();
            return fileName === '.env' || 
                   fileName === '.env.local' || 
                   fileName === 'config.json' || 
                   fileName === 'secrets.json' ||
                   fileName.includes('credentials');
        });
        
        // Check if config files might be exposed
        if (configFiles.length > 0) {
            // Check if .gitignore exists and properly ignores these files
            const gitignorePath = context.files.find(file => path.basename(file) === '.gitignore');
            let gitignoreContent = '';
            
            if (gitignorePath && context.fileContents.has(gitignorePath)) {
                gitignoreContent = context.fileContents.get(gitignorePath) || '';
            }
            
            for (const [filePath] of configFiles) {
                const fileName = path.basename(filePath);
                if (!gitignoreContent.includes(fileName) && !gitignoreContent.includes('**/')) {
                    securityScanResult.vulnerabilities.push({
                        type: 'Exposed Configuration',
                        severity: 'high',
                        file: fileName,
                        issue: 'Sensitive configuration file may not be ignored in version control',
                        recommendation: 'Add this file to .gitignore to prevent accidental exposure of sensitive data'
                    });
                    totalIssues++;
                }
            }
        }
        
        // Calculate security score based on issues found
        let baseScore = 80; // Start with a good score
        const fileCount = filesToScan.length;
        const issueDensity = fileCount > 0 ? totalIssues / fileCount : 0;
        
        // Reduce score based on vulnerability severity
        const criticalCount = securityScanResult.vulnerabilities.filter(v => v.severity === 'critical').length;
        const highCount = securityScanResult.vulnerabilities.filter(v => v.severity === 'high').length;
        const mediumCount = securityScanResult.vulnerabilities.filter(v => v.severity === 'medium').length;
        
        baseScore -= criticalCount * 15; // Critical issues have major impact
        baseScore -= highCount * 10;     // High severity issues have significant impact
        baseScore -= mediumCount * 5;    // Medium issues have moderate impact
        baseScore -= (totalIssues - criticalCount - highCount - mediumCount) * 2; // Other issues
        
        securityScanResult.score = Math.max(0, Math.min(100, Math.round(baseScore)));
        
        // Generate summary based on findings
        if (totalIssues === 0) {
            securityScanResult.summary = 'No significant security issues detected in the scanned files.';
        } else {
            securityScanResult.summary = `Found ${totalIssues} potential security ${totalIssues === 1 ? 'issue' : 'issues'} ` +
                `(${criticalCount} critical, ${highCount} high, ${mediumCount} medium severity).`;
        }
        
        return securityScanResult;
    }

    /**
     * Scan project dependencies for known vulnerabilities
     */
    private scanDependenciesForVulnerabilities(context: WorkspaceContext): any[] {
        const vulnerabilities = [];
        
        // List of dependencies with known major vulnerabilities in older versions
        const knownVulnerableDependencies = {
            'lodash': {
                vulnerableBelow: '4.17.21',
                issue: 'Prototype pollution vulnerabilities',
                severity: 'high'
            },
            'jquery': {
                vulnerableBelow: '3.5.0',
                issue: 'Cross-site scripting vulnerabilities',
                severity: 'high'
            },
            'axios': {
                vulnerableBelow: '0.21.1',
                issue: 'Server-side request forgery',
                severity: 'high'
            },
            'express': {
                vulnerableBelow: '4.17.3',
                issue: 'Open redirect vulnerability',
                severity: 'medium'
            },
            'react': {
                vulnerableBelow: '16.3.0',
                issue: 'Cross-site scripting vulnerability',
                severity: 'medium'
            },
            'node-fetch': {
                vulnerableBelow: '2.6.7',
                issue: 'Exposure of sensitive information',
                severity: 'medium'
            },
            'minimist': {
                vulnerableBelow: '1.2.6',
                issue: 'Prototype pollution',
                severity: 'medium'
            }
        };
        
        // Check package.json for dependencies
        const packageJsonFile = context.files.find(file => path.basename(file) === 'package.json');
        
        if (packageJsonFile && context.fileContents.has(packageJsonFile)) {
            try {
                const packageJson = JSON.parse(context.fileContents.get(packageJsonFile) || '{}');
                
                // Check dependencies and devDependencies
                const allDeps = {
                    ...(packageJson.dependencies || {}),
                    ...(packageJson.devDependencies || {})
                };
                
                for (const [depName, versionRange] of Object.entries(allDeps)) {
                    const knownVuln = (knownVulnerableDependencies as any)[depName];
                    
                    if (knownVuln) {
                        // Basic version comparison (this is simplified)
                        const version = String(versionRange).replace(/[^0-9.]/g, '');
                        const vulnVersion = knownVuln.vulnerableBelow;
                        
                        // Simple version comparison (could be improved with semver)
                        if (this.isVersionLowerThan(version, vulnVersion)) {
                            vulnerabilities.push({
                                type: 'Vulnerable Dependency',
                                severity: knownVuln.severity,
                                name: depName,
                                version: versionRange,
                                issue: knownVuln.issue,
                                recommendation: `Update ${depName} to version ${vulnVersion} or higher`
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('Error parsing package.json:', error);
            }
        }
        
        // Check for Python dependencies (requirements.txt)
        const reqsFile = context.files.find(file => path.basename(file) === 'requirements.txt');
        
        if (reqsFile && context.fileContents.has(reqsFile)) {
            const reqsContent = context.fileContents.get(reqsFile) || '';
            const pyKnownVulns = {
                'django': {
                    vulnerableBelow: '3.2.13',
                    issue: 'SQL injection vulnerabilities',
                    severity: 'high'
                },
                'flask': {
                    vulnerableBelow: '2.0.1',
                    issue: 'Security issues in sessions handling',
                    severity: 'medium'
                },
                'requests': {
                    vulnerableBelow: '2.26.0',
                    issue: 'CRLF injection vulnerability',
                    severity: 'medium'
                },
                'cryptography': {
                    vulnerableBelow: '36.0.0',
                    issue: 'Bleichenbacher timing oracle',
                    severity: 'medium'
                }
            };
            
            const reqLines = reqsContent.split('\n');
            for (const line of reqLines) {
                if (line.trim() && !line.startsWith('#')) {
                    const match = line.match(/^([a-zA-Z0-9_-]+)[=><]+([0-9.]+)/);
                    if (match) {
                        const [, pyDep, pyVersion] = match;
                        const pyKnownVuln = (pyKnownVulns as any)[pyDep.toLowerCase()];
                        
                        if (pyKnownVuln && this.isVersionLowerThan(pyVersion, pyKnownVuln.vulnerableBelow)) {
                            vulnerabilities.push({
                                type: 'Vulnerable Python Dependency',
                                severity: pyKnownVuln.severity,
                                name: pyDep,
                                version: pyVersion,
                                issue: pyKnownVuln.issue,
                                recommendation: `Update ${pyDep} to version ${pyKnownVuln.vulnerableBelow} or higher`
                            });
                        }
                    }
                }
            }
        }
        
        return vulnerabilities;
    }

    /**
     * Simple version comparison utility
     */
    private isVersionLowerThan(version: string, compareVersion: string): boolean {
        const v1Parts = version.split('.').map(p => parseInt(p, 10));
        const v2Parts = compareVersion.split('.').map(p => parseInt(p, 10));
        
        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1Part = v1Parts[i] || 0;
            const v2Part = v2Parts[i] || 0;
            
            if (v1Part < v2Part) return true;
            if (v1Part > v2Part) return false;
        }
        
        return false; // Equal versions
    }

    /**
     * JavaScript/TypeScript-specific security checks
     */
    private performJavaScriptSecurityChecks(filePath: string, content: string, securityScanResult: any): void {
        const fileName = path.basename(filePath);
        
        // Check for potentially dangerous eval-like patterns
        if (content.includes('new Function(') || content.includes('setTimeout') && /setTimeout\s*\(\s*["'][^"']+["']/i.test(content)) {
            securityScanResult.vulnerabilities.push({
                type: 'Code Injection',
                severity: 'high',
                file: fileName,
                issue: 'Potential code injection with dynamic code execution',
                recommendation: 'Avoid dynamically evaluating code from strings, especially with user input'
            });
        }
        
        // Check for potential prototype pollution
        if (content.includes('__proto__') || content.includes('constructor.prototype') || content.includes('Object.assign')) {
            const potentialPrototypePollution = /Object\.assign\s*\([^,]+,\s*[^,{]+\)/i.test(content) || 
                                               /\.__proto__\s*=/i.test(content);
            if (potentialPrototypePollution) {
                securityScanResult.vulnerabilities.push({
                    type: 'Prototype Pollution',
                    severity: 'medium',
                    file: fileName,
                    issue: 'Potential prototype pollution vulnerability',
                    recommendation: 'Use Object.create(null) or avoid direct prototype manipulation'
                });
            }
        }
        
        // Check for ReDoS (Regular Expression Denial of Service)
        const complexRegexPatterns = [
            /\/(\(\.\*\)\+)+\//,  // Nested repetition quantifiers
            /\/(\.\*){2,}\//,      // Multiple consecutive .* patterns
            /\/(\\\w\+){3,}\//     // Multiple consecutive \w+ patterns
        ];
        
        for (const pattern of complexRegexPatterns) {
            if (pattern.test(content)) {
                securityScanResult.vulnerabilities.push({
                    type: 'ReDoS',
                    severity: 'medium',
                    file: fileName,
                    issue: 'Potentially vulnerable regular expression pattern',
                    recommendation: 'Simplify complex regular expressions or implement timeout mechanisms'
                });
                break;
            }
        }
    }

    /**
     * Python-specific security checks
     */
    private performPythonSecurityChecks(filePath: string, content: string, securityScanResult: any): void {
        const fileName = path.basename(filePath);
        
        // Check for potential pickle deserialization issues
        if ((content.includes('import pickle') || content.includes('from pickle import')) && 
            content.includes('.load(') || content.includes('.loads(')) {
            securityScanResult.vulnerabilities.push({
                type: 'Insecure Deserialization',
                severity: 'critical',
                file: fileName,
                issue: 'Potential insecure deserialization with pickle',
                recommendation: 'Avoid using pickle for deserialization of untrusted data, consider using JSON instead'
            });
        }
        
        // Check for Flask debug mode
        if (content.includes('app.run') && content.includes('debug=True')) {
            securityScanResult.vulnerabilities.push({
                type: 'Debug Mode Enabled',
                severity: 'high',
                file: fileName,
                issue: 'Flask application running in debug mode',
                recommendation: 'Disable debug mode in production environments'
            });
        }
        
        // Check for direct SQL execution
        if ((content.includes('execute(') || content.includes('executemany(')) && 
            (content.includes('%s') || content.includes('format(') || content.includes('f"'))) {
            securityScanResult.vulnerabilities.push({
                type: 'SQL Injection',
                severity: 'high',
                file: fileName,
                issue: 'Potential SQL injection with string formatting',
                recommendation: 'Use parameterized queries with database libraries'
            });
        }
    }
    
    private calculateConfidenceScore(context: WorkspaceContext, modelType: string): number {
        // Get the model
        const model = this.models.get(modelType);
        if (!model) {
            return 0.5; // Default confidence
        }
        
        // Use the model's confidence function
        return model.confidence(context);
    }

    private async callModel(model: AIModel, preparedContext: any): Promise<any> {
        try {
            // In a real implementation, this would call an actual AI model API
            // For now, we'll just call the model's process function
            return await model.process(preparedContext);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Processing failed with ${model.name}: ${errorMessage}`);
        }
    }

    private prepareContextForModel(context: WorkspaceContext): any {
        // In a real implementation, this would prepare the context for the specific model
        // For now, we'll just return the context as is
        return context;
    }

    private processResults(result: any): any {
        // In a real implementation, this would process the results from the model
        // For now, we'll just return the results as is
        return result;
    }

    private generateSummary(result: any): any {
        // In a real implementation, this would generate a summary from the results
        // For now, we'll just return a simple summary
        return {
            content: "Analysis complete",
            suggestions: Array.isArray(result.suggestions) ? result.suggestions : []
        };
    }
}