<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import Calendar from './Calendar.svelte';
	import type { CalendarInfo, EventItem } from '$lib/adapter/events-call';

	const yes = async () => true;
	const calendars: CalendarInfo[] = [
		{ id: 'c1', name: 'Personal', isDefault: true, canWrite: true, canDelete: false },
		{ id: 'c2', name: 'Bakery team', isDefault: false, canWrite: true, canDelete: true },
		{ id: 'c3', name: 'Holidays', isDefault: false, canWrite: false, canDelete: false }
	];

	const make = (id: string, title: string, day: string, from: string, to: string, extra: Partial<EventItem> = {}): EventItem => ({
		id,
		baseId: id,
		calendarIds: ['c1'],
		title,
		start: `${day}T${from}:00`,
		duration: 'PT1H',
		timeZone: null,
		utcStart: `${day}T${from}:00Z`,
		utcEnd: `${day}T${to}:00Z`,
		allDay: false,
		location: '',
		description: '',
		repeat: 'none',
		guests: [],
		isOrganizer: true,
		...extra
	});

	const events: EventItem[] = [
		make('e1', 'Dentist', '2026-11-04', '09:00', '10:00', { location: 'Main Street Dental' }),
		make('e2', 'Team lunch', '2026-11-20', '12:30', '13:30', {
			calendarIds: ['c2'],
			location: 'The Corner Cafe',
			description: 'Welcome our new teammates.',
			isOrganizer: false,
			guests: [
				{ key: 'g1', address: 'priya@bakery.example', name: 'Priya Shah', status: 'accepted', isOwner: true },
				{ key: 'g2', address: 'sam@bakery.example', name: 'Sam Rivera', status: 'needs-action', isOwner: false }
			]
		}),
		make('e3', 'Thanksgiving', '2026-11-26', '00:00', '23:59', { calendarIds: ['c3'], allDay: true }),
		make('e4', 'Weekly stock count', '2026-11-06', '15:00', '16:00', { calendarIds: ['c2'], repeat: 'weekly' }),
		make(
			'e5',
			'Quarterly planning review for the whole kitchen, front of house and delivery teams',
			'2026-11-12',
			'10:00',
			'12:00',
			{ description: 'Bring your notes. '.repeat(20) }
		)
	];

	const { Story } = defineMeta({
		title: 'Calendar/Calendar',
		component: Calendar,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' },
		args: {
			year: 2026,
			month: 10,
			weekStart: 1,
			calendars,
			events,
			hidden: new Set<string>(),
			notice: '',
			problem: '',
			self: 'sam@bakery.example',
			timeZone: 'Europe/London',
			onmonth: () => {},
			ontoggle: () => {},
			onsave: yes,
			ondelete: yes,
			onreply: yes,
			onaddcalendar: yes,
			ondeletecalendar: yes,
			onedit: async (event: EventItem) => event
		}
	});
</script>

<Story name="Month" />
<Story
	name="Agenda"
	play={async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole('button', { name: 'Agenda' }));
	}}
/>
<Story
	name="Event detail"
	play={async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole('button', { name: /Team lunch/ }));
	}}
/>
<Story
	name="Event form"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'New event' }));
		await expect(canvas.getAllByRole('textbox').length).toBeGreaterThan(0);
	}}
/>
<Story name="Empty month" args={{ events: [] }} />
<Story name="Some calendars hidden" args={{ hidden: new Set(['c2']) }} />
<Story name="Notice" args={{ notice: 'Your event was saved.' }} />
<Story name="Error" args={{ problem: 'The calendar could not be reached. Your changes were not saved.' }} />
