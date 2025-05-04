import * as vscode from 'vscode';
import * as crypto from 'crypto';

export class TelemetryService {
    private static instance: TelemetryService;
    private anonymousId: string;
    private isEnabled: boolean;

    private constructor() {
        this.anonymousId = this.generateAnonymousId();
        this.isEnabled = vscode.workspace.getConfiguration('aiCompanion').get('enableTelemetry', false);
    }

    public static getInstance(): TelemetryService {
        if (!TelemetryService.instance) {
            TelemetryService.instance = new TelemetryService();
        }
        return TelemetryService.instance;
    }

    private generateAnonymousId(): string {
        const machineId = vscode.env.machineId;
        return crypto.createHash('sha256').update(machineId).digest('hex');
    }

    public trackEvent(eventName: string, properties?: Record<string, any>): void {
        if (!this.isEnabled) return;

        const baseProperties = {
            anonymousId: this.anonymousId,
            extensionVersion: vscode.extensions.getExtension('vscode-mcp-server')?.packageJSON.version
        };

        const fullProperties = { ...baseProperties, ...properties };

        // In a real implementation, you would send this to a telemetry service
        console.log('Telemetry Event:', eventName, fullProperties);
    }

    public trackError(errorName: string, error: Error): void {
        if (!this.isEnabled) return;

        this.trackEvent('error', {
            errorName,
            errorMessage: error.message,
            errorStack: error.stack
        });
    }

    public updateTelemetrySettings(enabled: boolean): void {
        this.isEnabled = enabled;
        vscode.workspace.getConfiguration('aiCompanion').update('enableTelemetry', enabled, true);
    }
}
