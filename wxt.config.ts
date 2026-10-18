import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TickSum',
    description: '自动记录浏览活动，整理页面内容，生成属于你的时间报告。数据保存在本机。',
    minimum_chrome_version: '120',
    homepage_url: 'https://github.com/Altria1979/ticksum',
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    permissions: ['tabs', 'storage', 'idle', 'alarms', 'scripting'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: '打开 TickSum' },
  },
});
