// Define the MockExtension class used in testing
class MockExtension {
    public isActive = true;
    public id = 'GitHub.copilot';
    public exports = {
        getCodeGenerationProvider: async () => ({
            provideCodeGeneration: async () => ({ value: 'Generated code response' })
        })
    };
}

// Mock implementation of vscode API for testing
const vscode = {
    extensions: {
        all: [new MockExtension()],
        getExtension: jest.fn(id => {
            if (id === 'GitHub.copilot') {
                return new MockExtension();
            }
            return undefined;
        })
    },
    commands: {
        executeCommand: jest.fn()
    },
    window: {
        setStatusBarMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn()
    },
    Uri: {
        parse: jest.fn(str => ({ toString: () => str, fsPath: str })),
        file: jest.fn(path => ({ toString: () => `file://${path}`, fsPath: path }))
    },
    workspace: {
        getWorkspaceFolder: jest.fn(),
        openTextDocument: jest.fn(),
        workspaceFolders: []
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    ProgressLocation: {
        Notification: 15
    },
    TextDocument: class TextDocument {
        uri: any;
        fileName: string;
        languageId: string;
        getText() { return ''; }
        constructor() {
            this.uri = vscode.Uri.parse('file://test');
            this.fileName = 'test.ts';
            this.languageId = 'typescript';
        }
    },
    Position: class Position {
        line: number;
        character: number;
        constructor(line: number, character: number) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class Range {
        start: any;
        end: any;
        constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
            this.start = new vscode.Position(startLine, startChar);
            this.end = new vscode.Position(endLine, endChar);
        }
    },
    Selection: class Selection {
        start: any;
        end: any;
        constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
            this.start = new vscode.Position(startLine, startChar);
            this.end = new vscode.Position(endLine, endChar);
        }
    }
};

export default vscode;
