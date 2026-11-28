// 새 글 알림용 RSS(한국어)입니다. 네이버 서치어드바이저의 RSS 제출과 피드 구독기가 읽습니다. 규칙은 src/lib/rss-feed.mjs에 있습니다.
import { feed } from '../lib/rss-feed.mjs';

export const GET = () => feed('ko');
