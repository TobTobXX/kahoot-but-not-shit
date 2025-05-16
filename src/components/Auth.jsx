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
		<div className="auth-container">
		{!isLoggedIn ? (
			<div className="login-form">
				<h2>Welcome to Quiz App</h2>
				<p>Sign in or create an account to continue</p>
				<SupabaseAuth
					supabaseClient={supabase} 
					appearance={{ theme: ThemeSupa }}
					providers={[]} />
			</div>
		) : (
			<div className="welcome-message">
				<h2>Successfully logged in!</h2>
				<p>Welcome, <strong>{userInfo?.email}</strong></p>
				<button onClick={handleSignOut}>Sign Out</button>
			</div>
		)}
		</div>
	);
};

export default Auth;

