import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: 'AI 学习博客',
  description: '记录 AI 基础、实战案例与工具方法的学习博客。',
  vite: {
    server: {
      port: 3000,
      allowedHosts: ['company.sdsft.cc']
    }
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '学习地图', link: '/markdown-examples' },
      { text: '实战案例', link: '/api-examples' }
    ],

    sidebar: [
      {
        text: '开始阅读',
        items: [
          { text: 'AI 学习地图', link: '/markdown-examples' },
          { text: 'AI 实战案例', link: '/api-examples' }
        ]
      },
      {
        text: '基础主题',
        items: [
          { text: '大模型基础认知', link: '/llm-overview' },
          { text: 'Prompt Engineering 入门', link: '/prompt-engineering' },
          { text: 'RAG 检索增强生成', link: '/rag-intro' },
          { text: 'AI Coding Agent 编排架构', link: '/ai-agent-workflow' }
        ]
      },
      {
        text: '案例拆解',
        items: [
          { text: 'AI 内容创作案例', link: '/ai-writing-example' },
          { text: 'AI 知识库问答案例', link: '/ai-kb-example' },
          { text: 'AI 自动化助手案例', link: '/ai-automation-example' }
        ]
      }
    ],

    outlineTitle: '本页目录',
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    }
  }
})
