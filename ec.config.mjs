// Expressive Code(코드 블록) 설정입니다. Starlight가 이 파일을 자동으로 읽습니다.
// - 긴 코드 블록은 앞부분만 보여 주고 나머지를 접습니다. 접힌 줄은 눌러서 펼치고, 복사 버튼은 전체를 복사합니다.
//   기준: 35줄을 넘으면 21번째 줄부터 접습니다. 글에서 collapse={...}를 직접 지정한 블록은 그대로 둡니다.
import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import {
  pluginCollapsibleSections,
  pluginCollapsibleSectionsTexts,
} from '@expressive-code/plugin-collapsible-sections';

pluginCollapsibleSectionsTexts.addLocale('ko', { collapsedLines: '{lineCount}줄 더 보기' });

const COLLAPSE_AFTER = 35;
const VISIBLE_LINES = 20;

function pluginCollapseLongBlocks() {
  return {
    name: 'collapse-long-blocks',
    hooks: {
      preprocessMetadata: ({ codeBlock }) => {
        const lineCount = codeBlock.getLines().length;
        if (lineCount <= COLLAPSE_AFTER) return;
        if (codeBlock.metaOptions.getRanges('collapse').length) return;
        codeBlock.props.collapse = [`${VISIBLE_LINES + 1}-${lineCount}`];
      },
    },
  };
}

export default defineEcConfig({
  plugins: [pluginCollapseLongBlocks(), pluginCollapsibleSections()],
});
