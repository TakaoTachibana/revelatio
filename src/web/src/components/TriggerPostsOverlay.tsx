import React, { useState, useEffect }  from 'react';
import { TriggerPost } from '../hooks/useAutopoieticStream';
import './TriggerPostsOverlay.css';

interface Props {
	posts: TriggerPost[];
	isCritical: boolean;
}

export const TriggerPostsOverlay: React.FC<Props> = ({ posts, isCritical }) => {
	const [isPaused, setIsPaused] = useState(false);
	const [stackedPosts, setStackedPosts] = useState<TriggerPost[]>([]);

	useEffect(() => {
		if (!isPaused && posts && posts.length > 0) {
			setStackedPosts((prev) => {
				const combined = [...posts, ...prev];
				const uniqueMap = new Map<string, TriggerPost>();
				for (const item of combined) {
					const key = item.uri || `${item.author}-${item.slotIndex}-${item.text.slice(0, 20)}`;
					if (!uniqueMap.has(key)) {
						uniqueMap.set(key, item);
					}
				}

				return Array.from(uniqueMap.values()).slice(0, 100);
			});
		}
	}, [posts, isPaused]);

	if (!stackedPosts || stackedPosts.length === 0) {
		return null;
	}

	return (
		<div 
			className="trigger-posts-container"
 			onMouseEnter={() => setIsPaused(true)}
			onMouseLeave={() => setIsPaused(false)}
		>
			<div className={`trigger-posts-header ${isCritical ? 'critical' : 'stable'}`}>
				{isCritical ? '! CRITICAL DISRUPTION // TRIGGER PARTICLES' : 'PERTURBED DRIFT // CONTRIBUTORY POSTS'}
			</div>
			<div className="header-count">
				{stackedPosts.length} / 100 LOGS
			</div>


			{stackedPosts.map((post, idx) => (
				<div key={idx} className={`trigger-post-card ${isCritical ? 'critical' : ''}`}>
					<div className="trigger-post-meta">
						<span className="trigger-post-author">DID: {post.author ? post.author.slice(0, 18) : 'unknown'}...</span>
						<span className="trigger-post-score">Score: {post.contributionScore ? post.contributionScore.toFixed(3) : '0.000'}</span>
					</div>
					<div className="trigger-post-body" dir="auto">
						{post.text}
					</div>
				</div>
			))}
		</div>
	);
};

