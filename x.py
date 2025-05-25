#!/usr/bin/env python3
"""
트위터/X 동영상 다운로더 - yt-dlp 사용
"""

import os
import sys
import re
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    print("yt-dlp가 설치되지 않았습니다.")
    print("설치 명령어: pip install yt-dlp")
    sys.exit(1)

def validate_twitter_url(url):
    """트위터 URL 형식을 검증합니다."""
    twitter_patterns = [
        r'https?://(?:www\.)?twitter\.com/\w+/status/\d+',
        r'https?://(?:www\.)?x\.com/\w+/status/\d+',
        r'https?://mobile\.twitter\.com/\w+/status/\d+',
    ]
    
    for pattern in twitter_patterns:
        if re.match(pattern, url):
            return True
    return False

def download_twitter_video(url, output_dir="downloads"):
    """
    트위터 동영상을 다운로드합니다.
    
    Args:
        url (str): 트위터 게시글 URL
        output_dir (str): 다운로드 폴더 경로
    """
    
    # URL 검증
    if not validate_twitter_url(url):
        print("❌ 올바르지 않은 트위터 URL입니다.")
        return False
    
    # 출력 디렉토리 생성
    Path(output_dir).mkdir(exist_ok=True)
    
    # yt-dlp 옵션 설정
    ydl_opts = {
        'outtmpl': f'{output_dir}/%(uploader)s_%(id)s.%(ext)s',
        'format': 'best[ext=mp4]/best',  # 최고 화질의 mp4 선택, 없으면 최고 화질
        'writeinfojson': True,  # 메타데이터 JSON 파일 저장
        'writesubtitles': False,  # 자막 다운로드 (필요시 True로 변경)
        'writeautomaticsub': False,  # 자동 생성 자막 다운로드
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"🔍 동영상 정보를 가져오는 중...")
            
            # 먼저 정보만 추출해서 동영상이 있는지 확인
            info = ydl.extract_info(url, download=False)
            
            if not info:
                print("❌ 동영상 정보를 가져올 수 없습니다.")
                return False
            
            # 동영상 정보 출력
            title = info.get('title', 'Unknown')
            uploader = info.get('uploader', 'Unknown')
            duration = info.get('duration', 0)
            
            print(f"📹 제목: {title}")
            print(f"👤 업로더: {uploader}")
            print(f"⏱️ 길이: {duration}초")
            
            # 실제 다운로드 시작
            print(f"⬇️ 다운로드 시작...")
            ydl.download([url])
            
            print(f"✅ 다운로드 완료! 파일이 '{output_dir}' 폴더에 저장되었습니다.")
            return True
            
    except yt_dlp.DownloadError as e:
        print(f"❌ 다운로드 오류: {e}")
        return False
    except Exception as e:
        print(f"❌ 예상치 못한 오류: {e}")
        return False

def main():
    """메인 함수"""
    print("🐦 트위터/X 동영상 다운로더")
    print("=" * 40)
    
    if len(sys.argv) > 1:
        url = sys.argv[1]
    else:
        url = input("트위터 게시글 URL을 입력하세요: ").strip()
    
    if not url:
        print("❌ URL이 입력되지 않았습니다.")
        return
    
    # 다운로드 실행
    success = download_twitter_video(url)
    
    if not success:
        print("\n💡 문제 해결 팁:")
        print("1. URL이 올바른지 확인하세요")
        print("2. 게시글이 공개되어 있는지 확인하세요")
        print("3. 게시글에 동영상이 포함되어 있는지 확인하세요")
        print("4. 네트워크 연결을 확인하세요")

if __name__ == "__main__":
    main()