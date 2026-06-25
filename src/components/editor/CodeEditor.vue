<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { oneDark } from '@codemirror/theme-one-dark'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { lintKeymap } from '@codemirror/lint'
import { foldKeymap } from '@codemirror/language'

// Props
const props = withDefaults(defineProps<{
  modelValue?: string
  language?: 'javascript' | 'typescript' | 'python' | 'html' | 'css'
  theme?: 'light' | 'dark'
  readOnly?: boolean
  placeholder?: string
}>(), {
  modelValue: '',
  language: 'javascript',
  theme: 'dark',
  readOnly: false,
  placeholder: ''
})

// Emits
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'save', value: string): void
}>()

// Refs
const editorContainer = ref<HTMLElement | null>(null)
const editor = shallowRef<EditorView | null>(null)
const languageCompartment = new Compartment()
const themeCompartment = new Compartment()
const readOnlyCompartment = new Compartment()

// Language mapping
const languageMap = {
  javascript: javascript,
  typescript: () => javascript({ typescript: true }),
  python: python,
  html: html,
  css: css
}

// Get language extension
function getLanguageExtension(lang: string) {
  const langFn = languageMap[lang as keyof typeof languageMap]
  return langFn ? langFn() : javascript()
}

// Get theme extension
function getThemeExtension(theme: string) {
  return theme === 'dark' ? oneDark : []
}

// Create editor state
function createState(value: string) {
  return EditorState.create({
    doc: value,
    extensions: [
      // Line numbers
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      foldGutter(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      
      // Keymaps
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        {
          key: 'Mod-s',
          run: () => {
            emit('save', editor.value?.state.doc.toString() || '')
            return true
          }
        }
      ]),
      
      // Language
      languageCompartment.of(getLanguageExtension(props.language)),
      
      // Theme
      themeCompartment.of(getThemeExtension(props.theme)),
      
      // Read only
      readOnlyCompartment.of(props.readOnly ? EditorState.readOnly.of(true) : []),
      
      // Placeholder
      props.placeholder ? EditorView.contentAttributes.of({ 'aria-placeholder': props.placeholder }) : [],
      
      // Update listener
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit('update:modelValue', update.state.doc.toString())
        }
      })
    ]
  })
}

// Initialize editor
onMounted(() => {
  if (editorContainer.value) {
    const state = createState(props.modelValue)
    editor.value = new EditorView({
      state,
      parent: editorContainer.value
    })
  }
})

// Cleanup
onUnmounted(() => {
  editor.value?.destroy()
})

// Watch for external value changes
watch(() => props.modelValue, (newValue) => {
  if (editor.value && editor.value.state.doc.toString() !== newValue) {
    editor.value.dispatch({
      changes: {
        from: 0,
        to: editor.value.state.doc.length,
        insert: newValue
      }
    })
  }
})

// Watch for language changes
watch(() => props.language, (newLang) => {
  if (editor.value) {
    editor.value.dispatch({
      effects: languageCompartment.reconfigure(getLanguageExtension(newLang))
    })
  }
})

// Watch for theme changes
watch(() => props.theme, (newTheme) => {
  if (editor.value) {
    editor.value.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtension(newTheme))
    })
  }
})

// Watch for readOnly changes
watch(() => props.readOnly, (newReadOnly) => {
  if (editor.value) {
    editor.value.dispatch({
      effects: readOnlyCompartment.reconfigure(newReadOnly ? EditorState.readOnly.of(true) : [])
    })
  }
})

// Public methods
function focus() {
  editor.value?.focus()
}

function getValue() {
  return editor.value?.state.doc.toString() || ''
}

function setValue(value: string) {
  editor.value?.dispatch({
    changes: {
      from: 0,
      to: editor.value.state.doc.length,
      insert: value
    }
  })
}

// Expose methods
defineExpose({
  focus,
  getValue,
  setValue
})
</script>

<template>
  <div class="codemirror-wrapper" :class="{ 'is-dark': theme === 'dark' }">
    <div ref="editorContainer" class="codemirror-container"></div>
  </div>
</template>

<style scoped>
.codemirror-wrapper {
  width: 100%;
  height: 100%;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-color);
}

.codemirror-wrapper.is-dark {
  background: #1e1e1e;
}

.codemirror-container {
  width: 100%;
  height: 100%;
  min-height: 200px;
}

/* CodeMirror 深度样式覆盖 */
.codemirror-wrapper :deep(.cm-editor) {
  height: 100%;
}

.codemirror-wrapper :deep(.cm-scroller) {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Fira Code', monospace;
  font-size: 14px;
  line-height: 1.6;
}

.codemirror-wrapper :deep(.cm-gutters) {
  background: transparent;
  border-right: 1px solid var(--border-color);
}

.codemirror-wrapper :deep(.cm-activeLineGutter) {
  background: var(--hover-bg);
}

.codemirror-wrapper :deep(.cm-activeLine) {
  background: var(--hover-bg);
}

.codemirror-wrapper :deep(.cm-selectionBackground) {
  background: rgba(100, 255, 218, 0.2) !important;
}

.codemirror-wrapper :deep(.cm-cursor) {
  border-left-color: var(--accent-color);
}

.codemirror-wrapper :deep(.cm-matchingBracket) {
  background: rgba(100, 255, 218, 0.3);
  outline: 1px solid rgba(100, 255, 218, 0.5);
}

/* 滚动条样式 */
.codemirror-wrapper :deep(.cm-scroller::-webkit-scrollbar) {
  width: 8px;
  height: 8px;
}

.codemirror-wrapper :deep(.cm-scroller::-webkit-scrollbar-track) {
  background: transparent;
}

.codemirror-wrapper :deep(.cm-scroller::-webkit-scrollbar-thumb) {
  background: var(--border-color);
  border-radius: 4px;
}

.codemirror-wrapper :deep(.cm-scroller::-webkit-scrollbar-thumb:hover) {
  background: var(--muted-color);
}
</style>
