import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type } from 'arktype';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { fieldMessages, Me, Problem, parse, Role } from '../src/lib/contract/v1';

const valid = { email: 'a@b.test', role: 'admin', permissions: ['sysDomainCreate'] };

describe('success and failure', () => {
	it('reads a valid /me', () => {
		const r = parse(Me, valid);
		expect(r.ok && r.value).toEqual(valid);
	});

	it('reads an error body as a Problem, including the server 401 as sent today', () => {
		const r = parse(Me, {
			type: 'about:blank',
			status: 401,
			title: 'Unauthorized',
			detail: 'You have to authenticate first.'
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.problem.status).toBe(401);
			expect(r.problem.type).toBe('about:blank');
		}
	});

	it('keeps form field messages on a Problem', () => {
		const r = parse(Me, { type: 'invalid', title: 'No', status: 422, fields: { name: 'Required' } });
		expect(!r.ok && r.problem.fields).toEqual({ name: 'Required' });
	});

	it('reports anything else as malformed with a message per path, never as success', () => {
		const r = parse(Me, { email: 'a@b.test', role: 'root', permissions: [1] });
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.problem.type).toBe('malformed-response');
			expect(r.problem.status).toBe(502);
			expect(Object.keys(r.problem.fields ?? {}).sort()).toEqual(['permissions[0]', 'role']);
		}
	});

	it.each([null, undefined, 'text', 42, [], true])('refuses a body that is %j', (body) => {
		expect(parse(Me, body).ok).toBe(false);
	});

	it('does not read a success body as a Problem or the reverse', () => {
		expect(Problem(valid) instanceof type.errors).toBe(true);
		expect(parse(Problem, valid).ok).toBe(false);
	});
});

describe('boundary rules (ArkType 2.2.9 behaviour these depend on)', () => {
	it('drops undeclared keys at every depth, including __proto__ and constructor', () => {
		const body = JSON.parse(
			'{"email":"a@b.test","role":"user","permissions":["x"],"extra":1,"__proto__":{"polluted":true},"constructor":{"bad":1}}'
		);
		const r = parse(Me, body);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(Object.keys(r.value).sort()).toEqual(['email', 'permissions', 'role']);
			expect(Object.hasOwn(r.value, '__proto__')).toBe(false);
			expect(Object.hasOwn(r.value, 'constructor')).toBe(false);
		}
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it('strips undeclared keys inside nested Problem fields objects too', () => {
		const r = Problem(JSON.parse('{"type":"t","title":"T","status":400,"x":1}'));
		expect(r instanceof type.errors).toBe(false);
		expect(Object.keys(r as object).sort()).toEqual(['status', 'title', 'type']);
	});

	it('an optional field is omitted, never null or undefined', () => {
		expect(parse(Me, valid).ok).toBe(true);
		expect(parse(Me, { ...valid, edition: 'oss' }).ok).toBe(true);
		expect(parse(Me, { ...valid, edition: null }).ok).toBe(false);
		expect(parse(Me, { ...valid, edition: undefined }).ok).toBe(false);
	});

	it('an error status must be 4xx or 5xx', () => {
		for (const status of [200, 399, 600, 401.5]) {
			expect(parse(Me, { type: 't', title: 'T', status }).ok).toBe(false);
		}
		for (const status of [400, 404, 599]) {
			expect(parse(Me, { type: 't', title: 'T', status }).ok).toBe(false); // a Problem, not an Me
			expect(Problem({ type: 't', title: 'T', status }) instanceof type.errors).toBe(false);
		}
	});

	it('requires a non-empty email but does not require an address (recovery admin)', () => {
		expect(parse(Me, { ...valid, email: 'admin' }).ok).toBe(true);
		expect(parse(Me, { ...valid, email: '' }).ok).toBe(false);
	});

	it('fieldMessages gives one message per path', () => {
		const errors = Me({ email: 1, role: 'x', permissions: 'y' });
		if (!(errors instanceof type.errors)) throw new Error('expected the body to be refused');
		expect(Object.keys(fieldMessages(errors)).sort()).toEqual(['email', 'permissions', 'role']);
	});
});

// The contract and api/v1/openapi.yml must describe the same shapes.
describe('contract matches api/v1/openapi.yml', () => {
	const spec = parseYaml(readFileSync(resolve(__dirname, '../../api/v1/openapi.yml'), 'utf8')) as {
		components: { schemas: Record<string, Record<string, unknown>> };
	};
	const schemas = spec.components.schemas;
	const shape = (s: Record<string, unknown>) => ({
		required: [...((s.required as string[]) ?? [])].sort(),
		properties: Object.keys((s.properties as object) ?? {}).sort()
	});
	const fromArk = (t: { toJsonSchema(): unknown }) => {
		const j = t.toJsonSchema() as { required?: string[]; properties?: object };
		return { required: [...(j.required ?? [])].sort(), properties: Object.keys(j.properties ?? {}).sort() };
	};

	it('Me: same properties and required keys', () => {
		expect(fromArk(Me)).toEqual(shape(schemas.Me));
	});

	it('Problem: same properties and required keys', () => {
		expect(fromArk(Problem)).toEqual(shape(schemas.Problem));
	});

	it('Role: same values', () => {
		const ark = (Role.toJsonSchema() as { enum: string[] }).enum;
		expect([...ark].sort()).toEqual([...(schemas.Role.enum as string[])].sort());
	});

	it('Problem status range is the same', () => {
		const p = (schemas.Problem.properties as Record<string, { minimum: number; maximum: number }>).status;
		const j = (
			Problem.toJsonSchema() as { properties: { status: { minimum: number; exclusiveMaximum: number } } }
		).properties.status;
		expect([p.minimum, p.maximum + 1]).toEqual([j.minimum, j.exclusiveMaximum]);
	});
});
