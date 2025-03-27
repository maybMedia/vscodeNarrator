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

    function playErrorAudio() {
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

            // reader.on('format', (format) => {
            //     console.log('Audio format:', format);
            // });

            speaker.on('close', () => {
                console.log('Audio playback completed');
            });

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

    vscode.languages.onDidChangeDiagnostics(event => {
        event.uris.forEach(uri => {
            const diagnostics = vscode.languages.getDiagnostics(uri);
            if (diagnostics.some(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error)) {
                playErrorAudio();
            }
        });
    });
}

export function deactivate() {}