import { AIModelRouter, WorkspaceContext } from '../aiModelRouter';
import { describe, beforeEach, test, expect } from '@jest/globals';

// Type assertion to ensure compatibility
const _: { 
    describe: typeof describe, 
    beforeEach: typeof beforeEach, 
    test: typeof test, 
    expect: typeof expect 
} = { describe, beforeEach, test, expect };

describe('AIModelRouter', (): void => {
    let router: AIModelRouter;
    let mockContext: WorkspaceContext;

    beforeEach(() => {
        router = new AIModelRouter();
        mockContext = {
            files: ['/test/file.ts'],
            language: new Map([
                ['.ts', 1]
            ]),
            dependencies: {},
            projectType: 'typescript',
            fileContents: new Map([
                ['/test/file.ts', 'class Test { method() {} }']
            ]),
            folderStructure: {},
            symbols: new Map(),
            imports: new Map()
        };
    });

    test('should route request to appropriate model', async () => {
        const result = await router.routeRequest(mockContext);
        
        expect(result).toBeDefined();
        expect(result.modelType).toBe('code');
        expect(result.modelUsed).toBe('Claude');
        expect(result.confidenceScore).toBeTruthy();
    });

    test('should handle different context types', async () => {
        // Test documentation context
        const docContext: WorkspaceContext = {
            ...mockContext,
            fileContents: new Map([
                ['/test/README.md', '# Test Documentation']
            ])
        };

        const docResult = await router.routeRequest(docContext);
        expect(docResult.modelType).toBe('documentation');
        expect(docResult.modelUsed).toBe('Gemini');
    });

    test('confidence calculation works correctly', () => {
        const models = (router as any).models;
        const codeModel = models.get('code');
        
        const highConfidenceContext: WorkspaceContext = {
            ...mockContext,
            language: new Map([['.ts', 5]]),
            symbols: new Map([['Test', []]]),
            imports: new Map([['import', []]])
        };

        const confidence = codeModel.confidence(highConfidenceContext);
        expect(confidence).toBeGreaterThan(0.8);
    });

    test('handles unsupported project types', async () => {
        const unsupportedContext: WorkspaceContext = {
            ...mockContext,
            projectType: 'unknown'
        };

        const result = await router.routeRequest(unsupportedContext);
        expect(result.modelType).toBe('fallback');
        expect(result.modelUsed).toBe('ChatGPT');
        expect(result.confidenceScore).toBeLessThan(0.5);
    });

    test('handles empty context', async () => {
        const emptyContext: WorkspaceContext = {
            files: [],
            language: new Map(),
            dependencies: {},
            projectType: '',
            fileContents: new Map(),
            folderStructure: {},
            symbols: new Map(),
            imports: new Map()
        };

        await expect(router.routeRequest(emptyContext)).rejects.toThrow();
    });

    test('model selection prioritizes language complexity', async () => {
        const complexContext: WorkspaceContext = {
            ...mockContext,
            language: new Map([
                ['.ts', 10],
                ['.js', 3],
                ['.py', 1]
            ]),
            symbols: new Map([
                ['ComplexClass', ['method1', 'method2', 'method3']],
                ['AnotherClass', ['complexMethod']]
            ])
        };

        const result = await router.routeRequest(complexContext);
        expect(result.modelType).toBe('code');
        expect(result.modelUsed).toBe('Claude');
        expect(result.confidenceScore).toBeGreaterThan(0.9);
    });
});
