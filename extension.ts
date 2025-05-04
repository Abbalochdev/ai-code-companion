import * as vscode from 'vscode';
import { MCPServer } from './mcpServer';
import { WorkspaceContext } from './aiModelRouter';

export function activate(context: vscode.ExtensionContext) {
    const mcpServer = new MCPServer();
    let statusBarItem: vscode.StatusBarItem;
    let lastAnalysisResult: any;

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(rocket) MCP";
    statusBarItem.tooltip = "Model Coordination Protocol";
    statusBarItem.command = "mcp.showMenu";
    statusBarItem.show();

    // Register the status bar item
    context.subscriptions.push(statusBarItem);

    // Command to show MCP menu
    let showMenu = vscode.commands.registerCommand('mcp.showMenu', async () => {
        const options = [
            "Analyze Workspace",
            "Analyze Current File",
            "Analyze Selection",
            "Choose AI Model",
            "View Last Analysis"
        ];

        const choice = await vscode.window.showQuickPick(options, {
            placeHolder: "Select MCP Action"
        });

        switch (choice) {
            case "Analyze Workspace":
                vscode.commands.executeCommand('mcp.analyzeWorkspace');
                break;
            case "Analyze Current File":
                vscode.commands.executeCommand('mcp.analyzeFile');
                break;
            case "Analyze Selection":
                vscode.commands.executeCommand('mcp.analyzeSelection');
                break;
            case "Choose AI Model":
                vscode.commands.executeCommand('mcp.chooseModel');
                break;
            case "View Last Analysis":
                vscode.commands.executeCommand('mcp.showLastAnalysis');
                break;
        }
    });

    // Command to analyze entire workspace
    const analyzeWorkspaceCommand = vscode.commands.registerCommand('mcp.analyzeWorkspace', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder is open');
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing workspace...',
            cancellable: true
        }, async (_progress, _token) => {
            try {
                const result = await mcpServer.analyzeWorkspace(workspaceFolder.uri);
                lastAnalysisResult = result;
                showResultsInWebview(context.extensionUri, result, 'Workspace Analysis');
                return result;
            } catch (error: any) {
                vscode.window.showErrorMessage(`Workspace analysis failed: ${error.message}`);
            }
        });
    });

    // Command to analyze current file
    const analyzeFileCommand = vscode.commands.registerCommand('mcp.analyzeFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing file...',
            cancellable: true
        }, async (_progress, _token) => {
            try {
                const result = await mcpServer.analyzeFile(editor.document.uri);
                lastAnalysisResult = result;
                showResultsInWebview(context.extensionUri, result, 'File Analysis');
                return result;
            } catch (error: any) {
                vscode.window.showErrorMessage(`File analysis failed: ${error.message}`);
            }
        });
    });

    // Command to analyze selected code
    const analyzeSelectionCommand = vscode.commands.registerCommand('mcp.analyzeSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showErrorMessage('No code selected');
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing selection...',
            cancellable: true
        }, async (_progress, _token) => {
            try {
                // Show quick pick to select model type (optional)
                const modelTypes = mcpServer.getAvailableModelTypes();
                const modelType = await vscode.window.showQuickPick(
                    ['Auto', ...modelTypes],
                    { placeHolder: 'Select AI model to use (or Auto for automatic selection)' }
                );
                
                // If user cancelled the quick pick
                if (!modelType) {
                    return;
                }
                
                // Get the selected text
                const selection = editor.selection;
                const selectedText = editor.document.getText(selection);
                
                // Call the MCP server with the selected model (if not Auto)
                const result = await mcpServer.analyzeSelection(
                    selectedText, 
                    editor.document, 
                    selection,
                    modelType === 'Auto' ? undefined : modelType
                );
                
                lastAnalysisResult = result;
                showResultsInWebview(context.extensionUri, result, 'Selection Analysis');
                return result;
            } catch (error: any) {
                vscode.window.showErrorMessage(`Selection analysis failed: ${error.message}`);
            }
        });
    });

    // Command to choose AI model
    let chooseModelCommand = vscode.commands.registerCommand('mcp.chooseModel', async () => {
        const models = [
            { label: "Claude (Code Analysis)", id: "code" },
            { label: "ChatGPT (Testing)", id: "testing" },
            { label: "Gemini (Documentation)", id: "documentation" }
        ];

        const choice = await vscode.window.showQuickPick(models, {
            placeHolder: "Select AI Model for Analysis"
        });

        if (choice) {
            // Store the selected model in workspace state
            context.workspaceState.update('mcp.selectedModel', choice.id);
            vscode.window.showInformationMessage(`Selected ${choice.label} for analysis`);
        }
    });

    // Command to view last analysis
    let showLastAnalysisCommand = vscode.commands.registerCommand('mcp.showLastAnalysis', async () => {
        if (lastAnalysisResult) {
            showResultsInWebview(context.extensionUri, lastAnalysisResult, "Last Analysis Results");
        } else {
            vscode.window.showInformationMessage('No previous analysis results found');
        }
    });

    // Command to analyze a specific symbol (used by code lens)
    const analyzeSymbolCommand = vscode.commands.registerCommand('mcp.analyzeSymbol', 
        async (fileUri: vscode.Uri, symbolName: string, range: vscode.Range) => {
            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                const selectedText = document.getText(range);
                const selection = new vscode.Selection(range.start, range.end);
                
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Analyzing ${symbolName}...`,
                    cancellable: true
                }, async (_progress, _token) => {
                    try {
                        // Show quick pick to select model type (optional)
                        const modelTypes = mcpServer.getAvailableModelTypes();
                        const modelType = await vscode.window.showQuickPick(
                            ['Auto', ...modelTypes],
                            { placeHolder: 'Select AI model to use (or Auto for automatic selection)' }
                        );
                        
                        // If user cancelled the quick pick
                        if (!modelType) {
                            return;
                        }
                        
                        // Call the MCP server with the selected model (if not Auto)
                        const result = await mcpServer.analyzeSelection(
                            selectedText, 
                            document, 
                            selection,
                            modelType === 'Auto' ? undefined : modelType
                        );
                        
                        lastAnalysisResult = result;
                        showResultsInWebview(context.extensionUri, result, `Analysis of ${symbolName}`);
                        return result;
                    } catch (error: any) {
                        vscode.window.showErrorMessage(`Symbol analysis failed: ${error.message}`);
                    }
                });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to open document: ${error.message}`);
            }
        }
    );

    // Add code lens provider for inline AI assistance
    const codeLensProvider = new MCPCodeLensProvider(mcpServer);
    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
        { scheme: 'file', language: '*' },
        codeLensProvider
    );

    // Register all commands
    context.subscriptions.push(
        showMenu,
        analyzeWorkspaceCommand,
        analyzeFileCommand,
        analyzeSelectionCommand,
        showLastAnalysisCommand,
        chooseModelCommand,
        statusBarItem,
        codeLensProviderDisposable,
        analyzeSymbolCommand
    );

    // Store analysis results in workspace state for persistence
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            // Automatically update context when files are saved
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                try {
                    // Update the file in the cached context instead of full reanalysis
                    await mcpServer.updateFileInContext(document);
                } catch (error) {
                    console.error('Error updating context:', error);
                }
            }
        })
    );
}

// Code lens provider for inline AI assistance
class MCPCodeLensProvider implements vscode.CodeLensProvider {
    private mcpServer: MCPServer;

    constructor(mcpServer: MCPServer) {
        this.mcpServer = mcpServer;
    }

    async provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        
        try {
            // Get document symbols
            const symbols = await this.mcpServer.extractFileSymbols(document);
            
            // Add code lens for each symbol
            for (const symbol of symbols) {
                // Check if the symbol kind is one we want to add a code lens for
                // We can't directly use vscode.SymbolKind here since the symbols are flattened
                // So we'll check the kind string or number
                const symbolKindStr = String(symbol.kind).toLowerCase();
                if (symbolKindStr.includes('class') || 
                    symbolKindStr.includes('function') || 
                    symbolKindStr.includes('method') || 
                    symbolKindStr.includes('interface') ||
                    // Check numeric values for SymbolKind
                    symbol.kind === 4 || // Class
                    symbol.kind === 5 || // Method
                    symbol.kind === 11 || // Function
                    symbol.kind === 10) { // Interface
                    
                    const range = new vscode.Range(
                        new vscode.Position(symbol.range.start.line, symbol.range.start.character),
                        new vscode.Position(symbol.range.end.line, symbol.range.end.character)
                    );
                    
                    const codeLens = new vscode.CodeLens(range, {
                        title: 'MCP: Analyze',
                        command: 'mcp.analyzeSymbol',
                        arguments: [document.uri, symbol.name, range]
                    });
                    
                    codeLenses.push(codeLens);
                }
            }
        } catch (error) {
            console.error('Error providing code lenses:', error);
        }
        
        return codeLenses;
    }
}

// Function to show results in webview
function showResultsInWebview(extensionUri: vscode.Uri, result: any, title: string) {
    // Create and show panel
    const panel = vscode.window.createWebviewPanel(
        'mcpResults',
        title,
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            localResourceRoots: [extensionUri]
        }
    );
    
    // Get path to styles
    const stylesPathOnDisk = vscode.Uri.joinPath(extensionUri, 'media', 'styles.css');
    const stylesUri = panel.webview.asWebviewUri(stylesPathOnDisk);
    
    // Create HTML content
    panel.webview.html = getWebviewContent(result, stylesUri);
}

function getWebviewContent(result: any, stylesUri: vscode.Uri): string {
    // Create tabs for different views
    const summaryTab = result.summary ? 
        `<div class="summary-tab">${typeof result.summary === 'string' ? result.summary : (result.summary.content || JSON.stringify(result.summary))}</div>` : 
        `<div class="summary-tab">No summary available</div>`;
    
    const rawDataTab = `<div class="raw-tab"><pre>${JSON.stringify(result, null, 2)}</pre></div>`;
    
    // Format metadata
    let metadataHtml = '';
    if (result.modelUsed) {
        metadataHtml += `<div class="metadata-item"><span>Model:</span> ${result.modelUsed}</div>`;
    }
    if (result.modelType) {
        metadataHtml += `<div class="metadata-item"><span>Type:</span> ${result.modelType}</div>`;
    }
    if (result.confidenceScore) {
        metadataHtml += `<div class="metadata-item"><span>Confidence:</span> ${result.confidenceScore}</div>`;
    }
    
    // Add selection metadata if available
    if (result.selectionMetadata) {
        const meta = result.selectionMetadata;
        if (meta.fileName) {
            metadataHtml += `<div class="metadata-item"><span>File:</span> ${meta.fileName}</div>`;
        }
        if (typeof meta.startLine === 'number' && typeof meta.endLine === 'number') {
            metadataHtml += `<div class="metadata-item"><span>Lines:</span> ${meta.startLine + 1}-${meta.endLine + 1}</div>`;
        }
        if (meta.containingSymbol) {
            metadataHtml += `<div class="metadata-item"><span>Symbol:</span> ${meta.containingSymbol.name} (${meta.containingSymbol.kind})</div>`;
        }
    }
    
    // Generate suggestions list
    let suggestionsHtml = '';
    if (result.summary && result.summary.suggestions && Array.isArray(result.summary.suggestions) && result.summary.suggestions.length > 0) {
        suggestionsHtml = `
            <div class="suggestions">
                <h3>Suggestions</h3>
                <ul>
                    ${result.summary.suggestions.map((s: string) => `<li>${s}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesUri}" rel="stylesheet">
        <title>MCP Analysis Results</title>
        <style>
            body {
                font-family: var(--vscode-editor-font-family);
                padding: 0;
                margin: 0;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
            }
            .container {
                padding: 20px;
            }
            .tabs {
                display: flex;
                margin-bottom: 20px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            .tab {
                padding: 8px 16px;
                cursor: pointer;
                border: 1px solid transparent;
                border-bottom: none;
                margin-right: 5px;
                border-top-left-radius: 3px;
                border-top-right-radius: 3px;
            }
            .tab.active {
                background-color: var(--vscode-tab-activeBackground);
                border-color: var(--vscode-panel-border);
                border-bottom: 1px solid var(--vscode-tab-activeBackground);
                margin-bottom: -1px;
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
            }
            .metadata {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                padding: 10px;
                margin-bottom: 20px;
                border-radius: 4px;
                display: flex;
                flex-wrap: wrap;
            }
            .metadata-item {
                margin-right: 20px;
                margin-bottom: 5px;
            }
            .metadata-item span {
                font-weight: bold;
            }
            pre {
                white-space: pre-wrap;
                word-wrap: break-word;
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                padding: 10px;
                border-radius: 4px;
                overflow: auto;
            }
            .suggestions {
                margin-top: 20px;
                padding: 10px;
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 4px;
            }
            .suggestions ul {
                margin-top: 5px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Analysis Results</h2>
            
            <div class="metadata">
                ${metadataHtml}
            </div>
            
            <div class="tabs">
                <div class="tab active" data-tab="summary">Summary</div>
                <div class="tab" data-tab="raw">Raw Data</div>
            </div>
            
            <div class="tab-content active" id="summary">
                ${summaryTab}
                ${suggestionsHtml}
            </div>
            
            <div class="tab-content" id="raw">
                ${rawDataTab}
            </div>
        </div>
        
        <script>
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    // Remove active class from all tabs and contents
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    
                    // Add active class to clicked tab
                    tab.classList.add('active');
                    
                    // Show corresponding content
                    const tabId = tab.getAttribute('data-tab');
                    document.getElementById(tabId).classList.add('active');
                });
            });
        </script>
    </body>
    </html>`;
}

// Helper function to escape HTML
function escapeHtml(str: string) {
    return str.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function deactivate() {}
