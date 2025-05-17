// src/components/AnswerEditor.jsx
import { useState } from 'react';

const AnswerEditor = ({ initialAnswers, onChange }) => {
  // Parse the initial answers if they're a string
  const parsedInitialAnswers = typeof initialAnswers === 'string'
    ? JSON.parse(initialAnswers)
    : initialAnswers;

  const [answers, setAnswers] = useState(parsedInitialAnswers);

  // Function to update an answer at a specific index
  const updateAnswer = (index, field, value) => {
    const updatedAnswers = [...answers];
    updatedAnswers[index] = {
      ...updatedAnswers[index],
      [field]: field === 'isCorrect' ? value === true : value
    };

    // If we're setting an answer as correct, set all others to false
    if (field === 'isCorrect' && value === true) {
      updatedAnswers.forEach((answer, i) => {
        if (i !== index) {
          updatedAnswers[i] = { ...answer, isCorrect: false };
        }
      });
    }

    setAnswers(updatedAnswers);
    onChange(JSON.stringify(updatedAnswers));
  };

  // Function to add a new answer
  const addAnswer = () => {
    const updatedAnswers = [...answers, { text: '', isCorrect: false }];
    setAnswers(updatedAnswers);
    onChange(JSON.stringify(updatedAnswers));
  };

  // Function to remove an answer
  const removeAnswer = (index) => {
    if (answers.length <= 2) {
      alert('You need at least 2 answers');
      return;
    }

    // Check if we're removing the correct answer
    const isRemovingCorrect = answers[index].isCorrect;

    const updatedAnswers = answers.filter((_, i) => i !== index);

    // If we removed the correct answer, make the first one correct
    if (isRemovingCorrect && updatedAnswers.length > 0) {
      updatedAnswers[0].isCorrect = true;
    }

    setAnswers(updatedAnswers);
    onChange(JSON.stringify(updatedAnswers));
  };

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h4 className="font-medium">Answers</h4>
        <small className="text-gray-500 text-sm block mt-1">Select the correct answer by clicking the checkbox</small>
      </div>

      {answers.map((answer, index) => (
        <div key={index} className="flex items-center bg-white border border-gray-200 rounded-md p-1">
          <div className="flex items-center flex-grow gap-2">
            <input
              type="checkbox"
              checked={answer.isCorrect}
              onChange={(e) => updateAnswer(index, 'isCorrect', e.target.checked)}
              aria-label={`Mark as correct answer ${index + 1}`}
              className="w-auto m-0 mx-2 cursor-pointer"
            />
            <input
              type="text"
              value={answer.text}
              onChange={(e) => updateAnswer(index, 'text', e.target.value)}
              placeholder={`Answer ${index + 1}`}
              required
              className="flex-grow p-2 border border-gray-300 rounded"
            />
          </div>
          <button
            type="button"
            onClick={() => removeAnswer(index)}
            className="ml-2 p-1 px-2 bg-transparent text-red-600 border border-red-600 rounded hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            aria-label={`Remove answer ${index + 1}`}
          >
            ✖
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addAnswer}
        className="w-full p-2 bg-gray-200 text-gray-700 border border-dashed border-gray-300 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      >
        + Add Answer
      </button>
    </div>
  );
};

export default AnswerEditor;