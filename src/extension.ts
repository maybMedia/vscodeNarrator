import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import Speaker from 'speaker';
import * as wav from 'wav';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "vscodenarrator" is now active!');

    let disposable = vscode.commands.registerCommand('vscodenarrator.StartNarrator', () => {
        vscode.window.showInformationMessage('vscodeNarrator is now running!');
    });

    function getConfiguration() {
        const config = vscode.workspace.getConfiguration('vscodeNarrator');
        return {
            EnableDonk: config.get<boolean>('EnableDonk', true),
            EnableVoices: config.get<boolean>('EnableVoices', false) 
        };
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('vscodeNarrator')) {
                const config = getConfiguration();
                vscode.window.showInformationMessage('Extension settings updated!');
            }
        })
    );

    // Track files and their error lines with specific error messages
    const errorSoundPlayedLines = new Map<string, Map<number, Set<string>>>();

    function playErrorAudio(uri: vscode.Uri, line: number, errorMessage: string) {

        const config = getConfiguration();
        
        if (!config.EnableDonk)
        {
            return;
        }

        const filePath = uri.fsPath;
        
        // Initialize the map for this file if it doesn't exist
        if (!errorSoundPlayedLines.has(filePath)) {
            errorSoundPlayedLines.set(filePath, new Map());
        }

        // Get the map of lines for this file
        const playedLines = errorSoundPlayedLines.get(filePath)!;

        // Initialize the set for this line if it doesn't exist
        if (!playedLines.has(line)) {
            playedLines.set(line, new Set());
        }

        // Get the set of error messages for this line
        const playedErrorMessages = playedLines.get(line)!;

        // Check if this specific error message has already played a sound on this line
        if (playedErrorMessages.has(errorMessage)) {
            return;
        }

        const audioFilePath = path.join(context.extensionPath, 'assets', 'error-sound.wav');

        try {
            // Create a wav file reader
            const file = fs.createReadStream(audioFilePath);
            const reader = new wav.Reader();

            // Setup the speaker
            const speaker = new Speaker({
                channels: 2,  // Stereo
                bitDepth: 16, // 16-bit
                sampleRate: 44100 // Standard sample rate
            });

            // Pipe the file through the reader to the speaker
            file.pipe(reader).pipe(speaker);

            speaker.on('close', () => {
                console.log('Audio playback completed');
            });

            // Mark this error message as having played the sound on this line
            playedErrorMessages.add(errorMessage);

        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Audio playback error:', error.message);
                vscode.window.showErrorMessage(`Failed to play audio: ${error.message}`);
            } else {
                console.error('Unknown audio playback error:', error);
                vscode.window.showErrorMessage('Failed to play audio');
            }
        }
    }

    // Reset the error sound tracking when diagnostics change
    context.subscriptions.push(
        vscode.languages.onDidChangeDiagnostics(event => {
            event.uris.forEach(uri => {
                const diagnostics = vscode.languages.getDiagnostics(uri);
                
                // If no errors exist, remove the file from tracked files
                if (!diagnostics.some(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error)) {
                    errorSoundPlayedLines.delete(uri.fsPath);
                }
                
                // Play sound for each error line
                diagnostics.forEach(diagnostic => {
                    if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
                        playErrorAudio(
                            uri, 
                            diagnostic.range.start.line, 
                            diagnostic.message
                        );
                    }
                });
            });
        })
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}