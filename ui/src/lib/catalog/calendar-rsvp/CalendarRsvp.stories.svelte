<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CalendarRsvp from './CalendarRsvp.svelte';

	const { Story } = defineMeta({
		title: 'Calendar/Invitation reply',
		component: CalendarRsvp,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: {
			variant: 'invitation',
			summary: 'Team lunch',
			organizer: 'Priya Shah',
			when: 'Friday 20 November, 12:30 to 13:30',
			recurrence: '',
			location: 'The Corner Cafe, 12 Mill Street',
			description: 'Come and say hello to our new teammates.',
			conference: '',
			conferenceUrl: '',
			attendees: [
				{ name: 'Priya Shah', email: 'priya@bakery.example' },
				{ name: 'Sam Rivera', email: 'sam@bakery.example' },
				{ email: 'guest@example.org' }
			],
			selected: '',
			note: '',
			alert: '',
			pending: false,
			recorded: '',
			onselect: () => {},
			onsend: () => {},
			onchange: () => {}
		}
	});
</script>

<Story name="Invitation" />
<Story name="Invitation, Yes chosen" args={{ selected: 'accepted', note: 'See you there!' }} />
<Story name="Invitation, sending" args={{ selected: 'tentative', pending: true }} />
<Story name="Invitation, error" args={{ selected: 'declined', alert: 'The reply could not be sent. Try again in a minute.' }} />
<Story name="Update" args={{ variant: 'update', when: 'Friday 20 November, now 13:00 to 14:00' }} />
<Story name="Cancelled" args={{ variant: 'cancel' }} />
<Story name="Reply recorded" args={{ variant: 'recorded', selected: 'accepted', recorded: 'Your reply was sent to Priya Shah.' }} />
<Story
	name="Long text and video call"
	args={{
		summary: 'Quarterly planning review for the whole kitchen, front of house and delivery teams, with a very long title',
		recurrence: 'Every month on the first Friday',
		description: 'Please bring your notes from last quarter. '.repeat(12),
		conference: 'Video meeting',
		conferenceUrl: 'https://meet.example.org/room/quarterly-planning'
	}}
/>
