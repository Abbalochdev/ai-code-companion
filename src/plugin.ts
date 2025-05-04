import * as vscode from 'vscode';

export interface AIPlugin {
    name: string;
    version: string;
    supportedLanguages: string[];
    analyze(context: any): Promise<any>;
    configure(settings: Record<string, any>): void;
    isLanguageSupported(language: string): boolean;
}

export abstract class BaseAIPlugin implements AIPlugin {
    name: string;
    version: string;
    supportedLanguages: string[];

    constructor(name: string, version: string, supportedLanguages: string[]) {
        this.name = name;
        this.version = version;
        this.supportedLanguages = supportedLanguages;
    }

    abstract analyze(context: Record<string, any>): Promise<Record<string, any>>;

    configure(settings: Record<string, any>): void {
        // Default implementation, can be overridden
        console.log(`Configuring ${this.name} plugin with settings:`, settings);
    }

    isLanguageSupported(language: string): boolean {
        return this.supportedLanguages.includes(language);
    }
}

export class PluginManager {
    private static instance: PluginManager;
    private plugins: Map<string, AIPlugin> = new Map();

    private constructor() {}

    public static getInstance(): PluginManager {
        if (!PluginManager.instance) {
            PluginManager.instance = new PluginManager();
        }
        return PluginManager.instance;
    }

    registerPlugin(plugin: AIPlugin): void {
        if (this.plugins.has(plugin.name)) {
            vscode.window.showWarningMessage(`Plugin ${plugin.name} is already registered.`);
            return;
        }
        this.plugins.set(plugin.name, plugin);
    }

    getPlugin(name: string): AIPlugin | undefined {
        return this.plugins.get(name);
    }

    getAllPlugins(): AIPlugin[] {
        return Array.from(this.plugins.values());
    }

    async analyzeWithSuitablePlugin(context: any): Promise<any> {
        const language = context.language || 'unknown';
        
        for (const plugin of this.plugins.values()) {
            if (plugin.isLanguageSupported(language)) {
                return await plugin.analyze(context);
            }
        }

        throw new Error(`No suitable plugin found for language: ${language}`);
    }
}
