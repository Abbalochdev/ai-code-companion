// Custom Jest type declarations
declare module '@jest/globals' {
    export function describe(name: string, fn: () => void): void;
    export function beforeEach(fn: () => void): void;
    export function afterEach(fn: () => void): void;
    export function test(name: string, fn: () => void): void;
    export function it(name: string, fn: () => void): void;
    export function expect(actual: any): jest.Expect;
    
    export namespace jest {
        function fn<T extends (...args: any[]) => any>(implementation?: T): Mock<T>;
        function clearAllMocks(): void;
        function resetAllMocks(): void;
        function restoreAllMocks(): void;
        
        interface Mock<T extends (...args: any[]) => any> {
            new (...args: any[]): T;
            (...args: Parameters<T>): ReturnType<T>;
            mockImplementation(fn: T): this;
            mockImplementationOnce(fn: T): this;
            mockReturnValue(value: ReturnType<T>): this;
            mockReturnValueOnce(value: ReturnType<T>): this;
            mockResolvedValue<U extends Promise<any>>(value: Awaited<U>): this;
            mockResolvedValueOnce<U extends Promise<any>>(value: Awaited<U>): this;
            mockRejectedValue(value: any): this;
            mockRejectedValueOnce(value: any): this;
            mockClear(): void;
            mockReset(): void;
            mockRestore(): void;
        }
        
        interface Expect {
            toBe(expected: any): void;
            toBeDefined(): void;
            toBeGreaterThan(expected: number): void;
            toBeLessThan(expected: number): void;
            toEqual(expected: any): void;
            toThrow(error?: string | Error | RegExp): void;
            toBeTruthy(): void;
            toBeFalsy(): void;
            toBeNull(): void;
            toContain(expected: any): void;
            rejects: {
                toThrow(expected?: string | Error | RegExp): Promise<void>;
            };
        }
    }
}

// Global augmentation for Jest
declare global {
    const describe: (name: string, fn: () => void) => void;
    const beforeEach: (fn: () => void) => void;
    const afterEach: (fn: () => void) => void;
    const test: (name: string, fn: () => void) => void;
    const it: (name: string, fn: () => void) => void;
    const expect: (actual: any) => jest.Expect;
}
