// src/pages/SessionHost.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const SessionHost = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentState, setCurrentState] = useState('waiting');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Fetch session data, quiz details, and questions
  useEffect(() => {
    const fetchSessionData = async () => {
      setLoading(true);
      try {
        // Get session data
        const { data: sessionData, error: sessionError } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (sessionError) throw sessionError;
        setSession(sessionData);
        setCurrentState(sessionData.current_state);
        setCurrentQuestionIndex(sessionData.current_question_index);

        // Get quiz data
        const { data: quizData, error: quizError } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', sessionData.quiz_id)
          .single();

        if (quizError) throw quizError;
        setQuiz(quizData);

        // Get questions
        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .eq('quiz_id', sessionData.quiz_id)
          .order('id');

        if (questionsError) throw questionsError;
        setQuestions(questionsData);

      } catch (err) {
        console.error('Error fetching session data:', err);
        setError('Failed to load session data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (sessionId) {
      fetchSessionData();
    }
  }, [sessionId]);

  // Subscribe to real-time updates for the session
  useEffect(() => {
    if (!sessionId) return;

    const subscription = supabase
      .channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setCurrentState(payload.new.current_state);
          setCurrentQuestionIndex(payload.new.current_question_index);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId]);

  // Update session state
  const updateSessionState = async (newState, newQuestionIndex = currentQuestionIndex) => {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          current_state: newState,
          current_question_index: newQuestionIndex,
          state_changed_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating session state:', err);
      setError('Failed to update session state. Please try again.');
    }
  };

  // Start the quiz (move from waiting to first question)
  const startQuiz = async () => {
    await updateSessionState('question', 0);
  };

  // Show correct answer for current question
  const showAnswer = async () => {
    await updateSessionState('answer_reveal');
  };

  // Show scoreboard
  const showScoreboard = async () => {
    await updateSessionState('scoreboard');
  };

  // Move to next question
  const nextQuestion = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      await updateSessionState('question', currentQuestionIndex + 1);
    } else {
      // No more questions, end the quiz
      await updateSessionState('completed');
    }
  };

  // End the quiz
  const endQuiz = async () => {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          current_state: 'completed',
          ended_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (err) {
      console.error('Error ending quiz:', err);
      setError('Failed to end the quiz. Please try again.');
    }
  };

  // Return to dashboard
  const returnToDashboard = () => {
    navigate('/dashboard');
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading session...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={returnToDashboard}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (!session || !quiz) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <p className="text-red-600 mb-4">Session not found.</p>
        <button
          onClick={returnToDashboard}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  // Get current question if in question or answer_reveal state
  const currentQuestion = (currentState === 'question' || currentState === 'answer_reveal') && 
                         currentQuestionIndex < questions.length 
                           ? questions[currentQuestionIndex] 
                           : null;

  return (
    <div className="max-w-7xl mx-auto p-8">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Host Session</h1>
        <div className="flex space-x-4">
          <button
            onClick={returnToDashboard}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Back to Dashboard
          </button>
          <button
            onClick={endQuiz}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            End Quiz
          </button>
        </div>
      </header>

      <main>
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">{quiz.title}</h2>
            <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-lg font-medium">
              Join Code: <span className="font-bold">{session.code}</span>
            </span>
          </div>
          
          <div className="mb-4">
            <p className="text-gray-600">
              <span className="font-semibold">State:</span> {currentState}
            </p>
            <p className="text-gray-600">
              <span className="font-semibold">Question:</span> {currentQuestionIndex + 1} of {questions.length}
            </p>
          </div>

          {/* Waiting Lobby */}
          {currentState === 'waiting' && (
            <div className="bg-gray-50 p-6 rounded-lg mb-6">
              <h3 className="text-lg font-semibold mb-4">Waiting for participants</h3>
              <p className="mb-4">Share the join code with participants to let them join.</p>
              <button
                onClick={startQuiz}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                Start Quiz
              </button>
            </div>
          )}

          {/* Question Display */}
          {currentState === 'question' && currentQuestion && (
            <div className="bg-gray-50 p-6 rounded-lg mb-6">
              <h3 className="text-lg font-semibold mb-4">Question {currentQuestionIndex + 1}</h3>
              <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
                <p className="font-medium text-lg mb-2">{currentQuestion.question_text}</p>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Time: {currentQuestion.max_time}s</span>
                  <span>Points: {currentQuestion.points}</span>
                </div>
              </div>
              <button
                onClick={showAnswer}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Show Answer
              </button>
            </div>
          )}

          {/* Answer Reveal */}
          {currentState === 'answer_reveal' && currentQuestion && (
            <div className="bg-gray-50 p-6 rounded-lg mb-6">
              <h3 className="text-lg font-semibold mb-4">Answer Reveal</h3>
              <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
                <p className="font-medium text-lg mb-2">{currentQuestion.question_text}</p>
                <div className="mt-4">
                  <p className="font-medium mb-2">Answers:</p>
                  <ul className="space-y-2">
                    {(typeof currentQuestion.answers === 'string'
                      ? JSON.parse(currentQuestion.answers)
                      : currentQuestion.answers).map((answer, idx) => (
                      <li key={idx} className={`flex items-center p-2 rounded border ${answer.isCorrect ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
                        <span className="answer-marker">{idx + 1}</span>
                        <span className="flex-grow">{answer.text}</span>
                        {answer.isCorrect && <span className="text-green-600 font-bold ml-2">✓</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                onClick={showScoreboard}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Show Scoreboard
              </button>
            </div>
          )}

          {/* Scoreboard Display */}
          {currentState === 'scoreboard' && (
            <div className="bg-gray-50 p-6 rounded-lg mb-6">
              <h3 className="text-lg font-semibold mb-4">Scoreboard</h3>
              <div className="mb-4">
                <p className="text-gray-600">Participant scores will be displayed here.</p>
              </div>
              <button
                onClick={nextQuestion}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'End Quiz'}
              </button>
            </div>
          )}

          {/* Completed Quiz */}
          {currentState === 'completed' && (
            <div className="bg-gray-50 p-6 rounded-lg mb-6">
              <h3 className="text-lg font-semibold mb-4">Quiz Completed</h3>
              <div className="mb-4">
                <p className="text-gray-600">The quiz has ended. Final scores are displayed below.</p>
              </div>
              <button
                onClick={returnToDashboard}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Return to Dashboard
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SessionHost;