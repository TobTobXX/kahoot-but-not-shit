import { Link } from 'react-router-dom'
import { LANG_NAMES } from '../context/I18nContext'

function PlaceholderThumb() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-indigo-100">
      <svg viewBox="0 0 48 48" className="w-12 h-12 text-indigo-300" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="10" width="36" height="28" rx="3" />
        <circle cx="18" cy="20" r="4" />
        <path d="M6 32 l10-8 8 7 6-5 12 9" />
      </svg>
    </div>
  )
}

export function QuizCard({ quiz, isOwn, starred, onHost, onExport, onDelete, onStar, exporting, deleting, user, t }) {
  const thumb = quiz.questions?.[0]?.image_url

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="relative w-full h-32 bg-indigo-50 flex-shrink-0">
        {thumb
          ? <img src={thumb} alt="" className="w-full h-full object-cover" />
          : <PlaceholderThumb />
        }
        {user && !isOwn && (
          <button
            onClick={onStar}
            title={starred ? t('hostLibrary.unstar') : t('hostLibrary.star')}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-white/80 hover:bg-white transition-colors shadow-sm"
          >
            {starred
              ? <span className="text-yellow-400 text-base leading-none">★</span>
              : <span className="text-gray-400 text-base leading-none">☆</span>
            }
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 px-3 py-2 gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 leading-tight line-clamp-2">{quiz.title}</p>
          {quiz.created_at && (
            <p className="text-xs text-gray-400 mt-0.5">{quiz.created_at.slice(0, 10)}</p>
          )}
          {(quiz.language || quiz.topic) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {quiz.language && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{LANG_NAMES[quiz.language] ?? quiz.language}</span>
              )}
              {quiz.topic && (
                <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded">{quiz.topic}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {isOwn && (
            <>
              <Link
                to={`/edit?quizId=${quiz.id}`}
                className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded transition-colors"
              >
                {t('hostLibrary.edit')}
              </Link>
              <button
                onClick={onExport}
                disabled={exporting}
                className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-50 px-2 py-1 rounded transition-colors"
              >
                {exporting ? '…' : t('hostLibrary.export')}
              </button>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 px-2 py-1 rounded transition-colors"
              >
                {deleting ? '…' : t('hostLibrary.delete')}
              </button>
            </>
          )}
          <button
            onClick={onHost}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            {t('hostLibrary.host')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {children}
      </div>
    </div>
  )
}
