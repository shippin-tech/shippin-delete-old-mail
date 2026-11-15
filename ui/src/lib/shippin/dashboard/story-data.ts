// Sample statistics for the dashboard stories. Generated, not measured; nothing here reaches a server.
import type { ChartSeries, Stats, StatsSeries } from './stats-call';

const POINTS = 24;
const STEP = 3600;

/** A smooth, repeatable curve so stories look the same every time. */
export function wave(scale: number, shift = 0, points = POINTS): number[] {
	return Array.from({ length: points }, (_, i) =>
		Math.round(scale * (1.2 + Math.sin((i + shift) / 3) + 0.3 * Math.cos(i * 1.7)))
	);
}

export const labels = Array.from({ length: POINTS }, (_, i) => `${String(i).padStart(2, '0')}:00`);

export const series: ChartSeries[] = [
	{ label: 'received', values: wave(40) },
	{ label: 'sent', values: wave(18, 2) }
];

export const singleSeries: ChartSeries[] = [{ label: 'failed sign-ins', values: wave(6, 4) }];

export const emptySeries: ChartSeries[] = [{ label: 'received', values: new Array(POINTS).fill(0) }];

export const gappySeries: ChartSeries[] = [
	{ label: 'average delivery time', values: wave(900).map((v, i) => (i % 5 === 2 ? null : v)) }
];

function count(values: number[], previous: number): StatsSeries {
	return { kind: 'count', values, total: values.reduce((a, b) => a + b, 0), previous };
}

const NOW = 1_763_000_000;

export const stats: Stats = {
	period: '24h',
	start: NOW - POINTS * STEP,
	step: STEP,
	points: POINTS,
	since: NOW - 30 * 86_400,
	node: null,
	nodes: 1,
	nodeList: [{ id: 1, hostname: 'mail.example.org' }],
	live: { 'user.count': 42, 'domain.count': 6, 'server.memory': 1_503_238_553, 'queue.count': 3 },
	history: {
		'queue.message-queued': count(wave(40), 820),
		'queue.authenticated-message-queued': count(wave(18, 2), 400),
		'queue.dsn-queued': count(wave(2, 1), 30),
		'queue.report-queued': count(wave(1, 3), 12),
		'security.authentication-error': count(wave(6, 4), 70)
	},
	descriptions: {
		'queue.message-queued': 'Messages accepted from remote senders.',
		'queue.authenticated-message-queued': 'Messages submitted by signed-in people.',
		'queue.dsn-queued': 'Delivery status notices queued.',
		'queue.report-queued': 'Reports queued.',
		'security.authentication-error': 'Failed sign-in attempts.'
	}
};
