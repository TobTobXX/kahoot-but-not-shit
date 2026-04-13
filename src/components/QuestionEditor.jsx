export default function QuestionEditor({ index, question, onChange, onDelete, canDelete = true }) {
  function update(field, value) {
    onChange({ ...question, [field]: value })
  }

  function updateAnswer(answerIndex, field, value) {
    const newAnswers = question.answers.map((a, i) =>
      i === answerIndex ? { ...a, [field]: value } : a
    )
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
    <div className="bg-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm font-medium">Question {index + 1}</span>
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
        <label className="text-xs text-slate-400">Question text</label>
        <textarea
          value={question.question_text}
          onChange={(e) => update('question_text', e.target.value)}
          rows={2}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Enter question..."
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">Time limit (s)</label>
          <input
            type="number"
            min={5}
            max={300}
            value={question.time_limit}
            onChange={(e) => update('time_limit', parseInt(e.target.value) || 0)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">Points</label>
          <input
            type="number"
            min={0}
            value={question.points}
            onChange={(e) => update('points', parseInt(e.target.value) || 0)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">Image URL</label>
          <input
            type="text"
            value={question.image_url || ''}
            onChange={(e) => update('image_url', e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400">Answer options</label>
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
              value={answer.answer_text}
              onChange={(e) => updateAnswer(i, 'answer_text', e.target.value)}
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={`Option ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => removeAnswer(i)}
              disabled={question.answers.length <= 2}
              className="text-slate-400 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addAnswer}
          disabled={question.answers.length >= 4}
          className="text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors self-start"
        >
          + Add answer
        </button>
      </div>
    </div>
  )
}
