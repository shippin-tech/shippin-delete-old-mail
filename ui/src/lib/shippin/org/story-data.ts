// Sample data for the organisation stories. Example domains only; nothing here reaches a server.
import type { DnsCheck } from '$lib/panel/model';
import type { MyOrg, Organisation, OrgDns, OrgDomain, OrgPerson, OrgTeam } from './orgs-call';

const GB = 1024 ** 3;

export const domains: OrgDomain[] = [
	{ id: 'd1', name: 'example.org' },
	{ id: 'd2', name: 'lab.example.org' }
];

export const people: OrgPerson[] = [
	{
		id: 'p1',
		name: 'ada',
		email: 'ada@example.org',
		domainId: 'd1',
		fullName: 'Ada Lovelace',
		limit: 5 * GB,
		used: 1.2 * GB,
		aliases: ['accounts@example.org'],
		teamIds: ['t1'],
		admin: true,
		protected: false
	},
	{
		id: 'p2',
		name: 'grace',
		email: 'grace@example.org',
		domainId: 'd1',
		fullName: 'Grace Hopper',
		limit: 5 * GB,
		used: 4.6 * GB,
		aliases: [],
		teamIds: ['t1', 't2'],
		admin: false,
		protected: false
	},
	{
		id: 'p3',
		name: 'root',
		email: 'root@example.org',
		domainId: 'd1',
		fullName: 'Server administrator',
		limit: null,
		used: 0,
		aliases: [],
		teamIds: [],
		admin: true,
		protected: true
	}
];

export const teams: OrgTeam[] = [
	{
		id: 't1',
		name: 'support',
		email: 'support@example.org',
		domainId: 'd1',
		description: 'Shared support inbox'
	},
	{ id: 't2', name: 'billing', email: 'billing@lab.example.org', domainId: 'd2', description: '' }
];

export const org: MyOrg = {
	name: 'Example Lab',
	maxPeople: 25,
	maxStorage: 50 * GB,
	storageHeld: 15 * GB,
	storageUsed: 5.8 * GB,
	domains,
	people,
	teams,
	me: 'p1'
};

export const fullOrg: MyOrg = { ...org, maxPeople: 3, storageUsed: 49 * GB };

export const organisations: Organisation[] = [
	{
		id: 'o1',
		name: 'Example Lab',
		domains: ['d1', 'd2'],
		admins: ['ada@example.org'],
		maxPeople: 25,
		maxStorage: 50 * GB,
		createdAt: 1_760_000_000,
		people: 3,
		storageHeld: 15 * GB
	},
	{
		id: 'o2',
		name: 'Unlimited Co',
		domains: [],
		admins: [],
		maxPeople: 0,
		maxStorage: 0,
		createdAt: 1_761_000_000,
		people: 0,
		storageHeld: 0
	}
];

const checks: DnsCheck[] = [
	{
		kind: 'MX',
		name: 'example.org',
		expected: '10 mail.example.org.',
		state: 'found',
		actual: '10 mail.example.org.'
	},
	{
		kind: 'SPF',
		name: 'example.org',
		expected: 'v=spf1 mx -all',
		state: 'different',
		actual: 'v=spf1 include:_spf.example.net ~all'
	},
	{
		kind: 'DKIM',
		name: 'default._domainkey.example.org',
		expected: 'v=DKIM1; k=rsa; p=MIIB',
		state: 'missing',
		actual: null
	},
	{
		kind: 'DMARC',
		name: '_dmarc.example.org',
		expected: 'v=DMARC1; p=reject',
		state: 'found',
		actual: 'v=DMARC1; p=reject'
	}
];

export const dns: Record<string, OrgDns | undefined> = {
	d1: {
		domain: 'example.org',
		zone: 'example.org. 3600 IN MX 10 mail.example.org.\nexample.org. 3600 IN TXT "v=spf1 mx -all"',
		records: checks
	}
};
