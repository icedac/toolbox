#!/usr/bin/env node
/**
 * 트위터/X 동영상 다운로더 - Node.js 버전
 * 필요 패키지: puppeteer, axios, fs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 필요한 패키지들을 동적으로 import
async function importRequiredPackages() {
    try {
        const puppeteer = require('puppeteer');
        const axios = require('axios');
        return { puppeteer, axios };
    } catch (error) {
        console.log('❌ 필요한 패키지가 설치되지 않았습니다.');
        console.log('설치 명령어:');
        console.log('npm install puppeteer axios');
        process.exit(1);
    }
}

/**
 * 트위터 URL 유효성 검사
 */
function validateTwitterUrl(url) {
    const patterns = [
        /https?:\/\/(www\.)?twitter\.com\/\w+\/status\/\d+/,
        /https?:\/\/(www\.)?x\.com\/\w+\/status\/\d+/,
        /https?:\/\/mobile\.twitter\.com\/\w+\/status\/\d+/
    ];
    
    return patterns.some(pattern => pattern.test(url));
}

/**
 * 파일 다운로드 함수
 */
function downloadFile(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                resolve();
            });
            
            file.on('error', (err) => {
                fs.unlink(filepath, () => {}); // 실패시 파일 삭제
                reject(err);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * 브라우저를 사용해서 트위터 동영상 URL 추출
 */
async function extractVideoUrlWithBrowser(tweetUrl) {
    const { puppeteer } = await importRequiredPackages();
    
    console.log('🌐 브라우저를 시작하는 중...');
    
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // User-Agent 설정
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );
        
        console.log('🔍 트위터 페이지를 로딩하는 중...');
        await page.goto(tweetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // 동영상 요소 찾기
        console.log('📹 동영상을 찾는 중...');
        
        const videoUrls = await page.evaluate(() => {
            const videos = [];
            
            // video 태그 찾기
            const videoElements = document.querySelectorAll('video');
            videoElements.forEach(video => {
                if (video.src) videos.push(video.src);
            });
            
            // source 태그 찾기
            const sourceElements = document.querySelectorAll('source');
            sourceElements.forEach(source => {
                if (source.src) videos.push(source.src);
            });
            
            return videos;
        });
        
        if (videoUrls.length === 0) {
            throw new Error('동영상을 찾을 수 없습니다.');
        }
        
        console.log(`✅ ${videoUrls.length}개의 동영상 URL을 찾았습니다.`);
        return videoUrls;
        
    } finally {
        await browser.close();
    }
}

/**
 * API를 사용한 방법 (대안)
 */
async function extractVideoUrlWithAPI(tweetUrl) {
    const { axios } = await importRequiredPackages();
    
    // 트윗 ID 추출
    const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
    if (!tweetIdMatch) {
        throw new Error('올바르지 않은 트위터 URL입니다.');
    }
    
    const tweetId = tweetIdMatch[1];
    
    try {
        console.log('🔍 트위터 API를 통해 정보를 가져오는 중...');
        
        // 공개 API 엔드포인트 사용 (제한적)
        const response = await axios.get(`https://cdn.syndication.twimg.com/tweet-result`, {
            params: {
                id: tweetId,
                lang: 'en'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const data = response.data;
        
        if (data.video && data.video.variants) {
            const variants = data.video.variants
                .filter(v => v.type === 'video/mp4')
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            
            if (variants.length > 0) {
                return [variants[0].src];
            }
        }
        
        throw new Error('동영상을 찾을 수 없습니다.');
        
    } catch (error) {
        console.log('❌ API 방법 실패:', error.message);
        throw error;
    }
}

/**
 * 메인 다운로드 함수
 */
async function downloadTwitterVideo(tweetUrl, outputDir = 'downloads') {
    if (!validateTwitterUrl(tweetUrl)) {
        throw new Error('올바르지 않은 트위터 URL입니다.');
    }
    
    // 출력 디렉토리 생성
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    let videoUrls = [];
    
    try {
        // 먼저 API 방법 시도
        console.log('📡 API 방법을 시도하는 중...');
        videoUrls = await extractVideoUrlWithAPI(tweetUrl);
    } catch (error) {
        console.log('⚠️ API 방법 실패, 브라우저 방법을 시도합니다...');
        try {
            videoUrls = await extractVideoUrlWithBrowser(tweetUrl);
        } catch (browserError) {
            throw new Error(`모든 방법이 실패했습니다: ${browserError.message}`);
        }
    }
    
    // 동영상 다운로드
    for (let i = 0; i < videoUrls.length; i++) {
        const videoUrl = videoUrls[i];
        const timestamp = new Date().getTime();
        const filename = `twitter_video_${timestamp}_${i + 1}.mp4`;
        const filepath = path.join(outputDir, filename);
        
        console.log(`⬇️ 동영상 ${i + 1} 다운로드 중...`);
        
        try {
            await downloadFile(videoUrl, filepath);
            console.log(`✅ 다운로드 완료: ${filename}`);
        } catch (error) {
            console.log(`❌ 다운로드 실패: ${error.message}`);
        }
    }
}

/**
 * 메인 함수
 */
async function main() {
    console.log('🐦 트위터/X 동영상 다운로더 (Node.js)');
    console.log('=' .repeat(50));
    
    const tweetUrl = process.argv[2] || (() => {
        console.log('사용법: node twitter_downloader.js <트위터_URL>');
        process.exit(1);
    })();
    
    try {
        await downloadTwitterVideo(tweetUrl);
        console.log('🎉 모든 작업이 완료되었습니다!');
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        console.log('\n💡 문제 해결 팁:');
        console.log('1. URL이 올바른지 확인하세요');
        console.log('2. 게시글이 공개되어 있는지 확인하세요');
        console.log('3. 게시글에 동영상이 포함되어 있는지 확인하세요');
        console.log('4. 필요한 패키지가 설치되어 있는지 확인하세요');
        process.exit(1);
    }
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
    main();
}

module.exports = { downloadTwitterVideo };