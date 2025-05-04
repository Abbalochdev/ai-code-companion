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
    }

    async processWithCopilot(context: WorkspaceContext, analysisType: string): Promise<any> {
        // This is a simulation of processing with VS Code Copilot
        // In a real implementation, this would integrate with the actual Copilot API
        
        console.log(`Processing with Copilot for ${analysisType} analysis`);
        
        // Simulate a delay for processing
        await new Promise(resolve => setTimeout(resolve, 500));
        
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
                'Implement error handling for edge cases'
            ];
        } else if (analysisType === 'test') {
            response.suggestions = [
                'Increase test coverage for critical components',
                'Add integration tests for key workflows',
                'Consider implementing property-based testing'
            ];
        } else if (analysisType === 'docs') {
            response.suggestions = [
                'Add examples to complex function documentation',
                'Update README with installation instructions',
                'Document public API endpoints'
            ];
        }
        
        return response;
    }
    
    summarizeCodeStructure(context: WorkspaceContext): any {
        // Extract key information about code structure from the context
        const summary: any = {
            fileCount: context.files.length,
            languages: {},
            symbolCounts: {}
        };
        
        // Summarize languages used
        context.language.forEach((count, lang) => {
            summary.languages[lang] = count;
        });
        
        // Summarize symbol types (classes, functions, etc.)
        if (context.symbols) {
            context.symbols.forEach((symbols, _file) => {
                symbols.forEach(symbol => {
                    const kind = String(symbol.kind);
                    summary.symbolCounts[kind] = (summary.symbolCounts[kind] || 0) + 1;
                });
            });
        }
        
        return summary;
    }
    
    summarizeDependencies(context: WorkspaceContext): any {
        // Extract dependency information from the context
        const summary: any = {
            directDependencies: Object.keys(context.dependencies).length,
            importRelationships: 0,
            highlyConnectedFiles: []
        };
        
        // Count import relationships
        if (context.imports) {
            let fileImportCounts: Record<string, number> = {};
            
            context.imports.forEach((imports, file) => {
                fileImportCounts[file] = imports.length;
                summary.importRelationships += imports.length;
            });
            
            // Find highly connected files (top 5)
            summary.highlyConnectedFiles = Object.entries(fileImportCounts)
                .sort(([, countA], [, countB]) => (countB as number) - (countA as number))
                .slice(0, 5)
                .map(([file]) => file);
        }
        
        return summary;
    }
    
    analyzeTestCoverage(context: WorkspaceContext): any {
        // This is a simulated analysis of test coverage
        // In a real implementation, this would integrate with actual test coverage tools
        
        const testFiles = context.files.filter(file => 
            file.includes('test') || file.includes('spec')
        );
        
        const sourceFiles = context.files.filter(file => 
            !file.includes('test') && !file.includes('spec') && 
            (file.endsWith('.js') || file.endsWith('.ts') || 
             file.endsWith('.jsx') || file.endsWith('.tsx'))
        );
        
        // Calculate a simulated coverage ratio
        const coverage = {
            testFileCount: testFiles.length,
            sourceFileCount: sourceFiles.length,
            estimatedCoverage: sourceFiles.length > 0 
                ? Math.min(100, Math.round((testFiles.length / sourceFiles.length) * 100))
                : 0,
            untested: [] as string[]
        };
        
        // Identify potentially untested files
        if (context.imports && context.references) {
            coverage.untested = sourceFiles.filter(file => 
                !testFiles.some(testFile => {
                    const refs = context.references?.get(testFile) || [];
                    return refs.some((ref: any) => ref.path === file);
                })
            ).slice(0, 5); // Just show top 5 untested files
        }
        
        return coverage;
    }
    
    analyzeDocumentationQuality(context: WorkspaceContext): any {
        // This is a simulated analysis of documentation quality
        
        // Count documentation files
        const docFiles = context.files.filter(file => 
            file.endsWith('.md') || file.includes('README') || file.includes('docs/')
        );
        
        // Check for JSDoc/TSDoc comments in code files
        let docCommentCount = 0;
        let totalFunctions = 0;
        
        if (context.fileContents) {
            context.fileContents.forEach((content, file) => {
                if (file.endsWith('.js') || file.endsWith('.ts')) {
                    // Count JSDoc/TSDoc style comments
                    const docComments = (content.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
                    docCommentCount += docComments;
                    
                    // Roughly estimate function count
                    const functionMatches = content.match(/function\s+\w+|const\s+\w+\s*=\s*\(|class\s+\w+|interface\s+\w+/g);
                    totalFunctions += functionMatches ? functionMatches.length : 0;
                }
            });
        }
        
        return {
            documentationFiles: docFiles.length,
            docCommentCount,
            totalFunctions,
            estimatedDocCoverage: totalFunctions > 0 
                ? Math.min(100, Math.round((docCommentCount / totalFunctions) * 100)) 
                : 0
        };
    }
    
    findMissingDocumentation(context: WorkspaceContext): any {
        // This is a simulated analysis to find missing documentation
        
        const missingDocs: any = {
            undocumentedFunctions: [] as string[],
            undocumentedClasses: [] as string[],
            missingReadme: false
        };
        
        // Check for README file
        missingDocs.missingReadme = !context.files.some(file => 
            file.includes('README.md') || file.includes('README.txt')
        );
        
        // Find undocumented symbols
        if (context.symbols && context.fileContents) {
            context.symbols.forEach((symbols, file) => {
                const content = context.fileContents.get(file);
                if (!content) return;
                
                symbols.forEach(symbol => {
                    const symbolKind = String(symbol.kind).toLowerCase();
                    const symbolRange = {
                        start: { line: symbol.range.start.line, character: symbol.range.start.character },
                        end: { line: symbol.range.end.line, character: symbol.range.end.character }
                    };
                    
                    // Check if there's a doc comment before this symbol
                    const lines = content.split('\n');
                    const startLine = symbolRange.start.line;
                    let hasDocComment = false;
                    
                    // Look for doc comments in previous lines
                    for (let i = startLine - 1; i >= Math.max(0, startLine - 5); i--) {
                        if (lines[i] && (lines[i].includes('/**') || lines[i].includes('///'))) {
                            hasDocComment = true;
                            break;
                        }
                    }
                    
                    if (!hasDocComment) {
                        if (symbolKind.includes('function') || symbolKind.includes('method')) {
                            missingDocs.undocumentedFunctions.push(`${file}:${symbol.name}`);
                        } else if (symbolKind.includes('class') || symbolKind.includes('interface')) {
                            missingDocs.undocumentedClasses.push(`${file}:${symbol.name}`);
                        }
                    }
                });
            });
        }
        
        // Limit the results to avoid overwhelming output
        missingDocs.undocumentedFunctions = missingDocs.undocumentedFunctions.slice(0, 10);
        missingDocs.undocumentedClasses = missingDocs.undocumentedClasses.slice(0, 5);
        
        return missingDocs;
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