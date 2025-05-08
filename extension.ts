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
    // Helper for safely getting nested properties
    const getNestedProperty = (obj: any, path: string, defaultValue: any = null) => {
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined || typeof current !== 'object') {
                return defaultValue;
            }
            current = current[part];
        }
        return current !== undefined ? current : defaultValue;
    };
    
    // Create tabs for different views based on result type
    const analysisType = result.analysisType || result.modelType || 'analysis';
    
    // Format summary tab content
    const summaryContent = result.summary 
        ? typeof result.summary === 'string' 
            ? result.summary 
            : (result.summary.content || JSON.stringify(result.summary))
        : 'No summary available';
        
    const summaryTab = `<div class="summary-content">${summaryContent}</div>`;
    
    // Format code structure tab if available (for code analysis)
    let codeStructureTab = '';
    const codeStructure = getNestedProperty(result, 'results.suggestions.codeStructure', null);
    if (codeStructure && analysisType === 'code-analysis') {
        const languagesData = codeStructure.languages || {};
        const symbolsData = codeStructure.symbolCounts || {};
        
        codeStructureTab = `
            <h3>Code Structure</h3>
            <div class="structure-metrics">
                <div class="metric-card">
                    <span class="metric-title">Files Analyzed</span>
                    <span class="metric-value">${codeStructure.fileCount || 0}</span>
                </div>
                <div class="metric-card">
                    <span class="metric-title">Symbols Found</span>
                    <span class="metric-value">${Object.values(symbolsData).reduce((a: any, b: any) => a + b, 0)}</span>
                </div>
            </div>
            
            <div class="charts-container">
                <div class="chart-wrapper">
                    <h4>Languages</h4>
                    <div class="chart languages-chart" id="languagesChart">
                        <div class="chart-placeholder">Language distribution visualization will appear here</div>
                        <ul class="chart-legend">
                            ${Object.entries(languagesData).map(([lang, count]) => 
                                `<li><span class="legend-color" style="background-color: ${getColorForLanguage(lang)}"></span>${lang}: ${count}</li>`
                            ).join('')}
                        </ul>
                    </div>
                </div>
                
                <div class="chart-wrapper">
                    <h4>Symbol Types</h4>
                    <div class="chart symbols-chart" id="symbolsChart">
                        <div class="chart-placeholder">Symbol distribution visualization will appear here</div>
                        <ul class="chart-legend">
                            ${Object.entries(symbolsData).map(([symbol, count]) => 
                                `<li><span class="legend-color" style="background-color: ${getColorForSymbol(symbol)}"></span>${getSymbolName(symbol)}: ${count}</li>`
                            ).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Format test coverage tab if available (for test analysis)
    let testCoverageTab = '';
    const testCoverage = getNestedProperty(result, 'results.suggestions.testCoverage', null);
    if (testCoverage && analysisType === 'test-analysis') {
        const coverageValue = testCoverage.estimatedCoverage || 0;
        const coverageColor = getCoverageColor(coverageValue);
        const untestedFiles = testCoverage.untested || [];
        
        testCoverageTab = `
            <h3>Test Coverage</h3>
            <div class="coverage-container">
                <div class="coverage-gauge">
                    <div class="gauge-value" style="--percentage: ${coverageValue}%; --color: ${coverageColor};">
                        <span>${coverageValue}%</span>
                    </div>
                </div>
                <div class="coverage-metrics">
                    <div class="metric-card">
                        <span class="metric-title">Test Files</span>
                        <span class="metric-value">${testCoverage.testFileCount || 0}</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Source Files</span>
                        <span class="metric-value">${testCoverage.sourceFileCount || 0}</span>
                    </div>
                </div>
            </div>
            
            ${untestedFiles.length > 0 ? `
                <div class="untested-files">
                    <h4>Potentially Untested Files</h4>
                    <ul>
                        ${untestedFiles.map(file => `<li>${file}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        `;
    }
    
    // Format documentation quality tab if available (for documentation analysis)
    let docQualityTab = '';
    const docQuality = getNestedProperty(result, 'results.suggestions.docQuality', null);
    const missingDocs = getNestedProperty(result, 'results.suggestions.missingDocs', null);
    if ((docQuality || missingDocs) && analysisType === 'documentation-analysis') {
        const qualityValue = docQuality?.estimatedDocCoverage || 0;
        const qualityColor = getCoverageColor(qualityValue);
        
        docQualityTab = `
            <h3>Documentation Quality</h3>
            <div class="doc-quality-container">
                <div class="quality-gauge">
                    <div class="gauge-value" style="--percentage: ${qualityValue}%; --color: ${qualityColor};">
                        <span>${qualityValue}%</span>
                    </div>
                </div>
                <div class="doc-metrics">
                    <div class="metric-card">
                        <span class="metric-title">Doc Files</span>
                        <span class="metric-value">${docQuality?.documentationFiles || 0}</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Doc Comments</span>
                        <span class="metric-value">${docQuality?.docCommentCount || 0}</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Total Functions</span>
                        <span class="metric-value">${docQuality?.totalFunctions || 0}</span>
                    </div>
                </div>
            </div>
            
            ${missingDocs ? `
                <div class="missing-docs">
                    <h4>Missing Documentation</h4>
                    ${missingDocs.missingReadme ? '<p class="warning"><strong>⚠️ README file is missing</strong></p>' : ''}
                    
                    ${missingDocs.undocumentedFunctions && missingDocs.undocumentedFunctions.length > 0 ? `
                        <h5>Undocumented Functions (${missingDocs.undocumentedFunctions.length})</h5>
                        <ul class="collapsed-list">
                            ${missingDocs.undocumentedFunctions.map(item => `<li>${item}</li>`).join('')}
                        </ul>
                    ` : ''}
                    
                    ${missingDocs.undocumentedClasses && missingDocs.undocumentedClasses.length > 0 ? `
                        <h5>Undocumented Classes (${missingDocs.undocumentedClasses.length})</h5>
                        <ul class="collapsed-list">
                            ${missingDocs.undocumentedClasses.map(item => `<li>${item}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            ` : ''}
        `;
    }
    
    // Format security analysis tab if available
    let securityAnalysisTab = '';
    const securityAnalysis = getNestedProperty(result, 'results.suggestions.securityAnalysis', null);
    if (securityAnalysis && analysisType === 'security-analysis') {
        const securityScore = securityAnalysis.score || 0;
        const securityColor = getCoverageColor(securityScore);
        const vulnerabilities = securityAnalysis.vulnerabilities || [];
        
        securityAnalysisTab = `
            <h3>Security Analysis</h3>
            <div class="security-container">
                <div class="security-gauge">
                    <div class="gauge-value" style="--percentage: ${securityScore}%; --color: ${securityColor};">
                        <span>${securityScore}</span>
                    </div>
                </div>
                <div class="security-summary">
                    <p>${securityAnalysis.summary || 'Security analysis complete.'}</p>
                    <p class="scan-date">Last scan: ${securityAnalysis.lastScanDate ? new Date(securityAnalysis.lastScanDate).toLocaleString() : 'N/A'}</p>
                </div>
            </div>
            
            ${vulnerabilities.length > 0 ? `
                <div class="vulnerabilities">
                    <h4>Detected Vulnerabilities</h4>
                    <div class="vuln-list">
                        ${vulnerabilities.map(vuln => `
                            <div class="vuln-item severity-${vuln.severity}">
                                <div class="vuln-header">
                                    <span class="vuln-severity">${vuln.severity.toUpperCase()}</span>
                                    <span class="vuln-type">${vuln.type}</span>
                                </div>
                                <div class="vuln-details">
                                    ${vuln.name ? `<p><strong>Name:</strong> ${vuln.name}</p>` : ''}
                                    ${vuln.version ? `<p><strong>Version:</strong> ${vuln.version}</p>` : ''}
                                    ${vuln.file ? `<p><strong>File:</strong> ${vuln.file}</p>` : ''}
                                    ${vuln.issue ? `<p><strong>Issue:</strong> ${vuln.issue}</p>` : ''}
                                    ${vuln.recommendation ? `<p><strong>Recommendation:</strong> ${vuln.recommendation}</p>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : '<p>No vulnerabilities detected.</p>'}
        `;
    }
    
    // Create raw data tab
    const rawDataTab = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
    
    // Format metadata
    let metadataHtml = '';
    if (result.modelUsed) {
        const modelIcon = getModelIcon(result.modelUsed);
        metadataHtml += `
            <div class="metadata-item model-info">
                <span class="model-icon">${modelIcon}</span>
                <div>
                    <span class="label">Model</span>
                    <span class="value">${result.modelUsed}</span>
                </div>
            </div>`;
    }
    if (result.confidenceScore) {
        const confidenceValue = parseFloat(result.confidenceScore);
        const confidenceColor = getConfidenceColor(confidenceValue);
        metadataHtml += `
            <div class="metadata-item">
                <span class="label">Confidence</span>
                <div class="confidence-bar">
                    <div class="confidence-value" style="width: ${confidenceValue * 100}%; background-color: ${confidenceColor}"></div>
                    <span class="confidence-text">${(confidenceValue * 100).toFixed(0)}%</span>
                </div>
            </div>`;
    }
    if (result.analysisType) {
        metadataHtml += `
            <div class="metadata-item">
                <span class="label">Analysis Type</span>
                <span class="value">${formatAnalysisType(result.analysisType)}</span>
            </div>`;
    }
    
    // Add selection metadata if available
    if (result.selectionMetadata) {
        const meta = result.selectionMetadata;
        if (meta.fileName) {
            metadataHtml += `
                <div class="metadata-item">
                    <span class="label">File</span>
                    <span class="value filename">${meta.fileName}</span>
                </div>`;
        }
        if (typeof meta.startLine === 'number' && typeof meta.endLine === 'number') {
            metadataHtml += `
                <div class="metadata-item">
                    <span class="label">Lines</span>
                    <span class="value">${meta.startLine + 1}-${meta.endLine + 1}</span>
                </div>`;
        }
        if (meta.containingSymbol) {
            metadataHtml += `
                <div class="metadata-item">
                    <span class="label">Symbol</span>
                    <span class="value">${meta.containingSymbol.name} <small>(${getSymbolName(meta.containingSymbol.kind)})</small></span>
                </div>`;
        }
    }
    
    // Generate suggestions list
    let suggestionsHtml = '';
    if (result.summary && result.summary.suggestions && Array.isArray(result.summary.suggestions) && result.summary.suggestions.length > 0) {
        suggestionsHtml = `
            <div class="suggestions-section">
                <h3>Suggestions</h3>
                <div class="suggestions-list">
                    ${result.summary.suggestions.map((suggestion: string, index: number) => `
                        <div class="suggestion-item">
                            <div class="suggestion-number">${index + 1}</div>
                            <div class="suggestion-content">${suggestion}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
      return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Code Companion Analysis</title>
        <style>
            :root {
                --border-radius: 6px;
                --card-bg: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
                --accent-color: var(--vscode-activityBarBadge-background, #007acc);
                --hover-bg: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.1));
            }
            body {
                font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif);
                padding: 0;
                margin: 0;
                color: var(--vscode-editor-foreground, #333);
                background-color: var(--vscode-editor-background, #fff);
                line-height: 1.5;
                font-size: 14px;
            }
            .container {
                padding: 20px;
                max-width: 100%;
            }
            h2 {
                margin-top: 0;
                margin-bottom: 20px;
                color: var(--vscode-editor-foreground, #333);
                border-bottom: 1px solid var(--vscode-panel-border, #ddd);
                padding-bottom: 10px;
            }
            h3 {
                margin-top: 24px;
                margin-bottom: 16px;
                color: var(--vscode-editor-foreground, #333);
            }
            h4 {
                margin-top: 20px;
                margin-bottom: 12px;
                color: var(--vscode-editor-foreground, #333);
                opacity: 0.9;
            }
            
            /* Tabs */
            .tabs {
                display: flex;
                background-color: var(--vscode-editor-background, #fff);
                border-bottom: 1px solid var(--vscode-panel-border, #ddd);
                margin-bottom: 20px;
                overflow-x: auto;
                scrollbar-width: thin;
            }
            .tab {
                padding: 10px 16px;
                cursor: pointer;
                transition: background-color 0.2s;
                border: none;
                border-bottom: 2px solid transparent;
                margin-right: 4px;
                font-size: 14px;
                white-space: nowrap;
                opacity: 0.7;
            }
            .tab:hover {
                background-color: var(--hover-bg);
            }
            .tab.active {
                border-bottom: 2px solid var(--accent-color);
                opacity: 1;
                font-weight: 500;
            }
            .tab-content {
                display: none;
                animation: fadeIn 0.3s;
            }
            .tab-content.active {
                display: block;
            }
            
            /* Metadata */
            .metadata {
                background-color: var(--card-bg);
                padding: 16px;
                margin-bottom: 24px;
                border-radius: var(--border-radius);
                display: flex;
                flex-wrap: wrap;
                gap: 16px;
            }
            .metadata-item {
                margin-right: 16px;
                margin-bottom: 8px;
                flex: 1 1 200px;
                max-width: 100%;
            }
            .metadata-item .label {
                font-size: 12px;
                opacity: 0.7;
                display: block;
                margin-bottom: 4px;
            }
            .metadata-item .value {
                font-weight: 500;
            }
            .model-info {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .model-icon {
                font-size: 24px;
                margin-right: 8px;
                opacity: 0.9;
            }
            .confidence-bar {
                height: 8px;
                background-color: rgba(128, 128, 128, 0.2);
                border-radius: 4px;
                position: relative;
                margin-top: 6px;
                overflow: hidden;
            }
            .confidence-value {
                height: 100%;
                position: absolute;
                left: 0;
                top: 0;
            }
            .confidence-text {
                position: absolute;
                right: 0;
                top: -18px;
                font-size: 12px;
                font-weight: 500;
            }
            .filename {
                font-family: var(--vscode-editor-font-family, monospace);
                background-color: rgba(128, 128, 128, 0.1);
                padding: 2px 4px;
                border-radius: 3px;
            }
            
            /* Cards and metrics */
            .metric-card {
                background-color: var(--card-bg);
                border-radius: var(--border-radius);
                padding: 12px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                flex: 1 1 auto;
                min-width: 100px;
                text-align: center;
            }
            .metric-title {
                font-size: 12px;
                opacity: 0.7;
                margin-bottom: 4px;
            }
            .metric-value {
                font-size: 20px;
                font-weight: 600;
            }
            .structure-metrics, .coverage-metrics, .doc-metrics {
                display: flex;
                gap: 16px;
                margin-bottom: 24px;
                flex-wrap: wrap;
            }
            
            /* Charts */
            .charts-container {
                display: flex;
                flex-wrap: wrap;
                gap: 24px;
                margin-bottom: 24px;
            }
            .chart-wrapper {
                flex: 1 1 300px;
                min-height: 200px;
            }
            .chart {
                background-color: var(--card-bg);
                border-radius: var(--border-radius);
                padding: 16px;
                min-height: 150px;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
            }
            .chart-placeholder {
                opacity: 0.5;
                text-align: center;
                padding: 40px 20px;
            }
            .chart-legend {
                list-style: none;
                padding: 0;
                margin: 16px 0 0;
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                width: 100%;
            }
            .chart-legend li {
                display: flex;
                align-items: center;
                font-size: 12px;
                margin-right: 8px;
            }
            .legend-color {
                display: inline-block;
                width: 12px;
                height: 12px;
                margin-right: 6px;
                border-radius: 2px;
            }
            
            /* Gauges */
            .coverage-gauge, .quality-gauge, .security-gauge {
                width: 120px;
                height: 120px;
                background-color: rgba(128, 128, 128, 0.1);
                border-radius: 50%;
                position: relative;
                margin: 0 auto 16px;
            }
            .gauge-value {
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                font-weight: bold;
                color: var(--vscode-editor-foreground, #333);
                /* CSS for partial circle */
                background: conic-gradient(
                    var(--color) 0% var(--percentage),
                    transparent var(--percentage) 100%
                );
            }
            
            /* Lists and content */
            pre {
                white-space: pre-wrap;
                word-wrap: break-word;
                background-color: var(--card-bg);
                padding: 16px;
                border-radius: var(--border-radius);
                overflow: auto;
                font-family: var(--vscode-editor-font-family, monospace);
                font-size: 13px;
                max-height: 600px;
                margin: 0;
                border: 1px solid rgba(0,0,0,0.05);
            }
            .summary-content {
                background-color: var(--card-bg);
                padding: 16px;
                border-radius: var(--border-radius);
                margin-bottom: 24px;
            }
            .collapsed-list {
                max-height: 150px;
                overflow: auto;
                padding-left: 20px;
                margin: 8px 0;
                scrollbar-width: thin;
            }
            .collapsed-list li {
                margin-bottom: 4px;
                font-family: var(--vscode-editor-font-family, monospace);
                font-size: 12px;
            }
            .warning {
                color: #ff9800;
            }
            
            /* Suggestions */
            .suggestions-section {
                margin-top: 24px;
                margin-bottom: 24px;
            }
            .suggestions-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .suggestion-item {
                background-color: var(--card-bg);
                border-radius: var(--border-radius);
                padding: 12px 16px;
                display: flex;
                gap: 12px;
                align-items: flex-start;
                border-left: 3px solid var(--accent-color);
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .suggestion-item:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }
            .suggestion-number {
                background-color: var(--accent-color);
                color: white;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                flex-shrink: 0;
            }
            
            /* Vulnerabilities */
            .vulnerabilities {
                margin-top: 20px;
            }
            .vuln-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .vuln-item {
                background-color: var(--card-bg);
                border-radius: var(--border-radius);
                padding: 0;
                overflow: hidden;
            }
            .vuln-header {
                padding: 8px 16px;
                display: flex;
                justify-content: space-between;
                font-weight: 500;
            }
            .vuln-details {
                padding: 12px 16px;
                border-top: 1px solid rgba(0, 0, 0, 0.05);
            }
            .vuln-details p {
                margin: 4px 0;
            }
            .severity-critical .vuln-header {
                background-color: rgba(244, 67, 54, 0.2);
            }
            .severity-high .vuln-header {
                background-color: rgba(255, 152, 0, 0.2);
            }
            .severity-medium .vuln-header {
                background-color: rgba(255, 235, 59, 0.2);
            }
            .severity-low .vuln-header {
                background-color: rgba(33, 150, 243, 0.2);
            }
            .vuln-severity {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
            }
            .severity-critical .vuln-severity {
                background-color: #F44336;
                color: white;
            }
            .severity-high .vuln-severity {
                background-color: #FF9800;
                color: white;
            }
            .severity-medium .vuln-severity {
                background-color: #FFEB3B;
                color: black;
            }
            .severity-low .vuln-severity {
                background-color: #2196F3;
                color: white;
            }
            
            /* Animations */
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            /* Responsive design */
            @media (max-width: 600px) {
                .container {
                    padding: 16px;
                }
                .charts-container {
                    flex-direction: column;
                }
                .metadata {
                    flex-direction: column;
                }
                .structure-metrics, .coverage-metrics, .doc-metrics {
                    flex-direction: column;
                }
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
                ${codeStructureTab ? '<div class="tab" data-tab="code-structure">Code Structure</div>' : ''}
                ${testCoverageTab ? '<div class="tab" data-tab="test-coverage">Test Coverage</div>' : ''}
                ${docQualityTab ? '<div class="tab" data-tab="doc-quality">Documentation</div>' : ''}
                ${securityAnalysisTab ? '<div class="tab" data-tab="security">Security</div>' : ''}
                <div class="tab" data-tab="raw">Raw Data</div>
            </div>
            
            <div class="tab-content active" id="summary">
                ${summaryTab}
                ${suggestionsHtml}
            </div>
            
            ${codeStructureTab ? `<div class="tab-content" id="code-structure">${codeStructureTab}</div>` : ''}
            ${testCoverageTab ? `<div class="tab-content" id="test-coverage">${testCoverageTab}</div>` : ''}
            ${docQualityTab ? `<div class="tab-content" id="doc-quality">${docQualityTab}</div>` : ''}
            ${securityAnalysisTab ? `<div class="tab-content" id="security">${securityAnalysisTab}</div>` : ''}
            
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
            
            // Register click listeners for expandable sections
            document.querySelectorAll('.collapsed-list').forEach(list => {
                const parent = list.parentElement;
                if (parent && parent.querySelector('h5')) {
                    parent.querySelector('h5').addEventListener('click', () => {
                        list.style.maxHeight = list.style.maxHeight ? null : 'none';
                    });
                    parent.querySelector('h5').style.cursor = 'pointer';
                }
            });
        </script>
    </body>
    </html>`;
}

// Helper functions for webview visualizations
function getColorForLanguage(lang: string): string {
    const colorMap: {[key: string]: string} = {
        '.ts': '#3178c6',  // TypeScript blue
        '.js': '#f7df1e',  // JavaScript yellow
        '.jsx': '#61dafb', // React blue
        '.tsx': '#61dafb', // React blue
        '.py': '#3776ab',  // Python blue
        '.java': '#b07219', // Java brown
        '.html': '#e34c26', // HTML orange
        '.css': '#563d7c',  // CSS purple
        '.php': '#777bb4',  // PHP purple
        '.rb': '#cc342d',   // Ruby red
        '.go': '#00ADD8',   // Go blue
        '.cs': '#178600',   // C# green
        '.cpp': '#f34b7d',  // C++ pink
        '.c': '#555555',    // C gray
    };
    
    return colorMap[lang] || `hsl(${Math.abs(hashCode(lang)) % 360}, 70%, 50%)`;
}

function getColorForSymbol(symbolKind: string): string {
    const colorMap: {[key: string]: string} = {
        'class': '#4CAF50',      // Green
        'interface': '#2196F3',  // Blue
        'function': '#FF9800',   // Orange
        'method': '#9C27B0',     // Purple
        'property': '#607D8B',   // Blue-Gray
        'variable': '#795548',   // Brown
        'namespace': '#009688',  // Teal
        'enum': '#673AB7',       // Deep Purple
        'constructor': '#F44336' // Red
    };
    
    const kind = symbolKind.toString().toLowerCase();
    for (const key of Object.keys(colorMap)) {
        if (kind.includes(key)) {
            return colorMap[key];
        }
    }
    
    return `hsl(${Math.abs(hashCode(symbolKind)) % 360}, 70%, 50%)`;
}

function getSymbolName(symbolKind: string | number): string {
    // If it's a numeric SymbolKind from VS Code
    if (typeof symbolKind === 'number') {
        const symbolKinds: {[key: number]: string} = {
            1: 'File',
            2: 'Module',
            3: 'Namespace',
            4: 'Package',
            5: 'Class',
            6: 'Method',
            7: 'Property',
            8: 'Field',
            9: 'Constructor',
            10: 'Enum',
            11: 'Interface',
            12: 'Function',
            13: 'Variable',
            14: 'Constant',
            15: 'String',
            16: 'Number',
            17: 'Boolean',
            18: 'Array',
            19: 'Object',
            20: 'Key',
            21: 'Null',
            22: 'EnumMember',
            23: 'Struct',
            24: 'Event',
            25: 'Operator',
            26: 'TypeParameter'
        };
        return symbolKinds[symbolKind] || 'Symbol';
    }
    
    // If it's a string, try to clean it up
    const kindStr = String(symbolKind).toLowerCase();
    if (kindStr.includes('class')) return 'Class';
    if (kindStr.includes('interface')) return 'Interface';
    if (kindStr.includes('function')) return 'Function';
    if (kindStr.includes('method')) return 'Method';
    if (kindStr.includes('property')) return 'Property';
    if (kindStr.includes('variable')) return 'Variable';
    if (kindStr.includes('namespace')) return 'Namespace';
    if (kindStr.includes('enum')) return 'Enum';
    if (kindStr.includes('constructor')) return 'Constructor';
    
    // Capitalize first letter as fallback
    return kindStr.charAt(0).toUpperCase() + kindStr.slice(1);
}

function getCoverageColor(percentage: number): string {
    if (percentage < 30) return '#F44336'; // Red for low coverage
    if (percentage < 60) return '#FF9800'; // Orange for medium coverage
    if (percentage < 80) return '#FFEB3B'; // Yellow for good coverage
    return '#4CAF50'; // Green for excellent coverage
}

function getConfidenceColor(confidence: number): string {
    if (confidence < 0.3) return '#F44336'; // Red for low confidence
    if (confidence < 0.6) return '#FF9800'; // Orange for medium confidence
    if (confidence < 0.8) return '#FFEB3B'; // Yellow for good confidence
    return '#4CAF50'; // Green for high confidence
}

function getModelIcon(model: string): string {
    const modelLower = model.toLowerCase();
    if (modelLower.includes('claude')) return '🧠';
    if (modelLower.includes('chatgpt')) return '🤖';
    if (modelLower.includes('gemini')) return '🌟';
    return '🔍';
}

function formatAnalysisType(type: string): string {
    return type
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

export function deactivate() {}
