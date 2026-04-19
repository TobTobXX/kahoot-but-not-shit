import { createContext, useCallback, useContext, useState } from 'react'
import en from '../locales/en'
import de from '../locales/de'

const LOCALES = { en, de }
export const SUPPORTED_LANGS = Object.keys(LOCALES)

function detectLang() {
  const stored = localStorage.getItem('lang')
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored
  const browser = (navigator.language ?? '').slice(0, 2).toLowerCase()
  if (SUPPORTED_LANGS.includes(browser)) return browser
  return 'en'
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectLang)

  function setLang(l) {
    localStorage.setItem('lang', l)
    setLangState(l)
  }

  // t(key, vars) — resolves a dot-separated key against the active locale,
  // then replaces {varName} placeholders with the provided values.
  // Falls back to the key itself if the string is not found.
  const t = useCallback(
    (key, vars = {}) => {
      const strings = LOCALES[lang] ?? LOCALES.en
      const value = key.split('.').reduce((obj, k) => obj?.[k], strings)
      if (typeof value !== 'string') return key
      return Object.entries(vars).reduce(
        (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
        value,
      )
    },
    [lang],
  )

  return (
    <I18nContext.Provider value={{ lang, setLang, t, supported: SUPPORTED_LANGS }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
