import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import Speaker from 'speaker';
import * as wav from 'wav';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "vscodenarrator" is now active!');

    // Audio management
    let currentAudioPlayback: {
        speaker?: Speaker,
        file?: fs.ReadStream,
        reader?: wav.Reader
    } = {};

    function stopCurrentAudio() {
        try {
            // Stop the speaker first
            if (currentAudioPlayback.speaker) {
                currentAudioPlayback.speaker.end();
            }

            // Destroy file stream if it exists
            if (currentAudioPlayback.file) {
                currentAudioPlayback.file.destroy();
            }

            // Unpipe to break any existing connections
            if (currentAudioPlayback.reader && currentAudioPlayback.file) {
                currentAudioPlayback.file.unpipe(currentAudioPlayback.reader);
            }
        } catch (error) {
            console.error('Error stopping audio:', error);
        }

        // Reset the playback object
        currentAudioPlayback = {};
    }

    let disposable = vscode.commands.registerCommand('vscodenarrator.StartNarrator', () => {
        vscode.window.showInformationMessage('vscodeNarrator is now running!');
    });

    function getConfiguration() {
        const config = vscode.workspace.getConfiguration('vscodeNarrator');
        
        // Ensure only one option can be true at a time
        const enableDonk = config.get<boolean>('EnableDonk', true);
        const enableVoices = config.get<boolean>('EnableVoices', false);

        // If both are true, prioritize EnableDonk
        if (enableDonk && enableVoices) {
            // Automatically disable voices
            vscode.workspace.getConfiguration('vscodeNarrator').update('EnableDonk', false, vscode.ConfigurationTarget.Global);
        }

        return {
            EnableDonk: enableDonk && !enableVoices,
            EnableVoices: enableVoices && !enableDonk,
            VoiceSelected: config.get<string>('VoiceSelected', "Maverick")
        };
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('vscodeNarrator')) {
                const config = vscode.workspace.getConfiguration('vscodeNarrator');
                
                // Check if both EnableDonk and EnableVoices are being set to true
                const enableDonk = config.get<boolean>('EnableDonk', true);
                const enableVoices = config.get<boolean>('EnableVoices', false);

                if (enableDonk && enableVoices) {
                    // Automatically disable voices and show a warning
                    config.update('EnableDonk', false, vscode.ConfigurationTarget.Global);
                    vscode.window.showWarningMessage('Cannot enable both Donk and Voices simultaneously. Donks have been disabled.');
                }

                vscode.window.showInformationMessage('Extension settings updated!');
                
                if (event.affectsConfiguration('vscodeNarrator.VoiceSelected')) {
                    //Implement voice preview
                    return;
                }
            }
        })
    );

    function getRandomFileFromFolder(folderPath: string): string {
        try {
            // Read all files in the directory
            const files = fs.readdirSync(folderPath);
    
            // Filter out any directories, keeping only files
            const fileList = files.filter(file => 
                fs.statSync(path.join(folderPath, file)).isFile()
            );
    
            // If no files found, return null
            if (fileList.length === 0) {
                return "error";
            }
    
            // Pick a random file
            const randomIndex = Math.floor(Math.random() * fileList.length);
            return path.join(folderPath, fileList[randomIndex]);
        } catch (error) {
            console.error('Error reading folder:', error);
            return "Error";
        }
    }

    function selectSoundFromVoice(voice:string)
    {
        var folderPath = path.join(context.extensionPath, 'assets', voice.toLowerCase().replace(' ', '_'));
        return getRandomFileFromFolder(folderPath);
    }

    // Track files and their error lines with specific error messages
    const errorSoundPlayedLines = new Map<string, Map<number, Set<string>>>();

    function playErrorAudio(uri: vscode.Uri, line: number, errorMessage: string) {
        const config = getConfiguration();

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

        var audioFilePath = path.join(context.extensionPath, 'assets', 'error-sound.wav');

        if (config.EnableVoices)
        {
            const path = selectSoundFromVoice(config.VoiceSelected);
            console.log(path);
            audioFilePath = path;
        }
        else
        {
            if (!config.EnableDonk)
            {
                return;
            }
        }

        try {
            // Stop any currently playing audio
            stopCurrentAudio();

            // Create a wav file reader
            const file = fs.createReadStream(audioFilePath);
            const reader = new wav.Reader();

            // Setup the speaker
            const speaker = new Speaker({
                channels: 2,  // Stereo
                bitDepth: 16, // 16-bit
                sampleRate: 44100 // Standard sample rate
            });

            // Store current audio playback resources
            currentAudioPlayback = { file, reader, speaker };

            // Pipe the file through the reader to the speaker
            file.pipe(reader).pipe(speaker);

            speaker.on('close', () => {
                console.log('Audio playback completed');
                currentAudioPlayback = {};
            });

            speaker.on('error', (error) => {
                console.error('Audio playback error:', error);
                currentAudioPlayback = {};
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