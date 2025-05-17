// src/pages/Home.jsx
import Auth from '../components/Auth';

const Home = () => {
	return (
		<div className="max-w-7xl mx-auto p-8">
			<header className="mb-8 flex justify-between items-center">
				<h1 className="text-3xl font-bold">Quiz App</h1>
				<p className="text-gray-600">Create and join interactive quizzes</p>
			</header>
			<main>
				<Auth />
			</main>
		</div>
	);
};

export default Home;

