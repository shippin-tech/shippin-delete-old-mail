<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { userEvent, within } from 'storybook/test';
	import Contact from './Contact.svelte';
	import type { AddressBook, Person } from '$lib/adapter/people-call';

	const yes = async () => true;
	const books: AddressBook[] = [
		{ id: 'b1', name: 'Contacts', isDefault: true, canWrite: true, canDelete: false },
		{ id: 'b2', name: 'Suppliers', isDefault: false, canWrite: true, canDelete: true }
	];
	const person = (id: string, given: string, surname: string, extra: Partial<Person> = {}): Person => ({
		id,
		addressBookIds: ['b1'],
		given,
		surname,
		displayName: `${given} ${surname}`.trim(),
		emails: [`${given.toLowerCase()}@example.org`],
		phones: [],
		organization: '',
		jobTitle: '',
		notes: '',
		...extra
	});
	const people: Person[] = [
		person('p1', 'Priya', 'Shah', { organization: 'Bakery Co', jobTitle: 'Head baker', phones: ['+44 20 7946 0000'], notes: 'Prefers email before 10am.' }),
		person('p2', 'Sam', 'Rivera', { addressBookIds: ['b2'], organization: 'Flour Mill Ltd' }),
		person('p3', 'Alexandria-Wilhelmina', 'Featherstonehaugh-Montgomery', {
			emails: ['alexandria.featherstonehaugh-montgomery@a-very-long-company-name.example.org', 'alex@home.example'],
			notes: 'A long note. '.repeat(30)
		})
	];

	const { Story } = defineMeta({
		title: 'Webmail/Contacts',
		component: Contact,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' },
		args: { people, books, notice: '', problem: '', onsave: yes, ondelete: yes, onaddbook: yes, ondeletebook: yes }
	});
</script>

<Story name="List" />
<Story
	name="Detail"
	play={async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole('button', { name: /Priya Shah/ }));
	}}
/>
<Story
	name="Form"
	play={async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole('button', { name: 'New contact' }));
	}}
/>
<Story name="Empty" args={{ people: [] }} />
<Story name="Notice" args={{ notice: 'Contact saved.' }} />
<Story name="Error" args={{ problem: 'Contacts could not be loaded. Check your connection.' }} />
