import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/knowledge/',
  lang: 'zh-CN',
  title: 'AI 学习博客',
  description: '按学习路径、基础主题与实战案例组织的结构化 AI 知识站。',
  lastUpdated: true,
  vite: {
    server: {
      port: 3000,
      allowedHosts: ['company.sdsft.cc']
    }
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '学习路径', link: '/guide/' },
      { text: '基础主题', link: '/basics/' },
      { text: '案例库', link: '/cases/' }
    ],

    sidebar: [
      {
        text: '学习路径',
        items: [
          { text: '栏目说明与阅读入口', link: '/guide/' },
          { text: '基础主题总览', link: '/basics/' },
          { text: '案例库总览', link: '/cases/' }
        ]
      },
      {
        text: '基础主题',
        items: [
          { text: '栏目首页', link: '/basics/' },
          { text: '大模型基础认知', link: '/basics/llm-overview' },
          { text: 'Prompt Engineering 入门', link: '/basics/prompt-engineering' },
          { text: 'RAG 检索增强生成', link: '/basics/rag-intro' },
          { text: 'AI Coding Agent 编排架构', link: '/basics/ai-agent-workflow' }
        ]
      },
      {
        text: '案例库',
        items: [
          { text: '栏目首页', link: '/cases/' },
          { text: 'AI 内容创作案例', link: '/cases/ai-writing-example' },
          { text: 'AI 知识库问答案例', link: '/cases/ai-kb-example' },
          { text: 'AI 自动化助手案例', link: '/cases/ai-automation-example' }
        ]
      }
    ],

    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜索',
                buttonAriaLabel: '搜索站内内容'
              },
              modal: {
                displayDetails: '显示详情',
                resetButtonTitle: '清空搜索',
                backButtonTitle: '返回',
                noResultsText: '没有找到相关内容',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车',
                  navigateText: '切换',
                  navigateUpKeyAriaLabel: '向上',
                  navigateDownKeyAriaLabel: '向下',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc'
                }
              }
            }
          }
        }
      }
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Cupcc/knowledge' }
    ],

    editLink: {
      pattern: 'https://github.com/Cupcc/knowledge/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页'
    },

    footer: {
      message: '基于 VitePress 构建，持续沉淀 AI 学习与实践内容。',
      copyright: 'Copyright 2026 Cupcc'
    },

    outline: {
      level: [2, 3],
      label: '本页目录'
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    }
  }
})
