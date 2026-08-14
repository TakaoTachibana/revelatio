import { useEffect, useState, useRef } from 'react';

export interface TopologyPayload {
	timestamp: number;
	writeIndex: number;
	reLambdaMax: number;
	equation: string;
	coefficients: number[];
	residual: number;
}

export interface TriggerPost {
	slotIndex: number;
	uri: string;
	author: string;
	text: string;
	contributionScore: number;
}

export interface AutopoieticEvent {
	type: string;
	payload: any;
	triggerPosts?: TriggerPost[];
	persistentId?: string;
}

function getNum(obj: any, keys: string[]): number {
	if (!obj) {
		return 0;
	}
	for (const k of keys) {
		if (obj[k] !== undefined && obj[k] !== null) {
			const num = Number(obj[k]);
			if (!isNaN(num)) {
				return num;
			}
		}
	}
	return 0;
}

export function useAutopoieticStream(wsUrl = 'ws://127.0.0.1:5000/ws') {
	const [event, setEvent] = useState<TopologyPayload | null>(null);
	const [triggerPosts, setTriggerPosts] = useState<TriggerPost[]>([]);
	const [connected, setConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		let isDisposed = false;
		let reconnectTimer: number | null = null;

		function connect() {
			if (isDisposed) {
				return;
			}

			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				if (isDisposed) {
					ws.close();
					return;
				}
				setConnected(true);
				console.log('[WebUI] Connected to C# Gateway WebSocket.');
			};

			ws.onmessage = (msg) => {
				if (isDisposed) {
					return;
				}
				try {
					const data: AutopoieticEvent = JSON.parse(msg.data);
					const raw = data.payload || data;

					const normalized: TopologyPayload = {
						timestamp: getNum(raw, ['timestamp', 'Timestamp']),
						writeIndex: getNum(raw, ['writeIndex', 'WriteIndex', 'write_index']),
						reLambdaMax: getNum(raw, ['reLambdaMax', 'ReLambdaMax', 're_lambda_max']),
						equation: raw.equation ?? raw.Equation ?? raw.equation_str ?? '',
						coefficients: raw.coefficients ?? raw.Coefficients ?? raw.coefficients ?? [],
						residual: getNum(raw, ['residual', 'Residual', 'residual_error']),
					};

					setEvent(normalized);
					if (data.triggerPosts) {
						setTriggerPosts(data.triggerPosts);
					}
				}	catch (e) {
					console.error('[WebUI] WebSocket parse error:', e);
				}
			};

			ws.onclose = () => {
				if (isDisposed) {
					return;
				}
				setConnected(false);
				reconnectTimer = window.setTimeout(connect, 3000);
			};

			ws.onerror = (err) => {
				if (isDisposed) {
					return;
				}
				console.error('[WebUI] WebSocket error:', err);
				ws.close();
			};
		}

		connect();

		return () => {
			isDisposed = true;
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
			}
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [wsUrl]);

	return { event, triggerPosts, connected };
}

