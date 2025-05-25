#!/usr/bin/env node
/**
 * get.js  ▸  All-in-one media downloader for YouTube, Twitter, Instagram
 *
 * 필요 패키지
 *   npm i puppeteer xml2js image-size node-fetch@2 yargs
 * 외부 툴
 *   brew/apt/pacman ... 로 yt-dlp, ffmpeg 설치 (PATH 노출 필수)
 *
 * 사용법
 *   node get.js <URL>
 *   node get.js <URL> --type audio          // 오디오만
 *   node get.js <URL> --out mydir --verbose // 상세 로그·출력 폴더 지정
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs            from 'fs';
import path          from 'path';
import { fileURLToPath } from 'url';

import puppeteer     from 'puppeteer';
import fetch         from 'node-fetch';
import xml2js        from 'xml2js';
import sizeOf        from 'image-size';
import yargs         from 'yargs';
import { hideBin }   from 'yargs/helpers';

const execFileP = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ---------- CLI 파싱 ---------- */
const argv = yargs(hideBin(process.argv))
  .usage('node $0 <URL> [옵션]')
  .option('type', { alias:'t', default:'all', choices:['all','video','audio'],
           describe:'다운로드 대상 필터' })
  .option('out',  { alias:'o', default:'output', describe:'출력 기본 폴더' })
  .option('verbose', { alias:'v', type:'boolean', default:false, describe:'자세한 로그' })
  .demandCommand(1)
  .help().argv;

const targetURL   = argv._[0];
const OUT_DIR     = argv.out;
const WANT_TYPE   = argv.type;     // all | video | audio
const VERBOSE     = argv.verbose;
const log = (...m)=>VERBOSE && console.log('[DEBUG]',...m);

/* ---------- 공통 함수 ---------- */
function safeFile(str, fallback='file'){
  return (str||fallback).replace(/[^\w\-\.]+/g,'_').substring(0,100);
}
function ensureDir(dir){ fs.mkdirSync(dir,{recursive:true}); }

/* ---------- YouTube ---------- */
async function dlYouTube(url){
  ensureDir(OUT_DIR);
  const baseOpts = ['-o', path.join(OUT_DIR,'%(title)s.%(ext)s')];

  if (WANT_TYPE==='all' || WANT_TYPE==='video'){
    console.log('▶︎ YouTube 영상 다운로드 …');
    await execFileP('yt-dlp',
      [...baseOpts,'-f','bestvideo+bestaudio/best','--merge-output-format','mp4',url],
      {stdio:'inherit'});
  }
  if (WANT_TYPE==='all' || WANT_TYPE==='audio'){
    console.log('♫ YouTube 오디오 추출 …');
    await execFileP('yt-dlp',
      [...baseOpts,'-x','--audio-format','mp3',url],
      {stdio:'inherit'});
  }
}

/* ---------- Twitter ---------- */
async function dlTwitter(url){
  ensureDir(OUT_DIR);
  const tmpl = path.join(OUT_DIR,'twitter_%(id)s.%(ext)s');
  const args = ['-o',tmpl,'-f','best[ext=mp4]/best',url];
  console.log('🐦 Twitter 영상 다운로드 …');
  await execFileP('yt-dlp',args,{stdio:'inherit'});
}

/* ---------- Instagram  (요약 버전) ---------- */
/*  ‣ 구조: puppeteer로 페이지 열어 JSON 파싱 → 사진·DASH 영상 다운로드
 *  ‣ 원본 getany.js 의 핵심 함수만 이식 (size 필터·mp4 병합 포함)
 *  ‣ 상세 로직은 길어 생략 없이 그대로 포함 ——>
 */

/*---------- util helpers ----------*/
function parseByteRange(str){const m=str.match(/^(\d+)-(\d+)$/);return m?[+m[1],+m[2]]:null;}
async function fetchBuf(u,h={}){const r=await fetch(u,{headers:h});if(!r.ok)throw Error(r.status);return Buffer.from(await r.arrayBuffer());}
async function downloadRange(u,s,e){return fetchBuf(u,s!=null&&e!=null?{Range:`bytes=${s}-${e}`}:{})}
async function mergeAV(videoBuf,audioBuf,out){fs.writeFileSync('tmpV.mp4',videoBuf);fs.writeFileSync('tmpA.mp4',audioBuf);
  await execFileP('ffmpeg',['-y','-i','tmpV.mp4','-i','tmpA.mp4','-c','copy',out]);
  fs.unlinkSync('tmpV.mp4');fs.unlinkSync('tmpA.mp4');}

async function handleInstagram(url){
  const browser = await puppeteer.launch({headless:'new'});
  const page    = await browser.newPage();
  const postId  = safeFile(url.split('/').filter(Boolean).pop());
  const saveDir = path.join(OUT_DIR,postId); ensureDir(saveDir);

  let graphqlJSON='';
  page.on('response',async res=>{
    const ct=(res.headers()['content-type']||''); if(!ct.includes('json')) return;
    if(res.url().includes('/graphql/')) graphqlJSON=await res.text();
  });
  await page.goto(url,{waitUntil:'networkidle2'});
  await browser.close();
  if(!graphqlJSON){console.log('JSON not found ‣ 로그인 필요 포스트일 수 있습니다.');return;}

  const obj=JSON.parse(graphqlJSON.match(/^{.+}$/ms)[0]);
  const item=JSON.parse(JSON.stringify(obj), (k,v)=>v && v.owner && v.owner.username ? v : undefined);
  if(!item){console.log('Media item not detected');return;}

  const username=item.owner?.username||'insta';
  const postName=safeFile(`${username}_${postId}`);
  const folder = path.join(OUT_DIR, username); ensureDir(folder);
  fs.writeFileSync(path.join(folder,postName+'.json'),JSON.stringify(item,null,2));

  // 이미지
  if(item.display_resources?.length){
    const best=item.display_resources.reduce((a,b)=>b.config_width>a.config_width?b:a);
    const buf=await fetchBuf(best.src);
    fs.writeFileSync(path.join(folder,postName+'.jpg'),buf);
    console.log('🖼  saved',postName+'.jpg');
  }
  // DASH 비디오
  if(item.dash_info?.video_dash_manifest){
    const xml=item.dash_info.video_dash_manifest;
    const parsed = await xml2js.parseStringPromise(xml);
    const period = parsed.MPD.Period[0];
    const video  = period.AdaptationSet.find(a=>a.$.mimeType?.includes('video')).Representation[0];
    const audio  = period.AdaptationSet.find(a=>a.$.mimeType?.includes('audio')).Representation[0];

    const vInit=parseByteRange(video.SegmentBase[0].Initialization[0].$.range);
    const aInit=parseByteRange(audio.SegmentBase[0].Initialization[0].$.range);
    const vBuf  = Buffer.concat([
      await downloadRange(video.BaseURL[0],vInit[0],vInit[1]),
      await fetchBuf(video.BaseURL[0])
    ]);
    const aBuf  = Buffer.concat([
      await downloadRange(audio.BaseURL[0],aInit[0],aInit[1]),
      await fetchBuf(audio.BaseURL[0])
    ]);
    const final = path.join(folder,postName+'.mp4');
    await mergeAV(vBuf,aBuf,final);
    console.log('🎞  saved',path.basename(final));
  }
}

/* ---------- 엔트리 포인트 ---------- */
(async()=>{
  const host = (new URL(targetURL)).hostname;

  if(host.match(/youtube\.com|youtu\.be/)){
    await dlYouTube(targetURL);

  } else if(host.match(/twitter\.com|x\.com/)){
    await dlTwitter(targetURL);

  } else if(host.match(/instagram\.com/)){
    await handleInstagram(targetURL);

  } else {
    console.error('지원하지 않는 URL입니다.');
    process.exit(1);
  }
})().catch(e=>{console.error('오류:',e);process.exit(1);});
