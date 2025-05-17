// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const Dashboard = () => {
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
  
  const handleAnswersChange = (e) => {
    try {
      // Validate JSON format
      JSON.parse(e.target.value);
      setNewQuestion({ ...newQuestion, answers: e.target.value });
    } catch (err) {
      // If JSON is invalid, don't update the state
      console.error('Invalid JSON format for answers');
    }
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
    return <div>Loading...</div>;
  }

  return (
    <div className="dashboard-container">
      <header>
        <h1>Quiz Dashboard</h1>
        <button onClick={handleSignOut}>Sign Out</button>
      </header>
      <main>
        {user && (
          <div>
            <p>Welcome, <strong>{user.email}</strong></p>
            
            <div className="quiz-creation">
              <h2>Create New Quiz</h2>
              <form onSubmit={createQuiz}>
                <div>
                  <label htmlFor="title">Quiz Title:</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={newQuiz.title}
                    onChange={handleQuizChange}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="visibility">Visibility:</label>
                  <select
                    id="visibility"
                    name="visibility"
                    value={newQuiz.visibility}
                    onChange={handleQuizChange}
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <button type="submit">Create Quiz</button>
              </form>
            </div>

            <div className="quiz-list">
              <h2>Your Quizzes</h2>
              {quizzes.length === 0 ? (
                <p>You haven't created any quizzes yet.</p>
              ) : (
                <div>
                  {quizzes.map((quiz) => (
                    <div key={quiz.id} className="quiz-item">
                      {editingQuiz && editingQuiz.id === quiz.id ? (
                        <form onSubmit={updateQuiz}>
                          <div>
                            <label htmlFor="edit-title">Quiz Title:</label>
                            <input
                              type="text"
                              id="edit-title"
                              name="title"
                              value={editingQuiz.title}
                              onChange={(e) => setEditingQuiz({...editingQuiz, title: e.target.value})}
                              required
                            />
                          </div>
                          <div>
                            <label htmlFor="edit-visibility">Visibility:</label>
                            <select
                              id="edit-visibility"
                              name="visibility"
                              value={editingQuiz.visibility}
                              onChange={(e) => setEditingQuiz({...editingQuiz, visibility: e.target.value})}
                            >
                              <option value="private">Private</option>
                              <option value="unlisted">Unlisted</option>
                              <option value="public">Public</option>
                            </select>
                          </div>
                          <button type="submit">Save</button>
                          <button type="button" onClick={() => setEditingQuiz(null)}>Cancel</button>
                        </form>
                      ) : (
                        <div>
                          <h3>{quiz.title}</h3>
                          <p>Visibility: {quiz.visibility}</p>
                          <div className="quiz-actions">
                            <button onClick={() => setEditingQuiz(quiz)}>Edit</button>
                            <button onClick={() => deleteQuiz(quiz.id)}>Delete</button>
                            <button onClick={() => toggleQuestionView(quiz.id)}>
                              {showQuestions === quiz.id ? 'Hide Questions' : 'Show Questions'}
                            </button>
                          </div>
                        </div>
                      )}

                      {showQuestions === quiz.id && (
                        <div className="questions-section">
                          <h3>Questions</h3>
                          <div className="question-form">
                            <h4>Add New Question</h4>
                            <form onSubmit={(e) => createQuestion(e, quiz.id)}>
                              <div>
                                <label htmlFor="question-text">Question Text:</label>
                                <input
                                  type="text"
                                  id="question-text"
                                  name="question_text"
                                  value={newQuestion.question_text}
                                  onChange={handleQuestionChange}
                                  required
                                />
                              </div>
                              <div>
                                <label htmlFor="answers">Answers (JSON format):</label>
                                <textarea
                                  id="answers"
                                  name="answers"
                                  value={newQuestion.answers}
                                  onChange={handleAnswersChange}
                                  required
                                  rows="6"
                                />
                                <small>Format: [{`"text": "Answer", "isCorrect": true/false`}, ...]</small>
                              </div>
                              <div>
                                <label htmlFor="max-time">Time Limit (seconds):</label>
                                <input
                                  type="number"
                                  id="max-time"
                                  name="max_time"
                                  value={newQuestion.max_time}
                                  onChange={handleQuestionChange}
                                  min="5"
                                  max="300"
                                  required
                                />
                              </div>
                              <div>
                                <label htmlFor="points">Points:</label>
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
                                />
                              </div>
                              <button type="submit">Add Question</button>
                            </form>
                          </div>

                          <div className="questions-list">
                            {questions.length === 0 ? (
                              <p>No questions for this quiz yet.</p>
                            ) : (
                              <div>
                                {questions.map((question) => (
                                  <div key={question.id} className="question-item">
                                    <h4>{question.question_text}</h4>
                                    <p>Time: {question.max_time}s | Points: {question.points}</p>
                                    <div className="answer-list">
                                      <p>Answers:</p>
                                      <ul>
                                        {(typeof question.answers === 'string' 
                                          ? JSON.parse(question.answers) 
                                          : question.answers).map((answer, idx) => (
                                          <li key={idx} style={{color: answer.isCorrect ? 'green' : 'black'}}>
                                            {answer.text} {answer.isCorrect ? '✓' : ''}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    <button onClick={() => deleteQuestion(question.id)}>Delete Question</button>
                                  </div>
                                ))}
                              </div>
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