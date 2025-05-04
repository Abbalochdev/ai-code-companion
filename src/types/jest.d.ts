// Custom Jest type declarations
declare module '@jest/globals' {
    export function describe(name: string, fn: () => void): void;
    export function beforeEach(fn: () => void): void;
    export function test(name: string, fn: () => void): void;
    export function expect(actual: any): jest.Expect;

    namespace jest {
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
    const test: (name: string, fn: () => void) => void;
    const expect: (actual: any) => jest.Expect;
}
