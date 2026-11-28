// 영어 번역의 새 글 RSS입니다. 규칙은 src/lib/rss-feed.mjs에 있습니다.
import { feed } from '../../lib/rss-feed.mjs';

export const GET = () => feed('en');
