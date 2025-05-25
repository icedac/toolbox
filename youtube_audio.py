import yt_dlp
import os
from pydub import AudioSegment
import argparse
import sys
import re
from pydub.utils import mediainfo

def is_valid_youtube_url(url):
    youtube_regex = r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(?:embed\/)?(?:v\/)?(?:shorts\/)?(?:\S+)'
    return re.match(youtube_regex, url) is not None

def download_and_extract_audio(youtube_url, output_path="output", start_time=None, end_time=None):
    """
    YouTube URL에서 오디오를 추출하여 WAV 파일로 저장하는 함수
    """
    try:
        if not is_valid_youtube_url(youtube_url):
            raise ValueError("유효한 YouTube URL이 아닙니다.")
        
        # 출력 디렉토리 생성
        if not os.path.exists(output_path):
            os.makedirs(output_path)
        
        print("YouTube 영상 정보를 가져오는 중...")
        
        # yt-dlp 옵션 설정
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'wav',
            }],
            'outtmpl': os.path.join(output_path, '%(title)s.%(ext)s'),
            'quiet': True
        }
        
        # 다운로드 실행
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=True)
            wav_file = os.path.join(output_path, f"{info['title']}.wav")
        
        # 특정 구간 추출이 필요한 경우
        if start_time is not None and end_time is not None:
            print(f"{start_time}초에서 {end_time}초까지 구간 추출 중...")
            audio = AudioSegment.from_wav(wav_file)
            audio_segment = audio[start_time*1000:end_time*1000]
            
            # 원본 파일 삭제
            os.remove(wav_file)
            
            # 잘라낸 구간 저장
            wav_file = os.path.join(output_path, f"{info['title']}_clip.wav")
            audio_segment.export(wav_file, format='wav')
        
        # 추출된 오디오 파일 정보 출력
        audio_info = mediainfo(wav_file)
        print(f"오디오 파일 정보:")
        print(f"  - 재생 시간: {audio_info['duration']} 초")
        print(f"  - 비트레이트: {audio_info['bit_rate']} bps")
        
        print(f"변환 완료! 저장된 파일: {wav_file}")
        return wav_file
        
    except Exception as e:
        print(f"오류 발생: {type(e).__name__} - {str(e)}")
        return None

def main():
    parser = argparse.ArgumentParser(description='YouTube 영상에서 오디오를 추출하여 WAV 파일로 저장합니다.')
    
    parser.add_argument('url', 
                       help='YouTube 영상 URL')
    
    parser.add_argument('-o', '--output', 
                       default='output',
                       help='출력 파일을 저장할 경로 (기본값: output)')
    
    parser.add_argument('-s', '--start', 
                       type=int,
                       help='추출 시작 시간(초)')
    
    parser.add_argument('-e', '--end', 
                       type=int,
                       help='추출 종료 시간(초)')

    args = parser.parse_args()

    if args.start is not None and args.end is not None:
        if args.start >= args.end:
            print("오류: 종료 시간은 시작 시간보다 커야 합니다.")
            sys.exit(1)
        if args.start < 0 or args.end < 0:
            print("오류: 시간은 0 이상이어야 합니다.")
            sys.exit(1)

    result = download_and_extract_audio(
        args.url,
        output_path=args.output,
        start_time=args.start,
        end_time=args.end
    )

    if result is None:
        sys.exit(1)

if __name__ == "__main__":
    main()


# pip install yt-dlp pydub ffmpeg-python
# python clip_youtube_audio2.py "https://www.youtube.com/watch?v=Ct8NZdYWOFI" -o "iu" -s 0 -e 38

