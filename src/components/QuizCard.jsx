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

export function QuizCard({ quiz, isOwn, starred, onHost, onPreview, onExport, onDelete, onStar, exporting, deleting, user, t }) {
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
          {quiz.created_at && !quiz.creator_username && (
            <p className="text-xs text-gray-400 mt-0.5">{quiz.created_at.slice(0, 10)}</p>
          )}
          {(quiz.language || quiz.topic) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {quiz.language && (
                <Link
                  to={`/browse?language=${encodeURIComponent(quiz.language)}`}
                  className="text-xs bg-gray-100 text-gray-500 hover:bg-gray-200 px-1.5 py-0.5 rounded"
                  onClick={(e) => e.stopPropagation()}
                >
                  {LANG_NAMES[quiz.language] ?? quiz.language}
                </Link>
              )}
              {quiz.topic && (
                <Link
                  to={`/browse?topic=${encodeURIComponent(quiz.topic)}`}
                  className="text-xs bg-indigo-50 text-indigo-500 hover:bg-indigo-100 px-1.5 py-0.5 rounded"
                  onClick={(e) => e.stopPropagation()}
                >
                  {quiz.topic}
                </Link>
              )}
            </div>
          )}
          {quiz.creator_username && (
            <Link
              to={`/browse?creator=${encodeURIComponent(quiz.creator_username)}`}
              className="text-xs text-gray-400 hover:text-indigo-500 mt-0.5 block truncate w-min"
              onClick={(e) => e.stopPropagation()}
            >
              @{quiz.creator_username}
            </Link>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {isOwn && (
            <>
              <Link
                to={`/edit?quizId=${quiz.id}`}
                title={t('hostLibrary.edit')}
                className="text-gray-500 hover:text-gray-900 p-1.5 rounded transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
                </svg>
              </Link>
              <button
                onClick={onExport}
                disabled={exporting}
                title={t('hostLibrary.export')}
                className="text-gray-500 hover:text-gray-900 disabled:opacity-50 p-1.5 rounded transition-colors"
              >
                {exporting ? <span className="text-xs leading-none">…</span> : (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                    <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                  </svg>
                )}
              </button>
              <button
                onClick={onDelete}
                disabled={deleting}
                title={t('hostLibrary.delete')}
                className="text-red-400 hover:text-red-600 disabled:opacity-50 p-1.5 rounded transition-colors"
              >
                {deleting ? <span className="text-xs leading-none">…</span> : (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </>
          )}
          <button
            onClick={onPreview}
            title={t('hostLibrary.preview')}
            className="text-gray-500 hover:text-gray-900 p-1.5 rounded transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
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
