import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { TopologyPayload } from '../hooks/useAutopoieticStream';
import './PdeFormulaOverlay.css';

interface Props {
	event: TopologyPayload | null;
	connected: boolean;
}

export const PdeFormulaOverlay: React.FC<Props> = ({ event, connected }) => {
	const katexRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (katexRef.current && event?.equation) {
			const latexEq = event.equation
				.replaceAll('u_t =', '\\frac{\\partial u}{\\partial t} =')
				.replaceAll('*u_xx', '\\frac{\\partial^2 u}{\\partial x^2}')
				.replaceAll('*u_x', '\\frac{\\partial u}{\\partial x}')
				.replaceAll('*u^2', 'u^2')
				.replaceAll('*u', 'u');

			katex.render(latexEq, katexRef.current, {
				throwOnError: false,
				displayMode: true,
			});
		}
	}, [event]);

	const reLambdaMax = event?.reLambdaMax ?? 0;
	const residual = event?.residual ?? 0;
	const isCritical = event ? reLambdaMax > -0.05 : false;

	return (
		<div className={`pde-overlay-container ${isCritical ? 'critical': ''}`}>
			<div className="pde-header">
				<span className="pde-title">REVELATIO // AUTOPOIETIC CORE</span>
				<span className={`pde-status-badge ${connected ? 'linked' : 'offline'}`}>
					{connected ? 'GATEWAY LINKED' : 'OFFLINE'}
				</span>
			</div>

			<div className="pde-equation-box">
				{event?.equation ? (
					<div ref={katexRef} />
				) : (
					<span className="pde-waiting">Waiting for TDA Disruption & SINDy-PDE Event...</span>
				)}
			</div>

			{event && (
				<div className="pde-metrics-grid">
					<div>Re(Lambda_max): <strong className={isCritical ? 'metric-value-critical' : 'metric-value-stable'}>{reLambdaMax.toFixed(4)}</strong></div>
					<div>Status: <strong className={isCritical ? 'metric-value-critical' : 'metric-value-stable'}>{isCritical ? '[CRITICAL]' : '[STABLE]'}</strong></div>
					<div>Residual: <span>{residual.toFixed(6)}</span></div>
					<div>Write Index: <span>{event.writeIndex ?? 0}</span></div>
				</div>
			)}
		</div>
	);
};

