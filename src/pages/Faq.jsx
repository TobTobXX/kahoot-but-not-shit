import Header from '../components/Header'
import { useI18n } from '../context/I18nContext'

const ITEMS = [
  ['q1', 'a1'],
  ['q2', 'a2'],
  ['q3', 'a3'],
  ['q4', 'a4'],
  ['q5', 'a5'],
  ['q6', 'a6'],
]

export default function Faq() {
  const { t } = useI18n()

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('faq.title')}</h1>
        <div className="flex flex-col gap-6">
          {ITEMS.map(([qKey, aKey]) => (
            <div key={qKey}>
              <p className="font-semibold text-gray-900 mb-1">{t(`faq.${qKey}`)}</p>
              <p className="text-gray-600 leading-relaxed">{t(`faq.${aKey}`)}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
