#!/usr/bin/env node

import puppeteer, { Page, HTTPResponse, HTTPRequest } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import sizeOf from 'image-size';
import * as xml2js from 'xml2js';
import nodeFetch from 'node-fetch';
import * as dotenv from 'dotenv';
import { createInstagramDownloader } from './instagram-downloader';
import { getConfigLoader, Config } from './config';

// Load environment variables
try {
    dotenv.config();
} catch (e) {
    // dotenv not installed, continue without it
}

// Load configuration
let config: Config;
try {
    config = getConfigLoader().getConfig();
} catch (error: any) {
    console.error('Error loading configuration:', error.message);
    // Continue with defaults if config loading fails
    config = {
        outputDir: 'output',
        quality: 'high',
        sizeThreshold: '10k',
        timeout: 10,
        verbose: false
    };
}

/* --------------------- Types --------------------- */
interface Resource {
    url: string;
    buf: Buffer;
    ctype: string;
}

interface PartialMp4Chunk {
    start: number;
    chunk: Buffer;
}

interface PartialMp4Map {
    [key: string]: PartialMp4Chunk[];
}

interface Mp4File {
    name: string;
    size: number;
    fullPath: string;
}

interface InstagramOwner {
    username: string;
}

interface InstagramDisplayResource {
    src: string;
    config_width: number;
    config_height: number;
}

interface InstagramDashInfo {
    video_dash_manifest: string;
}

interface InstagramMediaItem {
    owner?: InstagramOwner;
    display_resources?: InstagramDisplayResource[];
    video_url?: string;
    dash_info?: InstagramDashInfo;
    is_video?: boolean;
    shortcode?: string;
    id?: string;
    edge_sidecar_to_children?: {
        edges: Array<{
            node: InstagramMediaItem;
        }>;
    };
}

interface Cookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
}

interface PageState {
    url: string;
    title: string;
    isLoginPage: boolean;
    hasLoginForm: boolean;
    bodyContent: string;
    loggedInElements: {
        hasDirectInbox: boolean;
        hasProfileMenu: boolean;
        hasHomeButton: boolean;
        hasExploreButton: boolean;
    };
}

interface DashRepresentation {
    $: {
        id: string;
        bandwidth?: string;
        codecs?: string;
        mimeType?: string;
        FBContentLength?: string;
    };
    BaseURL: string[];
    SegmentBase: Array<{
        $: {
            FBFirstSegmentRange?: string;
            FBSecondSegmentRange?: string;
            FBPrefetchSegmentRange?: string;
        };
        Initialization: Array<{
            $: {
                range: string;
            };
        }>;
    }>;
}

interface DashAdaptationSet {
    $: {
        contentType?: string;
    };
    Representation: DashRepresentation | DashRepresentation[];
}

interface DashPeriod {
    AdaptationSet: DashAdaptationSet[];
}

interface DashMPD {
    MPD: {
        Period: DashPeriod[];
    };
}

/* --------------------- Globals --------------------- */
let isVerbose = config.verbose || false;

/* --------------------- Helpers --------------------- */
function logDebug(...msg: any[]): void {
    if (isVerbose) console.log(...msg);
}

export function parseSizeThreshold(input?: string): number {
    // Use config default if no input provided
    const defaultValue = config.sizeThreshold || '10k';
    if (!input) input = defaultValue;
    
    const match = input.match(/^(\d+)(k?)$/i);
    if (!match) {
        // Parse the default from config
        const defaultMatch = defaultValue.match(/^(\d+)(k?)$/i);
        if (!defaultMatch) return 10240;
        const n = parseInt(defaultMatch[1], 10);
        return defaultMatch[2].toLowerCase() === 'k' ? n * 1024 : n;
    }
    const n = parseInt(match[1], 10);
    return match[2].toLowerCase() === 'k' ? n * 1024 : n;
}

export function parseTimeout(input?: string): number {
    // Use config default if no input provided
    const defaultTimeout = config.timeout || 10;
    if (!input) return defaultTimeout * 1000;
    
    const timeout = parseInt(input, 10);
    return isNaN(timeout) ? defaultTimeout * 1000 : timeout * 1000; // 초를 밀리초로 변환
}

export function parseOutputFolder(urlString: string): string {
    try {
        const p = new URL(urlString).pathname.replace(/\/+$/, '');
        let folder = p.substring(p.lastIndexOf('/') + 1) || 'output';
        folder = folder.replace(/[^\w-]/g, '') || 'output';
        return folder;
    } catch {
        return 'output';
    }
}

function getMediaDuration(ffprobePath: string, filePath: string): number {
    try {
        return parseFloat(
            execSync(`${ffprobePath} -v error -select_streams v:0 -show_entries format=duration -of csv=p=0 "${filePath}"`)
                .toString().trim()
        );
    } catch {
        return 0;
    }
}

/* --------------------- Filtering --------------------- */
export function filterAndSaveMedia(folderName: string, resource: Resource, threshold: number): boolean {
    if (resource.buf.length < threshold) {
        logDebug('Resource below threshold, skipping:', resource.url);
        return false;
    }
    let baseName = path.basename(new URL(resource.url).pathname) || 'file';
    if (!/\.[a-zA-Z0-9]+$/.test(baseName)) {
        const ext = resource.ctype.split(';')[0].split('/')[1];
        if (ext) baseName += '.' + ext;
    }
    if (Buffer.byteLength(baseName, 'utf8') > 128) {
        logDebug('Filename too long, skipping:', baseName);
        return false;
    }
    if (resource.ctype.startsWith('image/')) {
        if (resource.ctype === 'image/png') {
            logDebug('Skipping PNG');
            return false;
        }
        try {
            const dim = sizeOf(resource.buf);
            if (dim.width! < 161 || dim.height! < 161) {
                logDebug('Image dimension too small, skipping:', baseName);
                return false;
            }
        } catch {
            return false;
        }
    }
    fs.mkdirSync(folderName, { recursive: true });
    fs.writeFileSync(path.join(folderName, baseName), resource.buf);
    console.log('Saved file =>', baseName, resource.buf.length, 'bytes');
    return true;
}

/* --------------------- Partial MP4 Combine --------------------- */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function combinePartialMp4Chunks(partialMp4s: PartialMp4Map, folderName: string, threshold: number, mediaType: string): string[] {
    const FILENAME_LIMIT = 256;
    const results: string[] = [];

    for (const [baseName, chunks] of Object.entries(partialMp4s)) {
        chunks.sort((a, b) => a.start - b.start);
        const combined = Buffer.concat(chunks.map(x => x.chunk));
        if (combined.length < threshold) {
            logDebug('Combined MP4 below threshold, skipping:', baseName);
            continue;
        }
        if (!['video', 'any', 'mp4combine'].includes(mediaType)) continue;

        const ext = path.extname(baseName) || '.mp4';
        const name = path.basename(baseName, ext);
        const fileName = name + ext;
        if (Buffer.byteLength(fileName, 'utf8') > FILENAME_LIMIT) {
            logDebug('Output filename too long, skipping:', fileName);
            continue;
        }

        fs.mkdirSync(folderName, { recursive: true });
        const outPath = path.join(folderName, fileName);
        fs.writeFileSync(outPath, combined);
        console.log('Saved file =>', fileName, combined.length, 'bytes');
        results.push(outPath);
    }
    return results;
}

/* --------------------- Merge Video + Audio --------------------- */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mergeVideoAndAudio(folderName: string, postName: string, ffmpegPath: string, ffprobePath: string): void {
    const mp4List: Mp4File[] = fs.readdirSync(folderName)
        .filter(f => f.toLowerCase().endsWith('.mp4'))
        .map(f => {
            const fullPath = path.join(folderName, f);
            const stat = fs.statSync(fullPath);
            return { name: f, size: stat.size, fullPath };
        })
        .sort((a, b) => b.size - a.size);

    if (mp4List.length < 2) return;

    const videoFile = mp4List[0];
    const audioFile = mp4List[1];
    const vidDur = getMediaDuration(ffprobePath, videoFile.fullPath);
    const audDur = getMediaDuration(ffprobePath, audioFile.fullPath);

    if (Math.abs(vidDur - audDur) < 0.5) {
        const finalOut = path.join(folderName, postName + '.mp4');
        try {
            execSync(`${ffmpegPath} -y -i "${videoFile.fullPath}" -i "${audioFile.fullPath}" -c copy -map 0:v:0 -map 1:a:0 "${finalOut}"`);
            const mergedStat = fs.statSync(finalOut);
            console.log('Merged final mp4 =>', path.basename(finalOut), mergedStat.size, 'bytes');
        } catch (e) {
            logDebug('ffmpeg merge failed', e);
        }
    }
}

/* --------------------- JSON Parsing --------------------- */
export function findJsonItemWithOwner(jsonStr: string): InstagramMediaItem | null {
    try {
        const obj = JSON.parse(jsonStr);
        return searchItemWithOwner(obj);
    } catch {
        return null;
    }
}

function searchItemWithOwner(obj: any): InstagramMediaItem | null {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.owner && obj.owner.username) return obj as InstagramMediaItem;
    for (const k in obj) {
        const sub = searchItemWithOwner(obj[k]);
        if (sub) return sub;
    }
    return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function findAnyMediaData(jsonStr: string): InstagramMediaItem | null {
    try {
        const obj = JSON.parse(jsonStr);
        return searchAnyMediaData(obj);
    } catch {
        return null;
    }
}

function searchAnyMediaData(obj: any): InstagramMediaItem | null {
    if (!obj || typeof obj !== 'object') return null;
    
    // Look for media objects with display_resources or video info
    if (obj.display_resources || obj.video_url || obj.dash_info) {
        // Try to create a minimal media object
        const mediaObj: InstagramMediaItem = {
            display_resources: obj.display_resources,
            video_url: obj.video_url,
            dash_info: obj.dash_info,
            is_video: obj.is_video || !!obj.video_url,
            shortcode: obj.shortcode,
            id: obj.id,
            owner: obj.owner || { username: 'unknown' }
        };
        
        // Add any child media if it's a carousel
        if (obj.edge_sidecar_to_children) {
            mediaObj.edge_sidecar_to_children = obj.edge_sidecar_to_children;
        }
        
        logDebug('[MediaData] Found media object:', {
            hasImages: !!obj.display_resources,
            hasVideo: !!obj.video_url,
            hasDash: !!obj.dash_info,
            hasChildren: !!obj.edge_sidecar_to_children
        });
        
        return mediaObj;
    }
    
    // Recursively search for media data
    for (const k in obj) {
        if (Array.isArray(obj[k])) {
            for (const item of obj[k]) {
                const found = searchAnyMediaData(item);
                if (found) return found;
            }
        } else {
            const found = searchAnyMediaData(obj[k]);
            if (found) return found;
        }
    }
    
    return null;
}

/* --------------------- DASH Downloads --------------------- */
async function downloadRange(url: string, start?: number, end?: number): Promise<Buffer> {
    const headers: Record<string, string> = {};
    let rangeDesc = 'FULL';
    if (start !== undefined && end !== undefined) {
        headers.Range = `bytes=${start}-${end}`;
        rangeDesc = `${start}-${end}`;
    }
    logDebug(`[downloadRange] Requesting [${rangeDesc}] => ${url.substring(0, 100)}...`);
    const res = await nodeFetch(url, { headers });
    logDebug(`[downloadRange] Response code: ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

    const buf = Buffer.from(await res.arrayBuffer());
    logDebug(`[downloadRange] Received chunk => ${buf.length} bytes for [${rangeDesc}]`);
    return buf;
}

function parseByteRange(str: string): [number, number] | null {
    const m = str.match(/^(\d+)-(\d+)$/);
    if (!m) return null;
    return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

async function downloadDashRepresentation(repr: DashRepresentation): Promise<Buffer> {
    const baseURL = repr.BaseURL[0];
    const segBase = repr.SegmentBase[0];
    const id = repr.$.id;

    logDebug(`\n[downloadDashRepresentation] Representation ID="${id}"`);
    const totalLen = parseInt(repr.$.FBContentLength || '0', 10);
    const initRangeStr = segBase.Initialization[0].$.range;
    const initRange = parseByteRange(initRangeStr) || [0, 0];
    logDebug(`[downloadDashRepresentation] initRange=${initRangeStr}`);

    const initBuf = await downloadRange(baseURL, initRange[0], initRange[1]);
    const chunks: Buffer[] = [initBuf];

    if (totalLen > 0) {
        const startByte = initRange[1] + 1;
        const endByte = totalLen - 1;
        logDebug(`[downloadDashRepresentation] Download entire => ${startByte}-${endByte}`);
        const mainBuf = await downloadRange(baseURL, startByte, endByte);
        chunks.push(mainBuf);
    } else {
        const srA = segBase.$.FBFirstSegmentRange;
        const srB = segBase.$.FBSecondSegmentRange;
        const srP = segBase.$.FBPrefetchSegmentRange;
        const segRanges: string[] = [];
        if (srA) segRanges.push(srA);
        if (srB) segRanges.push(srB);
        if (srP && !segRanges.includes(srP)) segRanges.push(srP);
        for (const sr of segRanges) {
            const range = parseByteRange(sr);
            if (!range) continue;
            const [s, e] = range;
            logDebug(`[downloadDashRepresentation] Download => ${sr}`);
            const segBuf = await downloadRange(baseURL, s, e);
            chunks.push(segBuf);
        }
    }

    const resultBuf = Buffer.concat(chunks);
    logDebug(`[downloadDashRepresentation] Combined => ${resultBuf.length} bytes for ID="${id}"`);
    return resultBuf;
}

async function mergeDashVideoAudio(videoBuf: Buffer, audioBuf: Buffer, outPath: string = 'final.mp4'): Promise<void> {
    fs.writeFileSync('temp_video.mp4', videoBuf);
    fs.writeFileSync('temp_audio.mp4', audioBuf);
    try {
        execSync(`ffmpeg -y -i temp_video.mp4 -i temp_audio.mp4 -c copy -map 0:v:0 -map 1:a:0 "${outPath}" > /dev/null 2>&1`);
        const mergedStat = fs.statSync(outPath);
        console.log('Merged final mp4 =>', outPath, mergedStat.size, 'bytes');
    } catch (e) {
        logDebug('[mergeDashVideoAudio] ffmpeg merge error:', e);
    } finally {
        try { fs.unlinkSync('temp_video.mp4'); } catch { }
        try { fs.unlinkSync('temp_audio.mp4'); } catch { }
    }
}

export async function downloadBestQualityDash(mpdXml: string, folderName: string, postName: string): Promise<void> {
    logDebug('[downloadBestQualityDash] Parsing MPD XML');
    const parsed: DashMPD = await xml2js.parseStringPromise(mpdXml);
    const period = parsed.MPD.Period[0];
    const adaptationSets = period.AdaptationSet;
    if (!Array.isArray(adaptationSets)) {
        logDebug('[downloadBestQualityDash] No adaptation sets array?');
        return;
    }

    const videoSet = findVideoAdaptationSet(adaptationSets);
    const audioSet = findAudioAdaptationSet(adaptationSets);
    if (!videoSet) {
        logDebug('[downloadBestQualityDash] Could not find a video adaptation set.');
        return;
    }
    if (!audioSet) {
        logDebug('[downloadBestQualityDash] Could not find an audio adaptation set.');
        return;
    }

    const videoReprs = Array.isArray(videoSet.Representation) ? videoSet.Representation : [videoSet.Representation];
    const audioReprs = Array.isArray(audioSet.Representation) ? audioSet.Representation : [audioSet.Representation];

    videoReprs.sort((a, b) => parseInt(b.$.bandwidth || '0', 10) - parseInt(a.$.bandwidth || '0', 10));
    audioReprs.sort((a, b) => parseInt(b.$.bandwidth || '0', 10) - parseInt(a.$.bandwidth || '0', 10));

    const bestVideo = videoReprs[0];
    const bestAudio = audioReprs[0];

    console.log('Selected video =>', bestVideo.$.id, bestVideo.$.bandwidth);
    console.log('Selected audio =>', bestAudio.$.id, bestAudio.$.bandwidth);

    const videoBuf = await downloadDashRepresentation(bestVideo);
    const audioBuf = await downloadDashRepresentation(bestAudio);

    const finalPath = path.join(folderName, postName + '.mp4');
    await mergeDashVideoAudio(videoBuf, audioBuf, finalPath);
    console.log('Saved file =>', path.basename(finalPath));
}

/* --------------------- Identify Video/Audio AdaptationSets --------------------- */
function findVideoAdaptationSet(adaptationSets: DashAdaptationSet[]): DashAdaptationSet | null {
    const direct = adaptationSets.find(a => (a.$.contentType || '').toLowerCase() === 'video');
    if (direct) return direct;

    for (const a of adaptationSets) {
        if (!a.Representation) continue;
        const reps = Array.isArray(a.Representation) ? a.Representation : [a.Representation];
        const r0 = reps[0].$;
        if (r0 && r0.mimeType && r0.mimeType.includes('video')) return a;
        if (r0 && r0.codecs && r0.codecs.includes('avc1')) return a;
    }
    return null;
}

function findAudioAdaptationSet(adaptationSets: DashAdaptationSet[]): DashAdaptationSet | null {
    const direct = adaptationSets.find(a => (a.$.contentType || '').toLowerCase() === 'audio');
    if (direct) return direct;

    for (const a of adaptationSets) {
        if (!a.Representation) continue;
        const reps = Array.isArray(a.Representation) ? a.Representation : [a.Representation];
        const r0 = reps[0].$;
        if (r0 && r0.mimeType && r0.mimeType.includes('audio')) return a;
        if (r0 && r0.codecs && r0.codecs.includes('mp4a')) return a;
    }
    return null;
}

/* --------------------- Highest Resolution Image --------------------- */
export async function downloadHighestResImage(displayResources: InstagramDisplayResource[], folderName: string, fileName: string): Promise<void> {
    const best = displayResources.reduce((acc, cur) => (cur.config_width > acc.config_width ? cur : acc));
    const url = best.src;
    logDebug('[downloadHighestResImage] =>', url);
    const resp = await nodeFetch(url);
    if (!resp.ok) {
        logDebug('[downloadHighestResImage] Download failed =>', resp.status);
        return;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.mkdirSync(folderName, { recursive: true });
    const outPath = path.join(folderName, fileName);
    fs.writeFileSync(outPath, buf);
    console.log('Saved file =>', fileName, buf.length, 'bytes');
}

/* --------------------- Instagram Cookie Authentication --------------------- */
function getInstagramCookies(): Cookie[] | null {
    try {
        // Method 1: Cookie file path
        const cookieFile = process.env.INSTAGRAM_COOKIES_FILE;
        if (cookieFile && fs.existsSync(cookieFile)) {
            logDebug(`[Cookies] Loading from file: ${cookieFile}`);
            return loadCookiesFromFile(cookieFile);
        }
        
        // Method 2: Direct cookie JSON
        const cookieJson = process.env.INSTAGRAM_COOKIES_JSON;
        if (cookieJson) {
            logDebug('[Cookies] Loading from JSON environment variable');
            return JSON.parse(cookieJson);
        }
        
        // Method 3: Base64 encoded cookies (for security)
        const cookieB64 = process.env.INSTAGRAM_COOKIES_B64;
        if (cookieB64) {
            logDebug('[Cookies] Loading from base64 environment variable');
            const decoded = Buffer.from(cookieB64, 'base64').toString('utf-8');
            return JSON.parse(decoded);
        }
        
        logDebug('[Cookies] No cookies found in environment');
        return null;
    } catch (error: any) {
        console.log('❌ Error loading Instagram cookies:', error.message);
        return null;
    }
}

function loadCookiesFromFile(filePath: string): Cookie[] | null {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const cookies: Cookie[] = [];
        
        // Parse Netscape cookies.txt format
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            
            const parts = trimmed.split('\t');
            if (parts.length >= 7) {
                cookies.push({
                    name: parts[5],
                    value: parts[6],
                    domain: parts[0],
                    path: parts[2],
                    httpOnly: parts[1] === 'TRUE',
                    secure: parts[3] === 'TRUE',
                    sameSite: 'Lax'
                });
            }
        }
        
        logDebug(`[Cookies] Loaded ${cookies.length} cookies from file`);
        return cookies;
    } catch (error: any) {
        console.log('❌ Error reading cookies file:', error.message);
        return null;
    }
}

async function setCookiesInBrowser(page: Page, cookies: Cookie[]): Promise<boolean> {
    if (!cookies || cookies.length === 0) {
        logDebug('[Cookies] No cookies to set');
        return false;
    }
    
    try {
        console.log('🍪 Setting Instagram cookies...');
        
        // Go to Instagram first to set cookies on the right domain
        await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
        
        let csrfToken: string | null = null;
        let sessionId: string | null = null;
        
        // Set each cookie
        for (const cookie of cookies) {
            try {
                await page.setCookie({
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain || '.instagram.com',
                    path: cookie.path || '/',
                    httpOnly: cookie.httpOnly || false,
                    secure: cookie.secure || true,
                    sameSite: cookie.sameSite || 'Lax'
                });
                
                // Track important cookies
                if (cookie.name === 'csrftoken') {
                    csrfToken = cookie.value;
                }
                if (cookie.name === 'sessionid') {
                    sessionId = cookie.value;
                }
                
                logDebug(`[Cookies] Set cookie: ${cookie.name}`);
            } catch (e: any) {
                logDebug(`[Cookies] Failed to set cookie ${cookie.name}:`, e.message);
            }
        }
        
        // Set CSRF token in page context for later use
        if (csrfToken) {
            await page.evaluate((token) => {
                (window as any)._csrfToken = token;
            }, csrfToken);
            logDebug(`[Cookies] CSRF token available: ${csrfToken.substring(0, 10)}...`);
        } else {
            console.log('⚠️  No csrftoken found - some requests may fail');
            console.log('💡 Add csrftoken cookie for better compatibility');
        }
        
        if (!sessionId) {
            console.log('⚠️  No sessionid found - authentication may fail');
            console.log('💡 sessionid cookie is required for login');
        }
        
        // Additional headers for authenticated requests
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            ...(csrfToken && { 'X-CSRFToken': csrfToken })
        });
        
        console.log(`✅ Successfully set ${cookies.length} Instagram cookies`);
        return true;
        
    } catch (error: any) {
        console.log('❌ Error setting cookies:', error.message);
        logDebug('[Cookies] Cookie setting error details:', error);
        return false;
    }
}

// Remove the complex login function and replace with simpler cookie-based auth
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function authenticateWithCookies(page: Page): Promise<boolean> {
    const cookies = getInstagramCookies();
    if (!cookies) {
        logDebug('[Auth] No cookies found, proceeding without authentication');
        return false;
    }
    
    const success = await setCookiesInBrowser(page, cookies);
    if (success) {
        // Verify authentication by checking if we can access a logged-in page
        try {
            await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 3000));
            
            // Check current page state
            const pageState = await page.evaluate((): PageState => {
                return {
                    url: window.location.href,
                    title: document.title,
                    isLoginPage: window.location.pathname.includes('/accounts/login'),
                    hasLoginForm: !!document.querySelector('input[name="username"]'),
                    bodyContent: document.body ? document.body.textContent!.substring(0, 200) : 'No body',
                    loggedInElements: {
                        hasDirectInbox: !!document.querySelector('a[href*="/direct/inbox/"]'),
                        hasProfileMenu: !!document.querySelector('[data-testid="user-avatar"]') || !!document.querySelector('img[alt*="profile picture"]'),
                        hasHomeButton: !!document.querySelector('a[href="/"]'),
                        hasExploreButton: !!document.querySelector('a[href="/explore/"]')
                    }
                };
            });
            
            logDebug('[Auth] Page state after cookie auth:', JSON.stringify(pageState, null, 2));
            
            if (pageState.isLoginPage || pageState.hasLoginForm) {
                console.log('❌ Still on login page - cookies may be expired or invalid');
                console.log('💡 Please get fresh cookies from a recent browser login session');
                return false;
            }
            
            const loggedInIndicators = Object.values(pageState.loggedInElements).filter(Boolean).length;
            if (loggedInIndicators > 0) {
                console.log(`✅ Successfully authenticated with cookies (${loggedInIndicators}/4 indicators found)`);
                return true;
            } else {
                console.log('⚠️  Cookies set but no clear login indicators found');
                console.log('🔍 Page content preview:', pageState.bodyContent);
                
                // Still try to proceed - might be a different Instagram layout
                return true;
            }
        } catch (e: any) {
            logDebug('[Auth] Authentication verification failed:', e.message);
            return false;
        }
    }
    
    return false;
}

/* --------------------- Recursive Media Extraction --------------------- */
export async function extractMediaRecursive(item: InstagramMediaItem, folderName: string, postName: string): Promise<number> {
    let downloadCount = 0;

    if (item.edge_sidecar_to_children && item.edge_sidecar_to_children.edges) {
        const edges = item.edge_sidecar_to_children.edges;
        for (let i = 0; i < edges.length; i++) {
            const child = edges[i].node;
            const childName = postName + '_' + (i + 1);
            downloadCount += await extractMediaRecursive(child, folderName, childName);
        }
        return downloadCount;
    }

    if (item.is_video) {
        if (item.dash_info && item.dash_info.video_dash_manifest) {
            console.log('[extractMediaRecursive] is_video => using MPD:', postName);
            await downloadBestQualityDash(item.dash_info.video_dash_manifest, folderName, postName);
            downloadCount++;
        } else if (item.video_url) {
            console.log('[extractMediaRecursive] is_video => using direct video_url:', postName);
            try {
                const fileName = postName + '.mp4';
                const filePath = path.join(folderName, fileName);
                const resp = await nodeFetch(item.video_url);
                const buffer = await resp.buffer();
                fs.mkdirSync(folderName, { recursive: true });
                fs.writeFileSync(filePath, buffer);
                console.log(`Saved file => ${fileName} ${buffer.length} bytes`);
                downloadCount++;
            } catch (error) {
                console.log(`⚠️  Failed to download video from direct URL: ${error}`);
            }
        } else {
            console.log('[extractMediaRecursive] is_video => but no dash_info or video_url available.');
        }
    }
    if (Array.isArray(item.display_resources) && item.display_resources.length > 0) {
        const fileName = postName + '.jpg';
        await downloadHighestResImage(item.display_resources, folderName, fileName);
        downloadCount++;
    }

    return downloadCount;
}

/* --------------------- Instagram --------------------- */
export async function handleInstagram(url: string, mediaType: string, sizeArg: string, postName?: string | null): Promise<void> {
    logDebug(`[handleInstagram] Using improved Instagram downloader`);

    try {
        // Create Instagram downloader with configuration
        const downloader = await createInstagramDownloader({
            outputDir: config.outputDir || 'output',
            quality: config.instagram?.quality || config.quality || 'high',
            sessionFile: config.instagram?.sessionFile || '.instagram_session.json'
        });

        // Download media from URL
        const result = await downloader.downloadFromUrl(url);
        
        if (result.success) {
            console.log(`✅ Successfully downloaded ${result.files.length} files`);
            result.files.forEach(file => {
                console.log(`  - ${path.basename(file)}`);
            });
        } else {
            console.log(`❌ Download failed: ${result.error}`);
            
            // Fallback to legacy Puppeteer method if API fails
            console.log('🔄 Falling back to legacy browser method...');
            await handleInstagramLegacy(url, mediaType, sizeArg, postName);
        }

        // Close downloader and save session
        await downloader.close();

    } catch (error: any) {
        console.error('Error in handleInstagram:', error.message);
        
        // Fallback to legacy method
        console.log('🔄 Falling back to legacy browser method...');
        await handleInstagramLegacy(url, mediaType, sizeArg, postName);
    }
}

/* --------------------- Instagram Legacy (Puppeteer) --------------------- */
async function handleInstagramLegacy(url: string, mediaType: string, sizeArg: string, postName?: string | null): Promise<void> {
    const threshold = parseSizeThreshold(sizeArg);
    let folderName = parseOutputFolder(url);
    postName = postName || folderName;
    folderName = path.join('output', folderName);

    logDebug(`[handleInstagramLegacy] Starting with timeout: 2000ms`);

    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        const resources: Resource[] = [];
        const items: InstagramMediaItem[] = [];

        await page.setRequestInterception(true);
        page.on('request', (req: HTTPRequest) => req.continue());

        page.on('response', async (res: HTTPResponse) => {
            try {
                if (!res.ok()) return;
                const ctype = (res.headers()['content-type'] || '').toLowerCase();
                if (ctype.includes('application/json') && res.url().endsWith('instagram.com/graphql/query')) {
                    const buf = await res.buffer();
                    const jsonStr = buf.toString();
                    logDebug(`[GraphQL Response] Size: ${jsonStr.length} chars`);
                    
                    // Try to find item with owner info first
                    let item = findJsonItemWithOwner(jsonStr);
                    
                    // If no owner info found, try any media data as fallback
                    if (!item) {
                        logDebug('[GraphQL Response] No owner info found, trying fallback');
                        item = findAnyMediaData(jsonStr);
                        if (item) {
                            logDebug('[GraphQL Response] Found media data without owner');
                            // Add a generic username if none exists
                            if (!item.owner) {
                                item.owner = { username: 'unknown_user' };
                            }
                        }
                    }
                    
                    if (!item) {
                        logDebug('[GraphQL Response] No usable media data found');
                        return;
                    }
                    
                    items.push(item);

                    const user = item.owner;
                    if (user && user.username) {
                        console.log('Found username =>', user.username);
                        folderName = path.join('output', user.username);
                        fs.mkdirSync(folderName, { recursive: true });
                        fs.writeFileSync(path.join(folderName, postName + '.json'), JSON.stringify(item));
                    }
                }
            } catch (e) {
                logDebug('Response error:', e);
            }
        });

        await page.goto(url, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));
        await browser.close();

        resources.forEach(r => filterAndSaveMedia(folderName, r, threshold));

        logDebug(`[handleInstagramLegacy] Found ${items.length} items with owner info`);
        
        if (items.length === 0) {
            console.log('⚠️  No media items found with owner information');
            console.log('💡 This may be due to:');
            console.log('   - Private account requiring authentication');
            console.log('   - Post deleted or restricted');
            console.log('   - Instagram API changes');
            console.log('   - Rate limiting or geographic restrictions');
            return;
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const localName = postName + (i > 0 ? `_${i}` : '');
            const downloadCount = await extractMediaRecursive(item, folderName, localName);
            logDebug(`[handleInstagramLegacy] Downloaded ${downloadCount} files from item ${i + 1}`);
        }
    } catch (error) {
        console.error('Error in handleInstagramLegacy:', error);
        throw error;
    }
}

/* --------------------- Others --------------------- */
async function handleThreads(_url: string, ..._args: any[]): Promise<void> {
    console.log('Threads not supported yet.');
}
async function handleTwitter(_url: string, ..._args: any[]): Promise<void> {
    console.log('Twitter not supported yet.');
}

/* --------------------- Main --------------------- */
async function main() {
    let urlArg: string | undefined, mediaArg: string | undefined, sizeArg: string | undefined, timeoutArg: string | undefined;
    const args = process.argv.slice(2);
    
    // Parse arguments
    const parsedArgs: Record<string, string> = {};
    const positionalArgs: string[] = [];
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--verbose') {
            isVerbose = true;
        } else if (arg === '--timeout' && i + 1 < args.length) {
            parsedArgs.timeout = args[i + 1];
            i++; // skip next argument
        } else if (arg === '--output' && i + 1 < args.length) {
            parsedArgs.output = args[i + 1];
            i++; // skip next argument
        } else if (arg === '--quality' && i + 1 < args.length) {
            parsedArgs.quality = args[i + 1];
            i++; // skip next argument
        } else if (!arg.startsWith('--')) {
            positionalArgs.push(arg);
        }
    }
    
    [urlArg, mediaArg, sizeArg] = positionalArgs;
    timeoutArg = parsedArgs.timeout;
    
    // Apply CLI overrides to config
    if (parsedArgs.output) {
        config.outputDir = parsedArgs.output;
    }
    if (parsedArgs.quality) {
        config.quality = parsedArgs.quality as 'high' | 'medium' | 'low';
    }

    if (!urlArg) {
        console.log('Usage: node get.js <URL> [mediaType] [size] [--timeout seconds] [--verbose]');
        console.log('');
        console.log('Options:');
        console.log('  --timeout: Wait time for Instagram responses (default: 10 seconds)');
        console.log('  --verbose: Show detailed logs');
        console.log('  --output: Output directory (default: output)');
        console.log('  --quality: Quality setting (high/medium/low, default: high)');
        console.log('');
        console.log('Configuration:');
        console.log('  Create getany.config.json in current or home directory');
        console.log('  See documentation for configuration options');
        console.log('');
        console.log('Instagram Authentication (optional):');
        console.log('  Method 1 - Cookies File:');
        console.log('    1. Install browser extension: "Get cookies.txt LOCALLY"');
        console.log('    2. Login to Instagram in browser');
        console.log('    3. Export cookies.txt file');
        console.log('    4. Set in .env: INSTAGRAM_COOKIES_FILE=/path/to/cookies.txt');
        console.log('');
        console.log('  Method 2 - JSON Cookies (RECOMMENDED):');
        console.log('    1. Login to Instagram in Chrome');
        console.log('    2. Open DevTools (F12) > Application > Cookies > instagram.com');
        console.log('    3. Copy ESSENTIAL cookies:');
        console.log('       • sessionid (REQUIRED - your login session)');
        console.log('       • csrftoken (REQUIRED - CSRF protection)');
        console.log('       • ds_user_id (your user ID)');
        console.log('       • mid (machine ID)');
        console.log('    4. Format as JSON array in .env: INSTAGRAM_COOKIES_JSON=[...]');
        console.log('');
        console.log('  ⚠️  You need AT LEAST sessionid + csrftoken for proper authentication!');
        console.log('');
        console.log('Examples:');
        console.log('  node get.js https://www.instagram.com/p/ABC123/');
        console.log('  node get.js https://www.instagram.com/p/ABC123/ --timeout 10 --verbose');
        process.exit(1);
    }

    const timeoutMs = timeoutArg ? parseTimeout(timeoutArg) : 2000;
    if (timeoutArg) {
        console.log(`Using timeout: ${timeoutMs/1000} seconds`);
    }

    let domain: string | undefined;
    try {
        domain = new URL(urlArg).hostname;
    } catch (e) { }

    if (domain && domain.includes('instagram')) {
        await handleInstagram(urlArg, mediaArg || 'any', sizeArg || '0');
    } else if (domain && domain.includes('threads')) {
        await handleThreads(urlArg, mediaArg, sizeArg);
    } else if (domain && domain.includes('twitter')) {
        await handleTwitter(urlArg, mediaArg, sizeArg);
    } else {
        console.log('Unsupported URL:', urlArg);
    }
}

// Only run main if this is the main module
if (require.main === module) {
    main().catch(console.error);
}