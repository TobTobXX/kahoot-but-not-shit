// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AnswerEditor from '../components/AnswerEditor';

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newQuiz, setNewQuiz] = useState({ title: '', visibility: 'private' });
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [showQuestions, setShowQuestions] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState({
    question_text: '',
    answers: JSON.stringify([
      { text: 'Answer 1', isCorrect: true },
      { text: 'Answer 2', isCorrect: false },
      { text: 'Answer 3', isCorrect: false },
      { text: 'Answer 4', isCorrect: false }
    ]),
    max_time: 30,
    points: 1000
  });

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        fetchQuizzes();
      }
      setLoading(false);
    };

    getUser();
  }, []);

  const fetchQuizzes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quizzes:', error);
    } else {
      setQuizzes(data || []);
    }
    setLoading(false);
  };

  const fetchQuestions = async (quizId) => {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('id');

    if (error) {
      console.error('Error fetching questions:', error);
    } else {
      setQuestions(data || []);
    }
  };

  const handleQuizChange = (e) => {
    const { name, value } = e.target;
    setNewQuiz({ ...newQuiz, [name]: value });
  };

  const handleQuestionChange = (e) => {
    const { name, value } = e.target;
    setNewQuestion({ ...newQuestion, [name]: value });
  };

  const handleAnswersChange = (updatedAnswers) => {
    setNewQuestion({ ...newQuestion, answers: updatedAnswers });
  };

  const createQuiz = async (e) => {
    e.preventDefault();

    const { data, error } = await supabase
      .from('quizzes')
      .insert([
        {
          title: newQuiz.title,
          visibility: newQuiz.visibility,
          owner_id: user.id
        }
      ])
      .select();

    if (error) {
      console.error('Error creating quiz:', error);
    } else {
      setNewQuiz({ title: '', visibility: 'private' });
      fetchQuizzes();
    }
  };

  const updateQuiz = async (e) => {
    e.preventDefault();

    const { error } = await supabase
      .from('quizzes')
      .update({
        title: editingQuiz.title,
        visibility: editingQuiz.visibility
      })
      .eq('id', editingQuiz.id);

    if (error) {
      console.error('Error updating quiz:', error);
    } else {
      setEditingQuiz(null);
      fetchQuizzes();
    }
  };

  const deleteQuiz = async (id) => {
    if (confirm('Are you sure you want to delete this quiz?')) {
      const { error } = await supabase
        .from('quizzes')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting quiz:', error);
      } else {
        fetchQuizzes();
      }
    }
  };

  const createQuestion = async (e, quizId) => {
    e.preventDefault();

    const { error } = await supabase
      .from('questions')
      .insert([
        {
          quiz_id: quizId,
          question_text: newQuestion.question_text,
          answers: JSON.parse(newQuestion.answers),
          max_time: parseInt(newQuestion.max_time),
          points: parseInt(newQuestion.points)
        }
      ]);

    if (error) {
      console.error('Error creating question:', error);
    } else {
      setNewQuestion({
        question_text: '',
        answers: JSON.stringify([
          { text: 'Answer 1', isCorrect: true },
          { text: 'Answer 2', isCorrect: false },
          { text: 'Answer 3', isCorrect: false },
          { text: 'Answer 4', isCorrect: false }
        ]),
        max_time: 30,
        points: 1000
      });
      fetchQuestions(quizId);
    }
  };

  const deleteQuestion = async (id) => {
    if (confirm('Are you sure you want to delete this question?')) {
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting question:', error);
      } else {
        fetchQuestions(showQuestions);
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // Generate a random 6-digit code for the session
  const generateSessionCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  // Create a new quiz session and navigate to the host page
  const startQuizSession = async (quizId) => {
    try {
      // Check if the quiz has questions
      const { data: questionCount, error: countError } = await supabase
        .from('questions')
        .select('id', { count: 'exact' })
        .eq('quiz_id', quizId);

      if (countError) throw countError;

      if (!questionCount || questionCount.length === 0) {
        alert('Cannot start a quiz with no questions. Please add questions first.');
        return;
      }

      // Create a new session
      const { data: session, error } = await supabase
        .from('sessions')
        .insert([
          {
            quiz_id: quizId,
            host_id: user.id,
            code: generateSessionCode(),
            current_state: 'waiting',
            current_question_index: 0
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Navigate to the host page
      navigate(`/session/${session.id}`);
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Failed to create session. Please try again.');
    }
  };

  const toggleQuestionView = (quizId) => {
    if (showQuestions === quizId) {
      setShowQuestions(null);
      setQuestions([]);
    } else {
      setShowQuestions(quizId);
      fetchQuestions(quizId);
    }
  };

  if (loading && !user) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Quiz Dashboard</h1>
        <button
          onClick={handleSignOut}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Sign Out
        </button>
      </header>
      <main>
        {user && (
          <div>
            <p className="mb-6 text-lg">Welcome, <strong>{user.email}</strong></p>

            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
              <h2 className="text-xl font-bold mb-4">Create New Quiz</h2>
              <form onSubmit={createQuiz} className="space-y-4">
                <div>
                  <label htmlFor="title" className="block mb-2 font-medium text-gray-700">Quiz Title:</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={newQuiz.title}
                    onChange={handleQuizChange}
                    required
                    className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="visibility" className="block mb-2 font-medium text-gray-700">Visibility:</label>
                  <select
                    id="visibility"
                    name="visibility"
                    value={newQuiz.visibility}
                    onChange={handleQuizChange}
                    className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Create Quiz
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-bold mb-4">Your Quizzes</h2>
              {quizzes.length === 0 ? (
                <p className="text-gray-600">You haven't created any quizzes yet.</p>
              ) : (
                <div className="space-y-4">
                  {quizzes.map((quiz) => (
                    <div key={quiz.id} className="border border-gray-200 rounded-lg p-4">
                      {editingQuiz && editingQuiz.id === quiz.id ? (
                        <form onSubmit={updateQuiz} className="space-y-4">
                          <div>
                            <label htmlFor="edit-title" className="block mb-2 font-medium text-gray-700">Quiz Title:</label>
                            <input
                              type="text"
                              id="edit-title"
                              name="title"
                              value={editingQuiz.title}
                              onChange={(e) => setEditingQuiz({...editingQuiz, title: e.target.value})}
                              required
                              className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label htmlFor="edit-visibility" className="block mb-2 font-medium text-gray-700">Visibility:</label>
                            <select
                              id="edit-visibility"
                              name="visibility"
                              value={editingQuiz.visibility}
                              onChange={(e) => setEditingQuiz({...editingQuiz, visibility: e.target.value})}
                              className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                            >
                              <option value="private">Private</option>
                              <option value="unlisted">Unlisted</option>
                              <option value="public">Public</option>
                            </select>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              type="submit"
                              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingQuiz(null)}
                              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div>
                          <h3 className="text-lg font-semibold mb-2">{quiz.title}</h3>
                          <p className="text-gray-600 mb-4">Visibility: {quiz.visibility}</p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setEditingQuiz(quiz)}
                              className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteQuiz(quiz.id)}
                              className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => toggleQuestionView(quiz.id)}
                              className="px-3 py-1.5 bg-gray-600 text-white rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                            >
                              {showQuestions === quiz.id ? 'Hide Questions' : 'Show Questions'}
                            </button>
                            <button
                              onClick={() => startQuizSession(quiz.id)}
                              className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                            >
                              Start Quiz
                            </button>
                          </div>
                        </div>
                      )}

                      {showQuestions === quiz.id && (
                        <div className="mt-6 pt-6 border-t border-gray-200">
                          <h3 className="text-lg font-semibold mb-4">Questions</h3>
                          <div className="bg-gray-50 p-4 rounded-lg mb-6">
                            <h4 className="font-medium mb-4">Add New Question</h4>
                            <form onSubmit={(e) => createQuestion(e, quiz.id)} className="space-y-4">
                              <div>
                                <label htmlFor="question-text" className="block mb-2 font-medium text-gray-700">Question Text:</label>
                                <input
                                  type="text"
                                  id="question-text"
                                  name="question_text"
                                  value={newQuestion.question_text}
                                  onChange={handleQuestionChange}
                                  required
                                  className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label htmlFor="answers" className="block mb-2 font-medium text-gray-700">Answers:</label>
                                <AnswerEditor
                                  initialAnswers={newQuestion.answers}
                                  onChange={handleAnswersChange}
                                />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label htmlFor="max-time" className="block mb-2 font-medium text-gray-700">Time Limit (seconds):</label>
                                  <input
                                    type="number"
                                    id="max-time"
                                    name="max_time"
                                    value={newQuestion.max_time}
                                    onChange={handleQuestionChange}
                                    min="5"
                                    max="300"
                                    required
                                    className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                                  />
                                </div>
                                <div>
                                  <label htmlFor="points" className="block mb-2 font-medium text-gray-700">Points:</label>
                                  <input
                                    type="number"
                                    id="points"
                                    name="points"
                                    value={newQuestion.points}
                                    onChange={handleQuestionChange}
                                    min="100"
                                    max="10000"
                                    step="100"
                                    required
                                    className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                                  />
                                </div>
                              </div>
                              <button
                                type="submit"
                                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                              >
                                Add Question
                              </button>
                            </form>
                          </div>

                          <div className="space-y-4">
                            {questions.length === 0 ? (
                              <p className="text-gray-600">No questions for this quiz yet.</p>
                            ) : (
                              questions.map((question) => (
                                <div key={question.id} className="bg-gray-50 p-4 rounded-lg">
                                  <h4 className="font-medium mb-2">{question.question_text}</h4>
                                  <p className="text-sm text-gray-600 mb-3">Time: {question.max_time}s | Points: {question.points}</p>
                                  <div className="mb-4">
                                    <p className="font-medium mb-2">Answers:</p>
                                    <ul className="space-y-2">
                                      {(typeof question.answers === 'string'
                                        ? JSON.parse(question.answers)
                                        : question.answers).map((answer, idx) => (
                                        <li key={idx} className={`flex items-center p-2 rounded border ${answer.isCorrect ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
                                          <span className="answer-marker">{idx + 1}</span>
                                          <span className="flex-grow">{answer.text}</span>
                                          {answer.isCorrect && <span className="text-green-600 font-bold ml-2">✓</span>}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <button
                                    onClick={() => deleteQuestion(question.id)}
                                    className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                  >
                                    Delete Question
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;