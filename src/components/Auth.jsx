// src/components/Auth.jsx
import { useState } from 'react';
import { Auth as SupabaseAuth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../lib/supabase';

const Auth = () => {
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [userInfo, setUserInfo] = useState(null);

	supabase.auth.onAuthStateChange((event, session) => {
		if (event === 'SIGNED_IN' && session) {
			setIsLoggedIn(true);
			setUserInfo(session.user);
		}
	});

	const handleSignOut = async () => {
		await supabase.auth.signOut();
		setIsLoggedIn(false);
		setUserInfo(null);
	};

	return (
		<div className="max-w-md mx-auto p-8 bg-white rounded-lg shadow-md">
		{!isLoggedIn ? (
			<div className="space-y-4">
				<h2 className="text-2xl font-bold">Welcome to Quiz App</h2>
				<p className="text-gray-600">Sign in or create an account to continue</p>
				<SupabaseAuth
					supabaseClient={supabase}
					appearance={{ theme: ThemeSupa }}
					providers={[]} />
			</div>
		) : (
			<div className="text-center space-y-4">
				<h2 className="text-2xl font-bold">Successfully logged in!</h2>
				<p className="text-gray-700">Welcome, <strong>{userInfo?.email}</strong></p>
				<button
					onClick={handleSignOut}
					className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
				>
					Sign Out
				</button>
			</div>
		)}
		</div>
	);
};

export default Auth;

