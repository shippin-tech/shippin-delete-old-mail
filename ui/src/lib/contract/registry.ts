// Client for /api/v1/registry (a thin REST facade over native JMAP; api/DESIGN.md).
//
// What it promises:
//  - What goes out is checked against the generated create/update contract first. A value the
//    contract refuses is never sent; the refusal has the same Problem shape a server refusal has.
//  - What comes back is checked against the generated read contract. Undeclared keys are dropped
//    at every depth, so the app only sees what the schema names.
//  - The HTTP status decides success or failure; the body is then checked for that outcome.
//  - Nothing throws. A network failure is a Problem too.
import { type Type, type } from 'arktype';
import { type RegistryName, registry } from './registry.generated';
import { fieldMessages, localProblem, type Parsed, type Problem, parseResponse } from './v1';

type Registry = typeof registry;
type Read<N extends RegistryName> = ReturnType<Registry[N]['read']>['infer'];
type Create<N extends RegistryName> = ReturnType<Registry[N]['create']>['infer'];
type Update<N extends RegistryName> = ReturnType<Registry[N]['update']>['infer'];

export type Page<T> = { items: T[]; position: number; total?: number };
export type ListOptions = { limit?: number; position?: number; filter?: Record<string, unknown> };

export type ClientOptions = {
	/** The Authorization header value, or nothing when signed out. */
	authorization: () => string | undefined;
	fetch?: typeof fetch;
	base?: string;
};

const asProblem = (errors: type.errors): Problem =>
	localProblem(
		'invalid-input',
		'That was not sent: it is not valid',
		422,
		errors.summary,
		fieldMessages(errors)
	);

/** The page envelope around a read contract. Built per call: it is two keys and one array. */
function pageOf<T>(item: Type<T>) {
	return type({
		items: item.array(),
		position: 'number.integer >= 0',
		'total?': 'number.integer >= 0'
	}).onDeepUndeclaredKey('delete');
}

/**
 * The one place a generic object name is related to its generated contracts. TypeScript cannot
 * follow `registry[name]` through 117 differently-typed entries, so the entry is read as the
 * shape every entry has. What is checked at run time is exactly what the generator emitted.
 */
function contractsOf<N extends RegistryName>(name: N) {
	const entry = registry[name] as unknown as {
		read: () => Type<Read<N>>;
		create: () => Type<Create<N>>;
		update: () => Type<Update<N>>;
	};
	return entry;
}

export function registryClient(options: ClientOptions) {
	const doFetch = options.fetch ?? fetch;
	const base = options.base ?? '/api/v1/registry';

	async function send<T>(
		method: string,
		path: string,
		schema: Type<T> | null,
		payload?: unknown
	): Promise<Parsed<Type<T>['infer'] | undefined>> {
		const headers: Record<string, string> = { Accept: 'application/json' };
		const authorization = options.authorization();
		if (authorization) headers.Authorization = authorization;
		let body: string | undefined;
		if (payload !== undefined) {
			headers['Content-Type'] = 'application/json';
			body = JSON.stringify(payload);
		}
		let response: Response;
		try {
			response = await doFetch(`${base}${path}`, {
				method,
				headers,
				body,
				cache: 'no-store',
				credentials: 'same-origin'
			});
		} catch {
			return { ok: false, problem: localProblem('network-error', 'The server could not be reached', 503) };
		}
		const text = response.status === 204 ? '' : await response.text().catch(() => '');
		let parsed: unknown = null;
		if (text) {
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = null;
			}
		}
		return parseResponse(schema, response.status, parsed);
	}

	const where = (name: string, id?: string) =>
		`/${encodeURIComponent(name)}${id === undefined ? '' : `/${encodeURIComponent(id)}`}`;

	return {
		/** A collection's records, one page. */
		async list<N extends RegistryName>(name: N, opts: ListOptions = {}): Promise<Parsed<Page<Read<N>>>> {
			const read = contractsOf(name).read();
			const query = new URLSearchParams();
			if (opts.limit !== undefined) query.set('limit', String(opts.limit));
			if (opts.position !== undefined) query.set('position', String(opts.position));
			if (opts.filter) query.set('filter', JSON.stringify(opts.filter));
			const suffix = query.size ? `?${query}` : '';
			return send('GET', `${where(name)}${suffix}`, pageOf(read)) as Promise<Parsed<Page<Read<N>>>>;
		},

		/** One record; for a singleton object, omit the id. */
		async get<N extends RegistryName>(name: N, id?: string): Promise<Parsed<Read<N>>> {
			return send('GET', where(name, id), contractsOf(name).read()) as Promise<Parsed<Read<N>>>;
		},

		async create<N extends RegistryName>(name: N, input: Create<N>): Promise<Parsed<Read<N>>> {
			const contracts = contractsOf(name);
			const checked = contracts.create()(input);
			if (checked instanceof type.errors) return { ok: false, problem: asProblem(checked) };
			return send('POST', where(name), contracts.read(), checked) as Promise<Parsed<Read<N>>>;
		},

		/** Changes the named properties. For a singleton object, omit the id. */
		async update<N extends RegistryName>(
			name: N,
			id: string | undefined,
			patch: Update<N>
		): Promise<Parsed<Read<N>>> {
			const contracts = contractsOf(name);
			const checked = contracts.update()(patch);
			if (checked instanceof type.errors) return { ok: false, problem: asProblem(checked) };
			return send('PATCH', where(name, id), contracts.read(), checked) as Promise<Parsed<Read<N>>>;
		},

		async remove(name: RegistryName, id: string): Promise<Parsed<undefined>> {
			return send('DELETE', where(name, id), null) as Promise<Parsed<undefined>>;
		}
	};
}
