// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://munsik.github.io',
  base: '/engineering-notes',
  integrations: [
    starlight({
      title: 'Engineering Notes',
      description: '엔터프라이즈 환경에서 기술을 프로덕션에 올릴 때 필요한 판단 기준과 운영 경험',
      locales: {
        root: { label: '한국어', lang: 'ko' },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Munsik/engineering-notes' },
        { icon: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/munsik-kim-69a9ab144' },
      ],
      editLink: {
        baseUrl: 'https://github.com/Munsik/engineering-notes/edit/main/',
      },
      lastUpdated: true,
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          // Apply the saved TOC width before the first paint so pages do not jump.
          tag: 'script',
          content:
            "try{var w=localStorage.getItem('en-toc-width');if(w)document.documentElement.style.setProperty('--en-toc-width',w+'px')}catch(e){}",
        },
        { tag: 'script', attrs: { src: '/engineering-notes/toc-resizer.js', defer: true } },
      ],
      sidebar: [
        {
          label: 'Machine Learning',
          items: [
            {
              label: 'Anomaly Detection in Production',
              items: [{ autogenerate: { directory: 'ml/anomaly-detection' } }],
            },
          ],
        },
        {
          label: 'About',
          items: [{ autogenerate: { directory: 'about' } }],
        },
      ],
    }),
  ],
});
