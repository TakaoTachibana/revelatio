import React from 'react';
import { useAutopoieticStream } from './hooks/useAutopoieticStream';
import { PdeFormulaOverlay } from './components/PdeFormulaOverlay';
import { PhaseSpaceCanvas } from './components/PhaseSpaceCanvas';
import { TriggerPostsOverlay} from './components/TriggerPostsOverlay';
import './App.css';

export const App: React.FC = () => {
	const { event, triggerPosts, connected } = useAutopoieticStream();
	const isCritical = event ? event.reLambdaMax > -0.05 : false;

	return (
		<div className="app-container">
			<PdeFormulaOverlay event={event} connected={connected} />
			<TriggerPostsOverlay posts={triggerPosts} isCritical={isCritical} />
			<PhaseSpaceCanvas event={event} />
		</div>
	);
};

export default App;

