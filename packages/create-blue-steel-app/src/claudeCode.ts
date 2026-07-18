import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import crypto from 'crypto';
import { bold, cyanBright } from 'ansis';
import { intro, outro, spinner, log, text, select, confirm, isCancel, multiselect } from '@clack/prompts';
import { exec } from 'node:child_process';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const CREDS_PATH = join(homedir(), '.blue-steel', 'credentials', 'claudeCode.json');

interface Credentials {
    access_token: string;
    refresh_token: string;
    expires_at: number; // timestamp in ms
}

interface PKCEPair {
    verifier: string;
    challenge: string;
}

// 1. Generate PKCE pair
function generatePKCE(): PKCEPair {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64url');

    return { verifier, challenge };
}

// 2. Get OAuth authorization URL
function getAuthorizationURL(pkce: PKCEPair): string {
    const url = new URL('https://claude.ai/oauth/authorize');

    url.searchParams.set('code', 'true');
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', 'https://console.anthropic.com/oauth/code/callback');
    url.searchParams.set('scope', 'org:create_api_key user:profile user:inference');
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', pkce.verifier);

    return url.toString();
}

// 3. Exchange authorization code for tokens
async function exchangeCodeForTokens(
    code: string,
    verifier: string
): Promise<Credentials> {
    const [authCode, state] = code.split('#');

    const response = await fetch('https://console.anthropic.com/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code: authCode,
            state: state,
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            redirect_uri: 'https://console.anthropic.com/oauth/code/callback',
            code_verifier: verifier,
        }),
    });

    if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
    };
}

// 4. Refresh access token
async function refreshAccessToken(refreshToken: string): Promise<Credentials> {
    const response = await fetch('https://console.anthropic.com/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
        }),
    });

    if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
    };
}

async function saveCredentials(creds: Credentials): Promise<void> {
    await fs.mkdir(dirname(CREDS_PATH), { recursive: true });
    await fs.writeFile(CREDS_PATH, JSON.stringify(creds, null, 2));
    await fs.chmod(CREDS_PATH, 0o600); // Read/write for owner only
}

async function loadCredentials(): Promise<Credentials | null> {
    try {
        const data = await fs.readFile(CREDS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

export async function getValidClaudeCodeAccessToken(): Promise<string | null> {
    const creds = await loadCredentials();
    if (!creds) return null;

    // If token is still valid, return it
    if (creds.expires_at > Date.now() + 60000) { // 1 minute buffer
        return creds.access_token;
    }

    // Otherwise, refresh it
    try {
        const newCreds = await refreshAccessToken(creds.refresh_token);
        await saveCredentials(newCreds);
        return newCreds.access_token;
    } catch {
        return null;
    }
}

function openUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        let command: string;

        switch (process.platform) {
            case 'darwin':
                command = `open "${url}"`;
                break;
            case 'win32':
                command = `start "${url}"`;
                break;
            default:
                command = `xdg-open "${url}"`;
                break;
        }

        exec(command, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

export async function completeClaudeCodeAuthFlow(): Promise<string> {
    // Try to get existing valid token
    const existingToken = await getValidClaudeCodeAccessToken();
    if (existingToken) return existingToken;

    // Otherwise, go through auth flow
    const pkce = generatePKCE();
    const authUrl = getAuthorizationURL(pkce);

    log.message(cyanBright`Opening browser for authentication...`);
    try {
        await openUrl(authUrl);
    } catch (err) {
        log.message('Could not open browser automatically');
    }
    

    log.message(bold`If browser did not open, visit:`);
    log.message(authUrl);
    //console.log(bold`\nPaste the authorization code here:`);
    
    // const code = await new Promise<string>((resolve) => {
    //     process.stdin.once('data', (data) => {
    //         resolve(data.toString().trim());
    //     });
    // });
    const code = await text({ message: 'Paste authorization code here:'});

    if (isCancel(code)) {
        throw new Error("Authorization cancelled");
    }

    const creds = await exchangeCodeForTokens(code, pkce.verifier);
    await saveCredentials(creds);

    log.success(bold`\nCredentials saved!`);
    
    return creds.access_token;
}
