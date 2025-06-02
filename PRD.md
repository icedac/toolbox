# getany - Quick Start Guide for macOS

## 1. 프로젝트 설정

```bash
# 프로젝트 디렉토리 생성
mkdir getany && cd getany

# package.json과 필요한 파일들 복사
# (위의 코드 아티팩트 내용을 각 파일에 복사)

# 의존성 설치
npm install

# TypeScript 빌드
npm run build
```

## 2. 로컬 테스트

```bash
# npm link로 로컬에 설치
npm link

# 테스트
getany https://youtube.com/watch?v=dQw4w9WgXcQ
```

## 3. npx로 테스트 (npm 배포 전)

```bash
# 로컬 패키지를 npx로 실행
npx ./
```

## 4. npm 배포

```bash
# npm 로그인
npm login

# 배포 (처음에는 패키지 이름이 사용 가능한지 확인)
npm publish

# 이제 어디서든 사용 가능!
npx getany https://youtube.com/watch?v=xxx
```

## 5. 필수 시스템 요구사항 (macOS)

```bash
# Homebrew 설치 (없는 경우)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# ffmpeg 설치 (영상/음성 처리용)
brew install ffmpeg

# youtube-dl 설치 (선택사항, youtube-dl-exec가 자동 관리)
brew install youtube-dl
```

## 6. 폴더 구조

```
getany/
├── src/
│   ├── core/
│   │   ├── interfaces/       # 공통 인터페이스
│   │   ├── parser/          # URL 파서
│   │   ├── storage/         # 파일 저장 관리
│   │   └── utils/           # 유틸리티
│   ├── platforms/           # 플랫폼별 다운로더
│   │   ├── youtube/
│   │   ├── twitter/
│   │   └── instagram/
│   ├── cli/                 # CLI 인터페이스
│   │   ├── index.ts        # 진입점
│   │   └── commands/
│   └── api/                # 향후 웹 API
├── dist/                   # 빌드 결과물
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

## 7. 개발 팁

### YouTube 다운로더 구현 개선
```typescript
// src/platforms/youtube/youtube-downloader.ts 에 추가
async downloadWithProgress(url: string, options: YouTubeOptions): Promise<DownloadResult> {
  const info = await this.getInfo(url);
  
  const subprocess = youtubedl.exec(url, {
    output: options.outputPath,
    format: options.quality
  });
  
  subprocess.stdout?.on('data', (data) => {
    // 진행률 파싱
    const progress = this.parseProgress(data.toString());
    if (progress) {
      console.log(`Progress: ${progress}%`);
    }
  });
  
  await subprocess;
}
```

### Twitter 스크래핑 구현
```typescript
// Twitter API 없이 스크래핑하려면
// 1. puppeteer 사용 (브라우저 자동화)
// 2. snscrape 같은 도구 활용
// 3. nitter 인스턴스 활용
```

## 8. 트러블슈팅

### "모듈을 찾을 수 없음" 오류
```bash
# 빌드 확인
npm run build

# node_modules 재설치
rm -rf node_modules package-lock.json
npm install
```

### ffmpeg 관련 오류
```bash
# ffmpeg 설치 확인
which ffmpeg

# PATH에 추가 (필요시)
export PATH="/opt/homebrew/bin:$PATH"
```

### 권한 오류
```bash
# 실행 권한 부여
chmod +x dist/cli/index.js
```

## 9. 다음 단계

1. **Instagram 다운로더 구현**
   - instagram-private-api 라이브러리 활용
   - 또는 instaloader Python 도구 연동

2. **설정 파일 지원**
   - getany.config.json 자동 로드
   - 사용자 홈 디렉토리 설정 지원

3. **캐싱 시스템**
   - 중복 다운로드 방지
   - 메타데이터 캐싱

4. **웹 UI**
   - Express 서버 구현
   - 다운로드 큐 관리
   - 실시간 진행률 표시