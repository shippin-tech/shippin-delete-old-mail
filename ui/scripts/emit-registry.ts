/**
 * Writes the contracts for every registry object from the server's own schema.
 *
 *   node --experimental-strip-types scripts/emit-registry.ts           write the files
 *   node --experimental-strip-types scripts/emit-registry.ts --check   fail if a file is stale
 *
 * Source: resources/schema/schema.json.gz, the same file the server embeds and validates against.
 * Output (one traversal, so the two cannot disagree):
 *   src/lib/contract/registry.generated.ts        the ArkType definitions (runtime checks)
 *   src/lib/contract/registry.types.generated.ts  the matching TypeScript types (compile time only)
 * The types are a separate file because TypeScript cannot infer types from a definition set this
 * large ("excessively deep"), and because types cost nothing at run time.
 *
 * Rules, each checked against live data by scripts/prove-registry-live.mjs:
 *  - Anything this script does not recognise stops it. Nothing is mapped to `unknown`.
 *  - READ: every key is optional (JMAP `get` may return a subset), values are typed, a nullable
 *    value is `T | null` (the server sends null, not a missing key). No range or format rules:
 *    reading must not reject something the server already stored.
 *  - CREATE: mutable and immutable properties. UPDATE: mutable ones. Server-set properties are
 *    left out, and size, range and non-negative rules from the schema are applied, so a form can
 *    refuse early what the server would refuse.
 *  - Formats such as emailAddress or ipNetwork are not re-implemented here. The server's rules
 *    are the authority; guessing them in a second place is how two copies disagree.
 *  - Sets, maps and object lists are `{ key: value }` objects on the wire. Their keys may not be
 *    __proto__, constructor or prototype: a key like that is dropped, never kept.
 *  - Enums use `type.enumerated`. A string union of this many literals takes minutes to build:
 *    400 literals took 5.8 s and 800 took 64 s when measured.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(root, '../resources/schema/schema.json.gz');
const runtimePath = resolve(root, 'src/lib/contract/registry.generated.ts');
const typesPath = resolve(root, 'src/lib/contract/registry.types.generated.ts');

type TypeDef = {
	type: string;
	nullable?: boolean;
	format?: string;
	min?: number;
	max?: number;
	minLength?: number;
	maxLength?: number;
	minItems?: number;
	enumName?: string;
	objectName?: string;
	class?: TypeDef;
	keyClass?: TypeDef;
	valueClass?: TypeDef;
};
type Property = { type: TypeDef; update: 'mutable' | 'immutable' | 'serverSet'; enterprise?: boolean };
type Variant = { name: string; schemaName?: string };
type Schema = { type: 'single'; schemaName: string } | { type: 'multiple'; variants: Variant[] };
type Schemas = {
	objects: Record<string, { type: 'object' | 'singleton' | 'view' }>;
	schemas: Record<string, Schema>;
	fields: Record<string, { properties: Record<string, Property> }>;
	enums: Record<string, { name: string }[]>;
};

const schema = JSON.parse(gunzipSync(readFileSync(schemaPath)).toString('utf8')) as Schemas;

type Mode = 'read' | 'create' | 'update';
/** A runtime definition (an ArkType string or object) and the TypeScript type that matches it. */
type Gen = { ark: string | Record<string, unknown>; ts: string };

/** One scope holds all three modes, told apart by this prefix; enums are shared. */
const P: Record<Mode, string> = { read: 'r', create: 'c', update: 'u' };

/** Enums used while generating; each becomes one alias in the scope and one type. */
const enumsUsed = new Set<string>();

const STRING_FORMATS = new Set([
	'string',
	'emailAddress',
	'uri',
	'text',
	'secret',
	'ipAddress',
	'ipNetwork',
	'html',
	'color',
	'socketAddress',
	'secretText'
]);
const NUMBER_FORMATS = new Set(['duration', 'unsignedInteger', 'size', 'float', 'integer']);
const SAFE_KEY = '[/^(?!(?:__proto__|constructor|prototype)$)[\\s\\S]+$/]';

function fail(message: string): never {
	throw new Error(`emit-registry: ${message}`);
}

function alias(name: string): string {
	return name.replace(/[^A-Za-z0-9]/g, '_');
}

function enumValues(name: string): string[] {
	const values = schema.enums[name];
	if (!values?.length) fail(`unknown or empty enum ${name}`);
	return values.map((v) => v.name);
}

const orNull = (t: TypeDef, g: Gen): Gen => {
	if (!t.nullable) return g;
	const ark: Gen['ark'] =
		typeof g.ark === 'string'
			? /\s/.test(g.ark)
				? `(${g.ark}) | null`
				: `${g.ark} | null`
			: { __or: [g.ark, 'null'] };
	return { ark, ts: `${g.ts} | null` };
};

function def(t: TypeDef, mode: Mode, where: string): Gen {
	const strict = mode !== 'read';
	const p = P[mode];
	switch (t.type) {
		case 'string': {
			if (!t.format || !STRING_FORMATS.has(t.format)) fail(`${where}: string format ${t.format}`);
			let ark = 'string';
			if (strict && t.maxLength !== undefined) ark = `string <= ${t.maxLength}`;
			if (strict && t.minLength !== undefined)
				ark = `${t.minLength} <= string${t.maxLength !== undefined ? ` <= ${t.maxLength}` : ''}`;
			return orNull(t, { ark, ts: 'string' });
		}
		case 'number': {
			if (!t.format || !NUMBER_FORMATS.has(t.format)) fail(`${where}: number format ${t.format}`);
			const kind = t.format === 'float' ? 'number' : 'number.integer';
			let ark = kind;
			if (strict) {
				const min = t.min ?? (t.format === 'unsignedInteger' || t.format === 'size' ? 0 : undefined);
				if (min !== undefined && t.max !== undefined) ark = `${min} <= ${kind} <= ${t.max}`;
				else if (min !== undefined) ark = `${kind} >= ${min}`;
				else if (t.max !== undefined) ark = `${kind} <= ${t.max}`;
			}
			return orNull(t, { ark, ts: 'number' });
		}
		case 'boolean':
			return orNull(t, { ark: 'boolean', ts: 'boolean' });
		case 'enum':
			if (!t.enumName) fail(`${where}: enum without a name`);
			enumsUsed.add(t.enumName);
			return orNull(t, { ark: `E_${alias(t.enumName)}`, ts: `E_${alias(t.enumName)}` });
		case 'objectId':
		case 'blobId':
		case 'utcDateTime':
			return orNull(t, { ark: 'string > 0', ts: 'string' });
		case 'object':
			if (!t.objectName || !schema.schemas[t.objectName]) fail(`${where}: unknown object ${t.objectName}`);
			return orNull(t, {
				ark: `${p}_T_${alias(t.objectName)}`,
				ts: `${p}_T_${alias(t.objectName)}`
			});
		case 'objectList': {
			const name = t.objectName ?? t.class?.objectName;
			if (!name || !schema.schemas[name]) fail(`${where}: unknown list object ${name}`);
			return orNull(t, {
				ark: { [SAFE_KEY]: `${p}_T_${alias(name)}` },
				ts: `Record<string, ${p}_T_${alias(name)}>`
			});
		}
		case 'set': {
			if (!t.class) fail(`${where}: set without a class`);
			if (!['string', 'enum', 'objectId'].includes(t.class.type)) fail(`${where}: set of ${t.class.type}`);
			return orNull(t, { ark: { [SAFE_KEY]: 'true' }, ts: 'Record<string, true>' });
		}
		case 'map': {
			if (!t.keyClass || !t.valueClass) fail(`${where}: map without classes`);
			if (!['string', 'objectId', 'enum'].includes(t.keyClass.type))
				fail(`${where}: map key ${t.keyClass.type}`);
			const value = def(t.valueClass, mode, `${where}{}`);
			return orNull(t, { ark: { [SAFE_KEY]: value.ark }, ts: `Record<string, ${value.ts}>` });
		}
		default:
			fail(`${where}: unknown kind ${t.type}`);
	}
}

type Body = { ark: Record<string, unknown>; ts: string };

function body(schemaName: string, mode: Mode, withId: boolean, discriminator?: string): Body {
	const ark: Record<string, unknown> = {};
	const ts: string[] = [];
	if (withId) {
		ark.id = 'string > 0';
		ts.push('id: string');
	}
	if (discriminator) {
		ark['@type'] = `'${discriminator}'`;
		ts.push(`'@type': '${discriminator}'`);
	}
	if (schemaName !== '<empty>') {
		const fields = schema.fields[schemaName];
		if (!fields) fail(`no fields for ${schemaName}`);
		for (const [name, property] of Object.entries(fields.properties)) {
			if (mode === 'update' && property.update !== 'mutable') continue;
			if (mode === 'create' && property.update === 'serverSet') continue;
			if (!['mutable', 'immutable', 'serverSet'].includes(property.update))
				fail(`${schemaName}.${name}: update ${property.update}`);
			const g = def(property.type, mode, `${schemaName}.${name}`);
			ark[`${name}?`] = g.ark;
			ts.push(`${JSON.stringify(name)}?: ${g.ts}`);
		}
	}
	return { ark, ts: `{ ${ts.join('; ')} }` };
}

/** Schemas a registry object can contain, directly or nested. Standard JMAP types are not among them. */
function reachableFrom(roots: string[]): Set<string> {
	const seen = new Set<string>();
	const visitType = (t: TypeDef) => {
		const name = t.objectName;
		if ((t.type === 'object' || t.type === 'objectList') && name) visitSchema(name);
		if (t.class) visitType(t.class);
		if (t.valueClass) visitType(t.valueClass);
	};
	const visitSchema = (name: string) => {
		if (seen.has(name)) return;
		seen.add(name);
		const s = schema.schemas[name];
		if (!s) fail(`unknown schema ${name}`);
		const names =
			s.type === 'single' ? [s.schemaName] : s.variants.flatMap((v) => (v.schemaName ? [v.schemaName] : []));
		for (const n of names) {
			const f = schema.fields[n];
			if (!f) fail(`no fields for ${n}`);
			for (const p of Object.values(f.properties)) visitType(p.type);
		}
	};
	for (const r of roots) visitSchema(r);
	return seen;
}

/** Every alias for one mode: one per schema, one per variant, and an `item_` form with the id. */
function aliasesFor(mode: Mode): Map<string, Gen> {
	const p = P[mode];
	const out = new Map<string, Gen>();
	for (const [name, s] of Object.entries(schema.schemas)) {
		if (!included.has(name)) continue;
		const item = roots.has(name) && mode === 'read';
		if (s.type === 'single') {
			const plain = body(s.schemaName, mode, false);
			out.set(`${p}_T_${alias(name)}`, { ark: plain.ark, ts: plain.ts });
			if (item) {
				const withId = body(s.schemaName, mode, true);
				out.set(`${p}_item_${alias(name)}`, { ark: withId.ark, ts: withId.ts });
			}
		} else {
			const plain: string[] = [];
			const withId: string[] = [];
			for (const v of s.variants) {
				const sn = v.schemaName ?? '<empty>';
				const a = `${p}_V_${alias(name)}_${v.name}`;
				const b = body(sn, mode, false, v.name);
				out.set(a, { ark: b.ark, ts: b.ts });
				plain.push(a);
				if (item) {
					const ai = `${p}_VI_${alias(name)}_${v.name}`;
					const bi = body(sn, mode, true, v.name);
					out.set(ai, { ark: bi.ark, ts: bi.ts });
					withId.push(ai);
				}
			}
			out.set(`${p}_T_${alias(name)}`, { ark: plain.join(' | '), ts: plain.join(' | ') });
			if (item) out.set(`${p}_item_${alias(name)}`, { ark: withId.join(' | '), ts: withId.join(' | ') });
		}
	}
	return out;
}

/** A runtime definition as source, on one line; the safe-key pattern is a shared constant. */
function render(value: unknown): string {
	if (typeof value === 'string') return JSON.stringify(value);
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 1 && entries[0][0] === '__or') {
			const [obj, nul] = entries[0][1] as [Record<string, unknown>, string];
			return `[${render(obj)}, '|', ${JSON.stringify(nul)}]`;
		}
		return `{${entries.map(([k, v]) => `${k === SAFE_KEY ? '[K]' : JSON.stringify(k)}: ${render(v)}`).join(',')}}`;
	}
	return String(value);
}

const objects = Object.entries(schema.objects)
	.filter(([key, o]) => key.startsWith('x:') && (o.type === 'object' || o.type === 'singleton'))
	.map(([key, o]) => ({ key, name: key.slice(2), singleton: o.type === 'singleton' }))
	.sort((a, b) => a.name.localeCompare(b.name));
for (const o of objects) if (!schema.schemas[o.key]) fail(`object ${o.key} has no schema`);
const roots = new Set(objects.map((o) => o.key));
const included = reachableFrom([...roots]);

const enterprise = Object.values(schema.fields)
	.flatMap((f) => Object.values(f.properties))
	.filter((p) => p.enterprise).length;

const all = [...aliasesFor('read'), ...aliasesFor('create'), ...aliasesFor('update')];
const enums = [...enumsUsed].sort();
const banner = [
	'// Generated by scripts/emit-registry.ts from resources/schema/schema.json.gz. Do not edit.',
	'// Rules and what is deliberately not checked: see the header of that script.',
	`// ${objects.length} registry objects; ${enterprise} properties are flagged enterprise in the schema.`
];

// --- the TypeScript types (compile time only) ---
const typeLines = [...banner, ''];
for (const name of enums) {
	typeLines.push(
		`export type E_${alias(name)} = ${enumValues(name)
			.map((v) => JSON.stringify(v))
			.join(' | ')};`
	);
}
for (const [name, g] of all) typeLines.push(`export type ${name} = ${g.ts};`);
typeLines.push('');

// --- the runtime definitions ---
const runLines = [
	...banner,
	"import { scope, type Type, type } from 'arktype';",
	"import type * as T from './registry.types.generated';",
	'',
	'// A scope this size cannot be type-checked by TypeScript ("excessively deep"), so it is typed as',
	'// the plain lookup it is. Each exported contract is then given its exact type with `.as<T>()`,',
	'// where T comes from the same traversal as these definitions.',
	'const makeScope = scope as unknown as (defs: object) => { type(name: string): Type<unknown> };',
	'',
	'// Keys of sets, maps and lists: anything but the three names that can reach a prototype.',
	`const K = ${JSON.stringify(SAFE_KEY)};`,
	'',
	'const types = makeScope({'
];
for (const [name, g] of all) runLines.push(`${name}:${render(g.ark)},`);
for (const name of enums)
	runLines.push(
		`E_${alias(name)}:type.enumerated(${enumValues(name)
			.map((v) => JSON.stringify(v))
			.join(',')}),`
	);
runLines.push('});', '');
runLines.push(
	'// Building every alias at once takes ~10 s; one is built the first time it is asked for (~10 ms).',
	"// Unknown keys are deleted at every depth (ArkType's own `onDeepUndeclaredKey`).",
	'const memo = <X>(make: () => Type<X>): (() => Type<X>) => {',
	'\tlet made: Type<X> | undefined;',
	'\treturn () => (made ??= make());',
	'};',
	'const build = (name: string) => types.type(name).onDeepUndeclaredKey("delete");',
	'',
	'/** Every registry object: how to read, create and change it. Each contract is built on first use. */',
	'export const registry = {'
);
for (const o of objects) {
	const a = alias(o.key);
	runLines.push(
		`\t${JSON.stringify(o.name)}: { singleton: ${o.singleton}, read: memo(() => build('r_item_${a}').as<T.r_item_${a}>()), create: memo(() => build('c_T_${a}').as<T.c_T_${a}>()), update: memo(() => build('u_T_${a}').as<T.u_T_${a}>()) },`
	);
}
runLines.push('} as const;', 'export type RegistryName = keyof typeof registry;', '');

const outputs: [string, string][] = [
	[runtimePath, runLines.join('\n')],
	[typesPath, typeLines.join('\n')]
];

if (process.argv.includes('--check')) {
	let stale = false;
	for (const [path, text] of outputs) {
		let current = '';
		try {
			current = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
		} catch {
			// missing counts as stale
		}
		if (current !== text) {
			console.error(`${path} is stale: run \`npm run registry\``);
			stale = true;
		}
	}
	if (stale) process.exit(1);
	console.log('registry contracts are current');
} else {
	for (const [path, text] of outputs) writeFileSync(path, text);
	console.log(
		`registry contracts: ${objects.length} objects, ${included.size} schemas, ${all.length} aliases, ${enums.length} enums`
	);
}
