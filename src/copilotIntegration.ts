import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceContext } from '../aiModelRouter';

/**
 * CopilotIntegration provides methods to interact with VS Code Copilot API.
 * This implementation uses the experimental VS Code Copilot API when available,
 * and falls back to a simulation mode when the API is not available.
 */
export class CopilotIntegration {
    private isInitialized = false;
    private copilotApiAvailable = false;
    private hasChatCommandsExtension = false;
    private useLangServerCodeGen = false;

    constructor() {
        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            // Check if Copilot Chat extension is installed
            const extensions = vscode.extensions.all;
            this.hasChatCommandsExtension = extensions.some(ext => 
                ext.id === 'GitHub.copilot-chat' && ext.isActive
            );

            // Check if default GitHub Copilot extension is installed
            const copilotExtension = extensions.find(ext => 
                ext.id === 'GitHub.copilot' && ext.isActive
            );
            
            this.copilotApiAvailable = !!copilotExtension && !!copilotExtension.exports;
            
            // Check for new language server code generation feature
            this.useLangServerCodeGen = !!copilotExtension?.exports?.getCodeGenerationProvider;

            this.isInitialized = true;
            console.log(`Copilot integration initialized. API available: ${this.copilotApiAvailable}, Chat Commands: ${this.hasChatCommandsExtension}`);
        } catch (error) {
            console.error('Error initializing Copilot integration:', error);
            this.isInitialized = true;
            this.copilotApiAvailable = false;
        }
    }

    /**
     * Process a context with Copilot for the specified analysis type
     */
    async processWithCopilot(context: WorkspaceContext, analysisType: string): Promise<any> {
        // Wait for initialization if not done yet
        if (!this.isInitialized) {
            await new Promise<void>(resolve => {
                const checkInterval = setInterval(() => {
                    if (this.isInitialized) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
        }

        // If Copilot API is available, use it
        if (this.copilotApiAvailable) {
            try {
                return await this.useRealCopilotApi(context, analysisType);
            } catch (error) {
                console.error('Error using Copilot API:', error);
                // Fall back to simulation
                return this.simulateCopilotResponse(context, analysisType);
            }
        } else {
            // If Copilot API is not available, simulate the response
            return this.simulateCopilotResponse(context, analysisType);
        }
    }    /**
     * Use the real Copilot API when available
     */
    private async useRealCopilotApi(context: WorkspaceContext, analysisType: string): Promise<any> {
        const prompt = this.buildPromptForContext(context, analysisType);

        // If Copilot Chat extension is available, use the slash command
        if (this.hasChatCommandsExtension) {
            try {
                // Show a status message to inform the user
                const statusMessage = vscode.window.setStatusBarMessage(`Running ${analysisType} analysis with Copilot...`);
                
                // Execute a @workspace command via the Copilot Chat API
                await vscode.commands.executeCommand('github.copilot.chat.startSession');
                
                // Request structured analysis with specific formatting guidelines to help extraction
                const enhancedPrompt = `${prompt}\n\nPlease format your response with markdown headings (## Section Title) for different categories of suggestions. Under each heading, provide a bulleted list of specific, actionable suggestions. Where appropriate, include code examples in markdown code blocks. This structured format will help me better understand your analysis.`;
                
                const response = await vscode.commands.executeCommand(
                    'github.copilot.chat.sendRequest',
                    `@workspace ${enhancedPrompt}`
                );
                
                // Clear the status message
                statusMessage.dispose();
                
                // Extract structured suggestions from the response
                const extractedSuggestions = this.extractSuggestions(response as string);
                
                return {
                    content: response,
                    suggestions: extractedSuggestions,
                    analysisType: analysisType
                };
            } catch (error) {
                console.error('Error using Copilot Chat API:', error);
                throw error;
            }
        }

        // Use the language server-based code generation if available
        if (this.useLangServerCodeGen) {
            try {
                // Show status message
                const statusMessage = vscode.window.setStatusBarMessage(`Running ${analysisType} analysis with Copilot...`);
                
                const codegenProvider = await vscode.extensions.getExtension('GitHub.copilot')?.exports.getCodeGenerationProvider();
                if (codegenProvider) {
                    // Add structure hints to the prompt for better extraction
                    const enhancedPrompt = `
                    # ${analysisType.toUpperCase()} ANALYSIS REQUEST
                    
                    ${prompt}
                    
                    Please format your response with the following structure:
                    1. Start with a brief summary of the analysis
                    2. Use ## headings to separate different categories of suggestions
                    3. Under each heading, provide a bulleted list with * for specific, actionable suggestions
                    4. Where helpful, include code examples in \`\`\` code blocks
                    5. For security analysis, clearly highlight severity levels of any issues found
                    `;
                    
                    const response = await codegenProvider.provideCodeGeneration(enhancedPrompt);
                    
                    // Clear status message
                    statusMessage.dispose();
                    
                    return {
                        content: response.value,
                        suggestions: this.extractSuggestions(response.value),
                        analysisType: analysisType
                    };
                }
            } catch (error) {
                console.error('Error using Copilot code generation API:', error);
                throw error;
            }
        }

        // If we got here, we can't use the real API even though it was detected
        throw new Error('Copilot API detected but not accessible');
    }    /**
     * Simulate a Copilot response for testing and fallback
     */
    private simulateCopilotResponse(context: WorkspaceContext, analysisType: string): any {
        console.log(`Simulating Copilot ${analysisType} analysis`);
        
        // Create a detailed response in markdown format based on the context and analysis type
        let responseContent = `# Analysis of ${context.files.length} files\n\n`;
        
        // Add different content based on analysis type
        if (analysisType === 'code') {
            responseContent += `## Code Quality Improvements\n\n`;
            responseContent += `* Consider refactoring duplicate code into shared functions to reduce maintenance overhead\n`;
            responseContent += `* Add type annotations to improve code clarity and catch type-related bugs early\n`;
            responseContent += `* Implement error handling for edge cases to improve application robustness\n`;
            responseContent += `* Extract common utilities into separate modules for better code organization\n`;
            responseContent += `* Consider using dependency injection for better testability and decoupling\n\n`;
            
            responseContent += `## Performance Recommendations\n\n`;
            responseContent += `* Cache expensive operations to reduce computation time\n`;
            responseContent += `* Avoid unnecessary re-renders in UI components by using memoization\n`;
            responseContent += `* Consider lazy-loading for modules that aren't immediately needed\n\n`;
            
            // Add a code example
            responseContent += "```typescript\n// Example of improved error handling\ntry {\n  const result = await riskyOperation();\n  return processResult(result);\n} catch (error) {\n  logger.error('Operation failed', error);\n  throw new AppError('Operation failed', { cause: error });\n}\n```";
            
        } else if (analysisType === 'test') {
            responseContent += `## Testing Improvements\n\n`;
            responseContent += `* Increase test coverage for critical components to ensure reliability\n`;
            responseContent += `* Add integration tests for key workflows to verify end-to-end functionality\n`;
            responseContent += `* Consider implementing property-based testing for thorough edge case coverage\n`;
            responseContent += `* Add mocks for external dependencies to make tests faster and more deterministic\n`;
            responseContent += `* Use parameterized tests to cover multiple scenarios efficiently\n\n`;
            
            responseContent += `## Test Structure Recommendations\n\n`;
            responseContent += `* Organize tests using the Arrange-Act-Assert pattern for clarity\n`;
            responseContent += `* Separate unit tests from integration tests for better organization\n`;
            
            // Add a code example
            responseContent += "```typescript\n// Example of a parameterized test\ndescribe('isValidPassword', () => {\n  const testCases = [\n    { password: 'short', expected: false, reason: 'too short' },\n    { password: 'nouppercase123', expected: false, reason: 'no uppercase' },\n    { password: 'Valid123Password', expected: true, reason: 'meets all requirements' }\n  ];\n  \n  testCases.forEach(({password, expected, reason}) => {\n    it(`returns ${expected} when password is ${reason}`, () => {\n      expect(isValidPassword(password)).toBe(expected);\n    });\n  });\n});\n```";
            
        } else if (analysisType === 'docs') {
            responseContent += `## Documentation Improvements\n\n`;
            responseContent += `* Add examples to complex function documentation to clarify usage\n`;
            responseContent += `* Update README with installation instructions for new contributors\n`;
            responseContent += `* Document public API endpoints to help consumers of your API\n`;
            responseContent += `* Add JSDoc/TSDoc comments to public methods for better IDE integration\n`;
            responseContent += `* Create a CONTRIBUTING.md file for contributors\n\n`;
            
            responseContent += `## Documentation Structure\n\n`;
            responseContent += `* Use consistent formatting for all documentation files\n`;
            responseContent += `* Add a table of contents to larger documentation files\n`;
            
            // Add a code example
            responseContent += "```typescript\n/**\n * Processes a customer transaction and updates account balance\n * \n * @param customerId - Unique identifier for the customer\n * @param amount - Transaction amount (positive for deposits, negative for withdrawals)\n * @param options - Additional transaction options\n * @returns Promise resolving to the updated account balance\n * \n * @example\n * // Process a deposit\n * const newBalance = await processTransaction('cust-123', 100.50);\n * \n * @throws {InsufficientFundsError} When withdrawal amount exceeds available balance\n */\nasync function processTransaction(customerId: string, amount: number, options?: TransactionOptions): Promise<number> {\n  // Implementation...\n}\n```";
            
        } else if (analysisType === 'security') {
            responseContent += `## Security Vulnerabilities\n\n`;
            responseContent += `* Implement proper input validation to prevent injection attacks\n`;
            responseContent += `* Use parameterized queries for database access to prevent SQL injection\n`;
            responseContent += `* Avoid storing sensitive data in client-side code to prevent exposure\n`;
            responseContent += `* Update dependencies with known vulnerabilities to minimize attack surface\n`;
            responseContent += `* Implement proper authentication and authorization checks for all routes\n\n`;
            
            responseContent += `## Security Best Practices\n\n`;
            responseContent += `* Use HTTPS for all connections to encrypt data in transit\n`;
            responseContent += `* Implement rate limiting to prevent brute force attacks\n`;
            responseContent += `* Set secure and HttpOnly flags on cookies containing sensitive information\n`;
            
            // Add a code example
            responseContent += "```typescript\n// Example of secure parameter handling\n// INSECURE: Direct string interpolation\nconst query1 = `SELECT * FROM users WHERE username = '${username}'`; // Vulnerable to SQL injection\n\n// SECURE: Using parameterized queries\nconst query2 = 'SELECT * FROM users WHERE username = ?';\ndb.query(query2, [username]); // Parameters are safely escaped\n```";
        }
        
        // Return the response with structured suggestions extracted from the content
        return {
            content: responseContent,
            suggestions: this.extractSuggestions(responseContent)
        };
    }    /**
     * Build a prompt for Copilot based on the context and analysis type
     */
    private buildPromptForContext(context: WorkspaceContext, analysisType: string): string {
        // Base prompt
        let prompt = '';
        
        // Add different prompts based on analysis type
        if (analysisType === 'code') {
            prompt = `You are an experienced code reviewer with expertise in software architecture, design patterns, and best practices.
            
Analyze the provided code and provide detailed, actionable suggestions in the following categories:
1. Code quality improvements
2. Potential bugs or edge cases
3. Refactoring opportunities
4. Performance optimizations
5. Maintainability improvements

For each suggestion, explain WHY it's important and HOW to implement it.`;
        } else if (analysisType === 'test') {
            prompt = `You are a QA engineer specializing in testing strategies and test coverage analysis.
            
Analyze the provided test files and production code to assess test quality. Focus on:
1. Test coverage gaps - identify untested or under-tested components
2. Test quality - evaluate if tests are thorough and verify the right behaviors
3. Testing approach - suggest more effective testing strategies if applicable
4. Edge cases - identify important scenarios that aren't currently tested
5. Test structure - recommend improvements to test organization and readability

When possible, include specific examples of what tests should be added or improved.`;
        } else if (analysisType === 'docs') {
            prompt = `You are a technical documentation expert who helps development teams create clear, comprehensive documentation.
            
Analyze the provided code and documentation files to evaluate documentation quality. Focus on:
1. Documentation completeness - identify under-documented components, functions, or APIs
2. Documentation clarity and accuracy - evaluate if existing docs are clear and up-to-date
3. Documentation structure - suggest improvements to organization
4. Example usage - identify where examples would be helpful
5. Inline code comments - evaluate quality and suggest improvements

For each suggestion, explain why it would be valuable to users of the codebase.`;
        } else if (analysisType === 'security') {
            prompt = `You are a security expert who specializes in identifying vulnerabilities in code and suggesting remediation strategies.
            
Perform a thorough security analysis of the provided code. Focus on:
1. Potential vulnerabilities - identify security issues like injection attacks, auth problems, etc.
2. Severity assessment - rate each issue by potential impact
3. Remediation steps - provide specific guidance on how to fix each issue
4. Security best practices - suggest improvements to overall security posture
5. Dependencies - identify potential vulnerabilities in third-party dependencies if visible

For each vulnerability, explain the potential impact and provide clear steps to address it.`;
        }

        // Add context information
        if (context.projectType) {
            prompt += `\nProject type: ${context.projectType}`;
        }

        // Add file content (limit to avoid token limits)
        if (context.selectionMetadata) {
            // For selection analysis, just include the selected text and surrounding context
            prompt += `\n\nSelected code:\n${context.selectionMetadata.selectedText}`;
            if (context.selectionMetadata.surroundingText) {
                prompt += `\n\nSurrounding context:\n${context.selectionMetadata.surroundingText}`;
            }
        } else {
            // For file/workspace analysis, include a sample of relevant files
            const relevantFiles = this.getRelevantFiles(context, analysisType);
            let fileCount = 0;
            
            for (const [filename, content] of relevantFiles) {
                // Limit the number of files and content size
                if (fileCount >= 5 || prompt.length > 5000) {
                    prompt += '\n\n(Additional files omitted due to size constraints)';
                    break;
                }
                
                // Add file content with a reasonable size limit
                const truncatedContent = content.length > 1000 ? content.substring(0, 1000) + '...(truncated)' : content;
                prompt += `\n\nFile: ${filename}\n${truncatedContent}`;
                fileCount++;
            }
        }
        
        // Add specific instructions based on analysis type
        if (analysisType === 'code') {
            prompt += '\n\nPlease provide specific suggestions for code improvements, identify potential bugs, and suggest refactoring opportunities. Focus on maintainability, performance, and best practices.';
        } else if (analysisType === 'test') {
            prompt += '\n\nPlease evaluate test coverage and quality. Suggest additional tests that would improve robustness and reliability. Identify untested edge cases.';
        } else if (analysisType === 'docs') {
            prompt += '\n\nPlease evaluate documentation quality. Identify areas that need better documentation, and suggest specific improvements.';
        } else if (analysisType === 'security') {
            prompt += '\n\nPlease identify potential security vulnerabilities such as injection attacks, authentication issues, data exposure, etc. Suggest specific fixes for each issue found.';
        }
        
        return prompt;
    }

    /**
     * Get relevant files from the context based on analysis type
     */
    private getRelevantFiles(context: WorkspaceContext, analysisType: string): Map<string, string> {
        const relevantFiles = new Map<string, string>();
        
        // If we only have a single file, return it
        if (context.fileContents.size === 1) {
            return context.fileContents;
        }
        
        // Otherwise, select relevant files based on analysis type
        const allFiles = Array.from(context.fileContents.entries());
        const fileImportance = new Map<string, number>();
        
        // First pass - assign base importance to files
        allFiles.forEach(([file]) => {
            let importance = 1; // Base importance
            
            // Increase importance for non-minified files
            if (!file.includes('.min.')) {
                importance++;
            }
            
            // Give higher importance to smaller files (likely more focused)
            const content = context.fileContents.get(file) || '';
            if (content.length < 5000) {
                importance++;
            }
            
            // Store initial importance score
            fileImportance.set(file, importance);
        });
        
        // Second pass - adjust importance based on analysis type
        switch (analysisType) {
            case 'code':
                // For code analysis, prioritize code files with semantic relationships
                allFiles.forEach(([file]) => {
                    // Boost for code files
                    if (/\.(js|ts|jsx|tsx|py|java|cpp|cs|go|rb|php)$/i.test(file)) {
                        fileImportance.set(file, (fileImportance.get(file) || 0) + 3);
                    }
                    
                    // Boost for files with many semantic relationships
                    const relationships = context.semanticRelationships?.get(file) || [];
                    if (relationships.length > 0) {
                        fileImportance.set(file, (fileImportance.get(file) || 0) + relationships.length);
                    }
                    
                    // Reduce importance of test files for code analysis
                    if (/test|spec|_test|\btest_/i.test(file)) {
                        fileImportance.set(file, (fileImportance.get(file) || 0) - 2);
                    }
                });
                break;
                
            case 'test':
                // For test analysis, prioritize test files and their implementation files
                allFiles.forEach(([file]) => {
                    // Boost test files significantly
                    if (/test|spec|_test|\btest_/i.test(file)) {
                        fileImportance.set(file, (fileImportance.get(file) || 0) + 5);
                        
                        // Try to identify the implementation file being tested
                        const possibleImplFile = this.findImplementationFile(file, allFiles.map(([f]) => f));
                        if (possibleImplFile) {
                            fileImportance.set(possibleImplFile, (fileImportance.get(possibleImplFile) || 0) + 3);
                        }
                    }
                    
                    // Boost files that contain assert/expect functions
                    const content = context.fileContents.get(file) || '';
                    if (/assert\(|expect\(|test\(|describe\(|it\(/i.test(content)) {
                        fileImportance.set(file, (fileImportance.get(file) || 0) + 2);
                    }
                });
                break;
                
            case 'docs':
                // For docs analysis, prioritize documentation files and well-documented code
                allFiles.forEach(([file]) => {
                    // Boost documentation files significantly
                    if (/\.(md|txt)$|README|CONTRIBUTING|docs\/|\.documentation|wiki\//i.test(file)) {
                        fileImportance.set(file, (fileImportance.get(file) || 0) + 5);
                    }
                    
                    // Boost source files with JSDoc/TSDoc comments
                    const content = context.fileContents.get(file) || '';
                    const docCommentCount = (content.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
                    if (docCommentCount > 0) {
                        fileImportance.set(file, (fileImportance.get(file) || 0) + Math.min(docCommentCount, 3));
                    }
                    
                    // Include package.json for project metadata
                    if (file.endsWith('package.json') || file.endsWith('pyproject.toml') || 
                        file.endsWith('setup.py') || file.endsWith('composer.json')) {
                        fileImportance.set(file, (fileImportance.get(file) || 0) + 3);
                    }
                });
                break;
                
            case 'security':
                // For security analysis, prioritize security-sensitive files
                allFiles.forEach(([file]) => {
                    const fileName = file.toLowerCase();
                    const content = context.fileContents.get(file) || '';
                    
                    // Check for security-sensitive filenames
                    if (/auth|login|password|user|token|security|crypto|crypt|verify|permission|role|access/i.test(fileName)) {
                        fileImportance.set(file, (fileImportance.get(file) || 0) + 4);
                    }
                    
                    // Check for security-sensitive code patterns
                    const securityPatterns = [
                        /password|secret|token|apiKey|api_key|credential/i,
                        /authent|authoriz/i,
                        /encrypt|decrypt|hash|salt/i,
                        /sql\s*=|query\s*\(/i,
                        /exec\s*\(|eval\s*\(/i,
                        /\.innerHtml|\.outerHtml|document\.write/i
                    ];
                    
                    let securityScore = 0;
                    for (const pattern of securityPatterns) {
                        if (pattern.test(content)) {
                            securityScore++;
                        }
                    }
                    
                    fileImportance.set(file, (fileImportance.get(file) || 0) + securityScore);
                    
                    // Check for configuration files with potential secrets
                    if (/config|settings|\.env|\.ini|\.json|\.yml|\.yaml/i.test(fileName)) {
                        fileImportance.set(file, (fileImportance.get(file) || 0) + 2);
                    }
                });
                break;
                
            default:
                // No additional adjustment for unknown analysis types
                break;
        }
        
        // Sort files by importance and select top N
        const sortedFiles = Array.from(fileImportance.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by importance (descending)
            .map(([file]) => file)
            .slice(0, 10); // Take top 10
            
        // Add the selected files to the result map
        sortedFiles.forEach(file => {
            const content = context.fileContents.get(file);
            if (content !== undefined) {
                relevantFiles.set(file, content);
            }
        });
        
        return relevantFiles;
    }
    
    /**
     * Try to find the implementation file that corresponds to a test file
     */
    private findImplementationFile(testFile: string, allFiles: string[]): string | undefined {
        // Extract the base name (without extension) from the test file
        const testFileName = path.basename(testFile);
        const baseNameMatch = testFileName.match(/^(.+?)(?:\.test|\.spec|_test|test_|\.tests)\./i);
        
        if (!baseNameMatch) {
            return undefined;
        }
        
        const baseName = baseNameMatch[1];
        
        // Look for files with matching base name that aren't test files
        const implementationFile = allFiles.find(file => {
            const fileName = path.basename(file);
            return fileName.startsWith(baseName) && 
                   !(/test|spec|_test|\btest_/i.test(fileName)) &&
                   file !== testFile;
        });
        
        return implementationFile;
    }    /**
     * Extract structured suggestions from Copilot's response text
     * This improved version intelligently categorizes and prioritizes suggestions
     */
    private extractSuggestions(responseText: string): any[] {
        const suggestions: any[] = [];
        
        // Try to find markdown-style sections (e.g. ## Section Title)
        const sections = this.extractSectionsFromMarkdown(responseText);
        
        if (sections.length > 0) {
            // Process each section to extract suggestions
            for (const section of sections) {
                const sectionSuggestions = this.extractItemsFromSection(section.content);
                
                if (sectionSuggestions.length > 0) {
                    suggestions.push({
                        category: section.title,
                        items: sectionSuggestions.map(item => ({
                            text: item,
                            priority: this.calculatePriority(item)
                        }))
                    });
                }
            }
            
            // If we successfully extracted structured sections, return them
            if (suggestions.length > 0) {
                return this.prioritizeAndFormatSuggestions(suggestions);
            }
        }
        
        // If no sections were found, try to find code blocks
        const codeBlocks = this.extractCodeBlocks(responseText);
        if (codeBlocks.length > 0) {
            // Add code block suggestions
            suggestions.push({
                category: 'Code Examples',
                items: codeBlocks.map(block => ({
                    text: block.substring(0, 200) + (block.length > 200 ? '...' : ''),
                    code: block,
                    priority: 3
                }))
            });
        }
        
        // Try to find bullets and numbered lists
        const listItems = this.extractListItems(responseText);
        if (listItems.length > 0) {
            // Group list items by potential categories
            const categorized = this.categorizeSuggestions(listItems);
            
            for (const [category, items] of Object.entries(categorized)) {
                suggestions.push({
                    category,
                    items: items.map(item => ({
                        text: item,
                        priority: this.calculatePriority(item)
                    }))
                });
            }
        }
        
        // If we still don't have suggestions, use sentences
        if (suggestions.length === 0) {
            const sentences = this.extractSentences(responseText);
            if (sentences.length > 0) {
                suggestions.push({
                    category: 'Suggestions',
                    items: sentences.map(sentence => ({
                        text: sentence,
                        priority: this.calculatePriority(sentence)
                    }))
                });
            }
        }
        
        // If nothing else worked, use raw text chunks
        if (suggestions.length === 0) {
            const chunks = this.extractTextChunks(responseText);
            if (chunks.length > 0) {
                suggestions.push({
                    category: 'Analysis',
                    items: chunks.map(chunk => ({
                        text: chunk,
                        priority: 1
                    }))
                });
            }
        }
        
        return this.prioritizeAndFormatSuggestions(suggestions);
    }
    
    /**
     * Extract markdown-style sections from the response text
     */
    private extractSectionsFromMarkdown(text: string): Array<{title: string, content: string}> {
        const sections: Array<{title: string, content: string}> = [];
        const sectionPattern = /(?:^|\n)(#{1,3})\s+(.+?)(?:\n|$)([\s\S]*?)(?=\n#{1,3}\s+|$)/g;
        
        let match;
        while ((match = sectionPattern.exec(text)) !== null) {
            const level = match[1].length;
            const title = match[2].trim();
            const content = match[3].trim();
            
            if (title && content) {
                sections.push({
                    title,
                    content
                });
            }
        }
        
        return sections;
    }
    
    /**
     * Extract list items (bulleted and numbered) from a section or text
     */
    private extractItemsFromSection(text: string): string[] {
        const items: string[] = [];
        
        // Extract bulleted list items
        const bulletPattern = /(?:^|\n)[\s-]*[•*-][\s]+(.*?)(?=\n[\s-]*[•*-][\s]+|\n\n|$)/gs;
        let match;
        while ((match = bulletPattern.exec(text)) !== null) {
            if (match[1] && match[1].trim().length > 0) {
                items.push(match[1].trim());
            }
        }
        
        // Extract numbered list items
        const numberedPattern = /(?:^|\n)[\s-]*\d+\.[\s]+(.*?)(?=\n[\s-]*\d+\.[\s]+|\n\n|$)/gs;
        while ((match = numberedPattern.exec(text)) !== null) {
            if (match[1] && match[1].trim().length > 0) {
                items.push(match[1].trim());
            }
        }
        
        return items;
    }
    
    /**
     * Extract list items (both bulleted and numbered)
     */
    private extractListItems(text: string): string[] {
        return this.extractItemsFromSection(text);
    }
    
    /**
     * Extract code blocks from markdown
     */
    private extractCodeBlocks(text: string): string[] {
        const blocks: string[] = [];
        const codeBlockPattern = /```(?:\w+)?\n([\s\S]*?)\n```/g;
        
        let match;
        while ((match = codeBlockPattern.exec(text)) !== null) {
            if (match[1] && match[1].trim().length > 0) {
                blocks.push(match[1].trim());
            }
        }
        
        return blocks;
    }
    
    /**
     * Extract meaningful sentences from text
     */
    private extractSentences(text: string): string[] {
        return text
            .split(/[.!?]\s+/)
            .map(s => s.trim())
            .filter(s => s.length >= 30 && s.length <= 200)  // Filter reasonable sentence lengths
            .slice(0, 7);  // Limit to 7 sentences
    }
    
    /**
     * Extract meaningful text chunks when all else fails
     */
    private extractTextChunks(text: string): string[] {
        return text
            .split('\n\n')
            .map(chunk => chunk.trim())
            .filter(chunk => chunk.length >= 30)
            .slice(0, 5);
    }
    
    /**
     * Calculate a priority score for a suggestion based on content
     */
    private calculatePriority(text: string): number {
        let priority = 2; // Default priority
        
        // Increase priority for suggestions that seem more actionable
        if (/should|consider|recommend|improve|optimize|refactor|fix|update|add|remove|replace|use instead/i.test(text)) {
            priority++;
        }
        
        // Increase priority for suggestions that mention common code quality concerns
        if (/security|performance|error handling|type safety|memory leak|validation|test|documentation/i.test(text)) {
            priority++;
        }
        
        // Decrease priority for vague suggestions
        if (/might|may|could|possibly|perhaps|maybe/i.test(text)) {
            priority--;
        }
        
        // Ensure priority is within reasonable bounds
        return Math.max(1, Math.min(5, priority));
    }
    
    /**
     * Try to categorize list items into meaningful groups
     */
    private categorizeSuggestions(items: string[]): Record<string, string[]> {
        const categories: Record<string, string[]> = {
            'Code Improvements': [],
            'Performance Optimizations': [],
            'Security Recommendations': [],
            'Best Practices': [],
            'Other Suggestions': []
        };
        
        for (const item of items) {
            if (/security|vulnerability|auth|injection|xss|csrf|password|encrypt/i.test(item)) {
                categories['Security Recommendations'].push(item);
            } else if (/performance|speed|optimize|slow|fast|memory|cpu|efficient/i.test(item)) {
                categories['Performance Optimizations'].push(item);
            } else if (/refactor|clean|naming|readability|maintainability|pattern|design/i.test(item)) {
                categories['Code Improvements'].push(item);
            } else if (/practice|convention|standard|lint|style|guideline/i.test(item)) {
                categories['Best Practices'].push(item);
            } else {
                categories['Other Suggestions'].push(item);
            }
        }
        
        // Remove empty categories
        const result: Record<string, string[]> = {};
        for (const [category, categoryItems] of Object.entries(categories)) {
            if (categoryItems.length > 0) {
                result[category] = categoryItems;
            }
        }
        
        // If we couldn't categorize well, use a generic category
        if (Object.keys(result).length === 0) {
            result['Suggestions'] = items;
        }
        
        return result;
    }
    
    /**
     * Prioritize and format suggestions into a consistent format
     */
    private prioritizeAndFormatSuggestions(categorizedSuggestions: any[]): any[] {
        const result: any[] = [];
        
        for (const categoryGroup of categorizedSuggestions) {
            // Sort items by priority (descending)
            const sortedItems = [...categoryGroup.items].sort((a, b) => b.priority - a.priority);
            
            // Take top N items from each category
            const selectedItems = sortedItems.slice(0, 5);
            
            // Add to result
            result.push({
                category: categoryGroup.category,
                items: selectedItems.map((item: any) => {
                    // Include only necessary fields for the UI
                    return {
                        text: item.text,
                        ...(item.code ? { code: item.code } : {})
                    };
                })
            });
        }
        
        return result;
    }
}
