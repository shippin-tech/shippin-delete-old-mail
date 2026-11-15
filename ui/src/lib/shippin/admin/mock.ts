// Mock data for the admin stories. No network, no real keys; example.org addresses only.

import type { StoredTrace } from '$lib/adapter/trace';
import type { PortalSchema, ReferenceOption } from '$lib/portal/schema';
import type { TraceEvent } from '$lib/portal/trace';

export const domainSchema: PortalSchema = {
	objects: { 'x:Domain': { type: 'collection' } },
	lists: { 'x:Domain': { labelProperty: 'name' } },
	fields: {
		'x:Domain': {
			properties: {
				name: {
					type: { type: 'string' },
					update: 'immutable',
					description: 'The domain mail is received for.'
				},
				description: { type: { type: 'string', nullable: true }, update: 'mutable' },
				isEnabled: { type: { type: 'boolean' }, update: 'mutable' },
				certificateManagement: {
					type: { type: 'enum', enumName: 'CertificateManagement' },
					update: 'mutable'
				},
				createdAt: { type: { type: 'string' }, update: 'serverSet' }
			},
			defaults: { isEnabled: true, certificateManagement: 'automatic', name: '', description: null }
		}
	},
	forms: {
		'x:Domain': {
			title: 'Domain',
			sections: [
				{
					title: 'General',
					fields: [
						{ name: 'name', label: 'Domain name' },
						{ name: 'description', label: 'Description' },
						{ name: 'isEnabled', label: 'Enabled' }
					]
				},
				{
					title: 'Certificates',
					fields: [{ name: 'certificateManagement', label: 'Certificate management' }]
				}
			]
		}
	},
	schemas: {},
	enums: {
		CertificateManagement: [
			{ name: 'manual', label: 'Manual' },
			{ name: 'automatic', label: 'Automatic (ACME)' }
		]
	}
};

export const domainRecords: Record<string, unknown>[] = [
	{
		id: 'd1',
		name: 'example.org',
		description: 'Main domain',
		isEnabled: true,
		certificateManagement: 'automatic',
		createdAt: '2026-11-01T09:00:00Z'
	},
	{
		id: 'd2',
		name: 'mail.example.net',
		description: null,
		isEnabled: true,
		certificateManagement: 'manual',
		createdAt: '2026-11-04T14:30:00Z'
	},
	{
		id: 'd3',
		name: 'old.example.com',
		description: 'Retiring',
		isEnabled: false,
		certificateManagement: 'manual',
		createdAt: '2026-10-12T08:15:00Z'
	}
];

export const domainRows: Record<string, string>[] = domainRecords.map((r) => ({
	name: String(r.name),
	isEnabled: r.isEnabled ? 'Yes' : 'No',
	certificateManagement: String(r.certificateManagement),
	dnsManagement: 'Manual'
}));

export const references = async (): Promise<ReferenceOption[]> => [
	{ id: 'a1', label: 'ada@example.org' },
	{ id: 'a2', label: 'sales@example.org' },
	{ id: 'a3', label: 'postmaster@example.net' }
];

const kv = (key: string, text: string) => ({ key, value: { type: 'string', text } });

export const traceEvents: TraceEvent[] = [
	{
		event: 'smtp.connection-start',
		timestamp: '2026-11-14T10:00:00.000Z',
		keyValues: [kv('remoteIp', '203.0.113.7')]
	},
	{
		event: 'smtp.mail-from',
		timestamp: '2026-11-14T10:00:00.120Z',
		keyValues: [kv('from', 'ada@example.org')]
	},
	{
		event: 'smtp.rcpt-to',
		timestamp: '2026-11-14T10:00:00.180Z',
		keyValues: [kv('to', 'grace@example.net')]
	},
	{
		event: 'delivery.mx-lookup-failed',
		timestamp: '2026-11-14T10:00:01.050Z',
		keyValues: [kv('domain', 'example.net'), kv('reason', 'NXDOMAIN')]
	},
	{ event: 'smtp.connection-end', timestamp: '2026-11-14T10:00:01.400Z', keyValues: [] }
];

export const storedTraces: StoredTrace[] = [
	{
		id: 't1',
		kind: 'delivery',
		started: 1794736800000,
		ended: 1794736801400,
		ip: '203.0.113.7',
		from: ['ada@example.org'],
		to: ['grace@example.net'],
		problems: 1,
		events: 5
	},
	{
		id: 't2',
		kind: 'delivery',
		started: 1794733200000,
		ended: 1794733200900,
		ip: '198.51.100.20',
		from: ['sales@example.org'],
		to: ['buyer@example.com'],
		problems: 0,
		events: 12
	},
	{
		id: 't3',
		kind: 'inbound',
		started: 1794729600000,
		ended: 1794729600300,
		ip: '192.0.2.44',
		from: [],
		to: ['ada@example.org'],
		problems: 2,
		events: 7
	}
];

export const actionSchema: PortalSchema = {
	objects: {},
	lists: {},
	fields: {
		'x:ReloadTlsCertificates': { properties: {} },
		'x:TroubleshootDelivery': {
			properties: {
				recipient: { type: { type: 'string' }, update: 'mutable' },
				includeDns: { type: { type: 'boolean' }, update: 'mutable' }
			},
			defaults: { recipient: '', includeDns: true }
		}
	},
	forms: {
		'x:TroubleshootDelivery': {
			sections: [
				{
					title: 'Delivery check',
					fields: [
						{ name: 'recipient', label: 'Recipient address' },
						{ name: 'includeDns', label: 'Include DNS lookups' }
					]
				}
			]
		}
	},
	schemas: {
		'x:Action': {
			type: 'multiple',
			variants: [
				{ name: 'ReloadTlsCertificates', label: 'Reload: TLS certificates', schemaName: '' },
				{
					name: 'TroubleshootDelivery',
					label: 'Troubleshoot: Delivery',
					schemaName: 'x:TroubleshootDelivery'
				}
			]
		}
	},
	enums: {}
};
