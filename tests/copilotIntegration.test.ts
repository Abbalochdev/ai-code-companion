import { CopilotIntegration } from '../src/copilotIntegration';
import { WorkspaceContext } from '../aiModelRouter';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import vscode from './mocks/vscode';

describe('CopilotIntegration Tests', () => {
    let copilotIntegration: CopilotIntegration;
    
    beforeEach(() => {
        // Reset mock implementation changes with a simpler approach
        const mockExecuteCommand = function(command: string) {
            if (command === 'github.copilot.chat.startSession') {
                return Promise.resolve();
            }
            if (command === 'github.copilot.chat.sendRequest') {
                return Promise.resolve('Copilot response with helpful suggestions:\n\n## Code Improvements\n* Use async/await\n* Extract functions\n\n## Performance Tips\n* Cache results');
            }
            return Promise.resolve(null);
        };
        
        // @ts-ignore - Mock the executeCommand function
        vscode.commands.executeCommand = mockExecuteCommand;
        
        // Create the copilot integration instance
        copilotIntegration = new CopilotIntegration();
        
        // Manually set properties for testing
        Object.defineProperty(copilotIntegration, 'isInitialized', { value: true });
        Object.defineProperty(copilotIntegration, 'copilotApiAvailable', { value: true });
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    it('Extracts structured suggestions from markdown response', async () => {
        const sampleResponse = `# Analysis Results

## Code Improvements
* Use async/await instead of Promise chains for better readability
* Extract duplicate logic into helper functions
* Add type annotations to function parameters

## Performance Issues
* Avoid unnecessary re-renders by using React.memo
* Cache expensive calculations
`;

        // Access private method for testing
        const extractSuggestions = copilotIntegration['extractSuggestions'].bind(copilotIntegration);
        const suggestions = extractSuggestions(sampleResponse);
        
        expect(suggestions.length).toBe(2);
        expect(suggestions[0].category).toBe('Code Improvements');
        expect(suggestions[0].items.length).toBe(3);
        expect(suggestions[1].category).toBe('Performance Issues');
        expect(suggestions[1].items.length).toBe(2);
    });
    
    it('Filters relevant files for code analysis', async () => {
        const mockContext: WorkspaceContext = {
            files: [
                '/project/src/app.ts',
                '/project/src/utils.js',
                '/project/tests/app.test.ts',
                '/project/README.md'
            ],
            language: new Map([
                ['.ts', 2],
                ['.js', 1],
                ['.md', 1]
            ]),
            dependencies: {},
            projectType: 'typescript',
            fileContents: new Map([
                ['/project/src/app.ts', 'console.log("app");'],
                ['/project/src/utils.js', 'console.log("utils");'],
                ['/project/tests/app.test.ts', 'test("app", () => {});'],
                ['/project/README.md', '# Project']
            ]),
            folderStructure: {}
        };
        
        // Access private method for testing
        const getRelevantFiles = copilotIntegration['getRelevantFiles'].bind(copilotIntegration);
        const relevantFiles = getRelevantFiles(mockContext, 'code');
        
        // For code analysis, should prioritize code files over test files and docs
        expect(relevantFiles.has('/project/src/app.ts')).toBeTruthy();
        expect(relevantFiles.has('/project/src/utils.js')).toBeTruthy();
    });
    
    it('Filters relevant files for test analysis', async () => {
        const mockContext: WorkspaceContext = {
            files: [
                '/project/src/app.ts',
                '/project/src/utils.js',
                '/project/tests/app.test.ts',
                '/project/README.md'
            ],
            language: new Map([
                ['.ts', 2],
                ['.js', 1],
                ['.md', 1]
            ]),
            dependencies: {},
            projectType: 'typescript',
            fileContents: new Map([
                ['/project/src/app.ts', 'console.log("app");'],
                ['/project/src/utils.js', 'console.log("utils");'],
                ['/project/tests/app.test.ts', 'test("app", () => {});'],
                ['/project/README.md', '# Project']
            ]),
            folderStructure: {}
        };
        
        // Access private method for testing
        const getRelevantFiles = copilotIntegration['getRelevantFiles'].bind(copilotIntegration);
        const relevantFiles = getRelevantFiles(mockContext, 'test');
        
        // For test analysis, should prioritize test files and their implementation files
        expect(relevantFiles.has('/project/tests/app.test.ts')).toBeTruthy();
        expect(relevantFiles.has('/project/src/app.ts')).toBeTruthy(); // Implementation file should be included
    });
    
    it('Simulates Copilot response when API is not available', async () => {
        const mockContext: WorkspaceContext = {
            files: ['/project/src/app.ts'],
            language: new Map([['.ts', 1]]),
            dependencies: {},
            projectType: 'typescript',
            fileContents: new Map([['/project/src/app.ts', 'console.log("app");']]),
            folderStructure: {}
        };
        
        // Set copilotApiAvailable to false
        Object.defineProperty(copilotIntegration, 'copilotApiAvailable', { value: false });
        
        const response = await copilotIntegration.processWithCopilot(mockContext, 'code');
        
        expect(response.content).toContain('Analysis of');
        expect(Array.isArray(response.suggestions)).toBeTruthy();
        expect(response.suggestions.length).toBeGreaterThan(0);
    });
    
    it('Builds appropriate prompt based on analysis type', async () => {
        const mockContext: WorkspaceContext = {
            files: ['/project/src/app.ts'],
            language: new Map([['.ts', 1]]),
            dependencies: {},
            projectType: 'typescript',
            fileContents: new Map([['/project/src/app.ts', 'console.log("app");']]),
            folderStructure: {}
        };
        
        // Access private method for testing
        const buildPromptForContext = copilotIntegration['buildPromptForContext'].bind(copilotIntegration);
        const codePrompt = buildPromptForContext(mockContext, 'code');
        const securityPrompt = buildPromptForContext(mockContext, 'security');
        
        expect(codePrompt).toContain('code reviewer');
        expect(securityPrompt).toContain('security expert');
    });
});
