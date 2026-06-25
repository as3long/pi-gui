<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{
  text: string
}>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: (str: string, lang: string) => {
    try {
      // Basic escape
      const escaped = str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      if (lang) {
        return `<pre class="code-block language-${lang}"><code>${escaped}</code></pre>`
      }
      return `<pre class="code-block"><code>${escaped}</code></pre>`
    } catch {
      return ''
    }
  },
})

const html = computed(() => md.render(props.text))
</script>

<template>
  <div class="markdown-body" v-html="html" />
</template>

<style scoped>
.markdown-body {
  line-height: 1.2;
  word-wrap: break-word;
  overflow-wrap: break-word;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.markdown-body :deep(p) {
  margin: 0;
}

.markdown-body :deep(strong) {
  font-weight: 600;
}

.markdown-body :deep(code) {
  background: var(--code-bg);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: ui-monospace, 'SF Mono', monospace;
}

.markdown-body :deep(pre.code-block) {
  background: var(--code-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  margin: 4px 0;
}

.markdown-body :deep(pre.code-block code) {
  background: none;
  padding: 0;
  border: none;
  font-size: 0.85em;
  line-height: 1.4;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 14px;
  margin: 0;
  list-style-position: outside;
}

.markdown-body :deep(li) {
  margin: 0;
  padding: 0;
  line-height: 1;
}

.markdown-body :deep(li + li) {
  margin-top: 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 4px 0;
  font-weight: 600;
}

.markdown-body :deep(h1) { font-size: 1.3em; }
.markdown-body :deep(h2) { font-size: 1.4em; }
.markdown-body :deep(h3) { font-size: 1.05em; }

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--accent-color);
  padding-left: 10px;
  margin: 0;
  color: var(--muted-color);
}

.markdown-body :deep(a) {
  color: var(--accent-color);
  text-decoration: underline;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 4px 0;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 4px 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--tool-header-bg);
  font-weight: 600;
}
</style>
