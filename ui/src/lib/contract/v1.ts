// The /api/v1 contract, as the UI reads it.
//
// Rules for this file (checked against ArkType 2.2.9, see ui/test/contract-v1.test.ts):
//  1. Every server response is parsed here and nowhere else; nothing is cast.
//  2. Every contract ends in `.onDeepUndeclaredKey('delete')`. ArkType keeps undeclared keys by
//     default, including an own `__proto__` made by JSON.parse; a boundary that parses untrusted
//     JSON must hand the app only what the contract names, at every depth.
//  3. An optional key is absent, never null. ArkType rejects `null` and `undefined` for `'key?'`
//     (exactOptionalPropertyTypes), so the server omits absent fields (api/DESIGN.md rule 5).
//  4. The TypeScript types are derived (`typeof X.infer`), never written beside the schema.
//  5. This folder is `contract`, not `api`: browser tests mock `**/api/**`, and the dev server serves
//     `src/lib/api/...` at a URL that glob matches, which turned the module into a 404 and the page
//     into a 500.
//  6. api/v1/openapi.yml describes the same shapes; the test compares them so they cannot drift.
import { type ArkErrors, type Type, type } from 'arktype';

/** One error shape for every route: RFC 9457 problem details, plus a message per form field. */
export const Problem = type({
	type: 'string > 0',
	title: 'string > 0',
	status: '400 <= number.integer < 600',
	'detail?': 'string',
	'fields?': { '[string]': 'string' }
}).onDeepUndeclaredKey('delete');
export type Problem = typeof Problem.infer;

/** org runs an organisation, owner runs a free-plan domain, admin operates the server. */
export const Role = type("'admin' | 'org' | 'owner' | 'user'");
export type Role = typeof Role.infer;

/**
 * GET /api/v1/me: who is signed in and what they may do. `email` is only required to be
 * non-empty: the recovery administrator is not an address, and a stricter rule would lock it out.
 */
export const Me = type({
	email: 'string > 0',
	role: Role,
	permissions: 'string[]',
	'edition?': 'string'
}).onDeepUndeclaredKey('delete');
export type Me = typeof Me.infer;

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: Problem };

/** A message per field, keyed by path (`list[0].n`), in the shape of `Problem.fields`. */
export function fieldMessages(errors: ArkErrors): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const [path, error] of Object.entries(errors.byPath)) fields[path] = error.message;
	return fields;
}

function malformed(errors: ArkErrors): Problem {
	return {
		type: 'malformed-response',
		title: 'The server sent something unexpected',
		status: 502,
		detail: errors.summary,
		fields: fieldMessages(errors)
	};
}

/**
 * Parses a response body. A body that is not the expected type is read as a Problem; a body that
 * is neither is reported as malformed. Never throws, never returns unvalidated data as success.
 */
export function parse<T>(schema: Type<T>, body: unknown): Parsed<Type<T>['infer']> {
	const value = schema(body);
	if (!(value instanceof type.errors)) return { ok: true, value };
	const problem = Problem(body);
	if (!(problem instanceof type.errors)) return { ok: false, problem };
	return { ok: false, problem: malformed(value) };
}
