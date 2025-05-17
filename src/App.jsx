// src/App.jsx
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import SessionHost from './pages/SessionHost';

function App() {
	const [session, setSession] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		// Get initial session
		supabase.auth.getSession().then(({ data: { session } }) => {
			setSession(session);
			setLoading(false);
		});

		// Listen for auth changes
		const { data: { subscription } } = supabase.auth.onAuthStateChange(
			(_event, session) => {
				setSession(session);
			}
		);

		return () => subscription.unsubscribe();
	}, []);

	if (loading) {
		return <div>Loading...</div>;
	}

	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={!session ? <Home /> : <Navigate to="/dashboard" />} />
				<Route
					path="/dashboard"
					element={session ? <Dashboard /> : <Navigate to="/" />} />
				<Route
					path="/session/:sessionId"
					element={session ? <SessionHost /> : <Navigate to="/" />} />
			</Routes>
		</BrowserRouter>
	);
}

export default App;

