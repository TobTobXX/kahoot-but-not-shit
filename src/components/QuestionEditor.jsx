export default function QuestionEditor({ index, question, onChange, onDelete, canDelete = true, isPro = false, onImageUpload }) {
  function update(field, value) {
    onChange({ ...question, [field]: value })
  }

  function updateAnswer(answerIndex, field, value) {
    const newAnswers = question.answers.map((a, i) =>
      i === answerIndex ? { ...a, [field]: value } : a
    )
    // Radio semantics: marking one answer correct clears is_correct on all others.
    // (The current spec only supports a single correct answer per question.)
    if (field === 'is_correct' && value) {
      for (let i = 0; i < newAnswers.length; i++) {
        newAnswers[i] = { ...newAnswers[i], is_correct: i === answerIndex }
      }
    }
    update('answers', newAnswers)
  }

  function addAnswer() {
    update('answers', [
      ...question.answers,
      { id: crypto.randomUUID(), answer_text: '', is_correct: false },
    ])
  }

  function removeAnswer(answerIndex) {
    update(
      'answers',
      question.answers.filter((_, i) => i !== answerIndex)
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-sm font-medium">Question {index + 1}</span>
          <button
            type="button"
            onClick={onDelete}
            disabled={!canDelete}
            className="text-sm text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Delete
          </button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Question text</label>
        <textarea
          value={question.question_text}
          onChange={(e) => update('question_text', e.target.value)}
          rows={2}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Enter question..."
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Time limit (s)</label>
          <input
            type="number"
            min={5}
            max={300}
            value={question.time_limit}
            onChange={(e) => update('time_limit', parseInt(e.target.value) || 0)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Points</label>
          <input
            type="number"
            min={0}
            value={question.points}
            onChange={(e) => update('points', parseInt(e.target.value) || 0)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Image</label>
          {isPro ? (
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onImageUpload(file)
                e.target.value = ''
              }}
              className="w-full text-xs text-gray-700 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            />
          ) : (
            <input
              type="text"
              value={question.image_url || ''}
              onChange={(e) => update('image_url', e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://..."
            />
          )}
        </div>
      </div>

      {isPro && question.image_url && (
        <img
          src={question.image_url}
          alt=""
          className="w-full max-h-48 object-contain rounded-lg border border-gray-200"
        />
      )}

      <div className="flex flex-col gap-2">
        <label className="text-xs text-gray-500">Answer options</label>
        {question.answers.map((answer, i) => (
          <div key={answer.id} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${question.id}`}
              checked={answer.is_correct}
              onChange={() => updateAnswer(i, 'is_correct', true)}
              className="w-4 h-4 accent-emerald-500"
              title="Mark as correct"
            />
            <input
              type="text"
              value={answer.answer_text ?? ''}
              onChange={(e) => updateAnswer(i, 'answer_text', e.target.value)}
              className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={`Option ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => removeAnswer(i)}
              disabled={question.answers.length <= 2}
              className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addAnswer}
          disabled={question.answers.length >= 4}
          className="text-sm text-indigo-600 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors self-start"
        >
          + Add answer
        </button>
      </div>
    </div>
  )
}
