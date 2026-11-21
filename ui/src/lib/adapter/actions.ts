import { actionCreate } from './action-call';
import { client, refusal } from './registry-facade';

export async function executeAction(
	name: string,
	parameters: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const { c } = await client();
	const result = await c.executeAction(actionCreate(name, parameters));
	if (!result.ok) throw refusal(result.problem);
	return result.value;
}
