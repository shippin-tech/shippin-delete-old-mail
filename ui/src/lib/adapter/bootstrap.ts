import { bootstrapPatch, credentialLines, type FinishResult } from '../portal/bootstrap';
import { client, refusal } from './registry-facade';

export async function loadBootstrap(): Promise<Record<string, unknown>[]> {
	const { c } = await client();
	const result = await c.get('Bootstrap');
	if (result.ok) return [result.value];
	if (result.problem.status === 404 && result.problem.type === 'notFound') return [];
	throw refusal(result.problem);
}

type BootstrapStep = { fields: readonly { name: string; kind: string }[] };

export async function completeBootstrap(
	steps: readonly BootstrapStep[],
	values: Record<string, string | boolean>
): Promise<FinishResult> {
	const { c } = await client();
	const patch = bootstrapPatch(steps, values);
	const result = await c.any.update('Bootstrap', undefined, patch);
	if (!result.ok) throw refusal(result.problem);
	return { status: 'saved', credentials: credentialLines(result.value) };
}
